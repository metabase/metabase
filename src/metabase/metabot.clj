(ns metabase.metabot
  "The core metabot namespace. Consists primarily of functions named infer-X,
  where X is the thing we want to extract from the bot response."
  (:require
    [cheshire.core :as json]
    [clojure.set :refer [rename-keys]]
    [metabase.lib.native :as lib-native]
    [metabase.metabot.client :as metabot-client]
    [metabase.metabot.settings :as metabot-settings]
    [metabase.metabot.util :as metabot-util]
    [metabase.models :refer [Table]]
    [metabase.query-processor :as qp]
    [metabase.util.log :as log]
    [toucan2.core :as t2]))

(defn infer-viz
  "Determine an 'interesting' visualization for this data."
  [{sql :sql :as context}]
  (log/infof "Metabot is inferring visualization for sql '%s'." sql)
  (if (metabot-settings/is-metabot-enabled)
    (if (metabot-util/select-all? sql)
      ;; A SELECT * query just short-circuits to a tabular display
      {:template {:display                :table
                  :visualization_settings {}}}
      ;; More interesting SQL merits a more interesting display
      (let [{:keys [prompt_template version] :as prompt} (metabot-util/create-prompt context)]
        {:template                (metabot-util/find-result
                                   (fn [message]
                                     (metabot-util/response->viz
                                      (json/parse-string message keyword)))
                                   (metabot-client/invoke-metabot prompt))
         :prompt_template_version (format "%s:%s" prompt_template version)}))
    (log/warn "Metabot is not enabled")))

(defn infer-sql
  "Given a model and prompt, attempt to generate a native dataset."
  [{:keys [model user_prompt] :as context}]
  (log/infof "Metabot is inferring sql for model '%s' with prompt '%s'." (:id model) user_prompt)
  (if (metabot-settings/is-metabot-enabled)
    (let [{:keys [prompt_template version] :as prompt} (metabot-util/create-prompt context)
          {:keys [database_id inner_query]} model]
      (if-some [bot-sql (metabot-util/find-result
                         metabot-util/extract-sql
                         (metabot-client/invoke-metabot prompt))]
        (let [final-sql     (metabot-util/bot-sql->final-sql model bot-sql)
              _             (log/infof "Inferred sql for model '%s' with prompt '%s':\n%s"
                                       (:id model)
                                       user_prompt
                                       final-sql)
              template-tags (lib-native/extract-template-tags inner_query)
              dataset       {:dataset_query          {:database database_id
                                                      :type     "native"
                                                      :native   {:query         final-sql
                                                                 :template-tags template-tags}}
                             :display                :table
                             :visualization_settings {}}]
          {:card                     dataset
           :prompt_template_versions (vec
                                      (conj
                                       (:prompt_template_versions model)
                                       (format "%s:%s" prompt_template version)))
           :bot-sql                  bot-sql})
        (log/infof "No sql inferred for model '%s' with prompt '%s'." (:id model) user_prompt)))
    (log/warn "Metabot is not enabled")))

(defn match-best-model
  "Find the model in the db that best matches the prompt using embedding matching."
  [{{database-id :id :keys [models]} :database :keys [user_prompt]}]
  (log/infof "Metabot is inferring model for database '%s' with prompt '%s'." database-id user_prompt)
  (if (metabot-settings/is-metabot-enabled)
    (let [models (->> models
                      (map (fn [{:keys [create_table_ddl] :as model}]
                             (let [{:keys [prompt embedding tokens]} (metabot-client/create-embedding create_table_ddl)]
                               (assoc model
                                      :prompt prompt
                                      :embedding embedding
                                      :tokens tokens)))))]
      (if-some [{best-mode-name :name
                 best-model-id  :id
                 :as            model} (metabot-util/best-prompt-object models user_prompt)]
        (do
          (log/infof "Metabot selected best model for database '%s' with prompt '%s' as '%s' (%s)."
                     database-id user_prompt best-model-id best-mode-name)
          model)
        (log/infof "No model inferred for database '%s' with prompt '%s'." database-id user_prompt)))
    (log/warn "Metabot is not enabled")))

(defn infer-model
  "Find the model in the db that best matches the prompt. Return nil if no good model found."
  [{{database-id :id :keys [models]} :database :keys [user_prompt] :as context}]
  (log/infof "Metabot is inferring model for database '%s' with prompt '%s'." database-id user_prompt)
  (if (metabot-settings/is-metabot-enabled)
    (let [{:keys [prompt_template version] :as prompt} (metabot-util/create-prompt context)
          ids->models   (zipmap (map :id models) models)
          candidates    (set (keys ids->models))
          best-model-id (metabot-util/find-result
                         (fn [message]
                           (some->> message
                                    (re-seq #"\d+")
                                    (map parse-long)
                                    (some candidates)))
                         (metabot-client/invoke-metabot prompt))]
      (if-some [model (ids->models best-model-id)]
        (do
          (log/infof "Metabot selected best model for database '%s' with prompt '%s' as '%s'."
                     database-id user_prompt best-model-id)
          (update model
                  :prompt_template_versions
                  (fnil conj [])
                  (format "%s:%s" prompt_template version)))
        (log/infof "No model inferred for database '%s' with prompt '%s'." database-id user_prompt)))
    (log/warn "Metabot is not enabled")))

(defn infer-native-sql-query
  "Given a database and user prompt, determine a sql query to answer my question."
  [{{database-id :id} :database
    :keys             [user_prompt prompt_template_versions] :as context}]
  (log/infof "Metabot is inferring sql for database '%s' with prompt '%s'." database-id user_prompt)
  (if (metabot-settings/is-metabot-enabled)
    (let [prompt-objects (->> (t2/select [Table :name :schema :id] :db_id database-id)
                              (map metabot-util/memoized-create-table-embedding)
                              (filter identity))
          ddl            (metabot-util/generate-prompt prompt-objects user_prompt)
          context        (assoc-in context [:database :create_database_ddl] ddl)
          {:keys [prompt_template version] :as prompt} (metabot-util/create-prompt context)]
      (if-some [sql (metabot-util/find-result
                      metabot-util/extract-sql
                      (metabot-client/invoke-metabot prompt))]
        {:sql                      sql
         :prompt_template_versions (conj
                                     (vec prompt_template_versions)
                                     (format "%s:%s" prompt_template version))}
        (log/infof "No sql inferred for database '%s' with prompt '%s'." database-id user_prompt)))
    (log/warn "Metabot is not enabled")))

(defn infer-card-summary
  "...."
  [{:keys     [display visualization_settings dataset_query result_metadata]}]
  (let [{:keys [] :as res} (qp/process-query dataset_query)
        sql         (get-in res [:data :native_form :query])
        visualization_settings (reduce-kv
                                 (fn [acc k v]
                                   (cond-> acc
                                     (some? v)
                                     (assoc k v)))
                                 {}
                                 visualization_settings)
        description (cond->
                      {:sql_query           sql
                       :display_type        display
                       :column_descriptions (zipmap
                                              (map (some-fn :display_name :name) result_metadata)
                                              (map (some-fn :semantic_type :effective_type) result_metadata))
                       :friendly_title      "%%FILL_THIS_TITLE_IN%%"
                       :friendly_summary    "%%FILL_THIS_SUMMARY_IN%%"}
                      (seq visualization_settings)
                      (assoc :visualization_settings visualization_settings))
        json-str (json/generate-string description)]
    {:summary
       (metabot-util/find-result
         (fn [rsp] (-> rsp
                       (json/parse-string true)
                       (rename-keys {:friendly_title :title
                                     :friendly_summary :description})))
         (metabot-client/invoke-metabot
           {:messages [{:role    "system"
                        :content "You are a helpful assistant that fills in the missing \"friendly_title\" and
                        \"friendly_summary\" keys in a json fragment. You like to occasionally use emojis to express
                        yourself but are otherwise very serious and professional."}
                       {:role    "assistant"
                        :content (cond-> "The \"display\" key is how I intend to present the final data."
                                   (seq visualization_settings)
                                   (str " The \"visualization_settings key has chart settings."))}
                       {:role    "assistant"
                        :content "The parts you replace are \"%%FILL_THIS_TITLE_IN%%\" and \"%%FILL_THIS_SUMMARY_IN%%\"."}
                       {:role    "assistant"
                        :content "Just return a json map with the \"friendly_title\" and \"friendly_summary\" fields and nothing else."}
                       {:role    "assistant"
                        :content "The \"friendly_title\" must be no more than 64 characters long."}
                       {:role    "user"
                        :content json-str}]}))}))

(comment
  (infer-card-summary
    {:name                   "TRASHME: Bgg, 5 rows",
     :dataset_query          {:database 7, :type "query", :query {:source-table 34, :limit 5}},
     :display                "table",
     :description            nil,
     :visualization_settings {:table.pivot_column "Domains", :table.cell_column "YearPublished"},
     :collection_id          nil,
     :collection_position    nil,
     :result_metadata
     [{:description        nil,
       :semantic_type      "type/PK",
       :coercion_strategy  nil,
       :name               "ID",
       :settings           nil,
       :fk_target_field_id nil,
       :field_ref          ["field" 243 nil],
       :effective_type     "type/Integer",
       :id                 243,
       :visibility_type    "normal",
       :display_name       "ID",
       :fingerprint        nil,
       :base_type          "type/Integer"}
      {:description        nil,
       :semantic_type      "type/Name",
       :coercion_strategy  nil,
       :name               "Name",
       :settings           nil,
       :fk_target_field_id nil,
       :field_ref          ["field" 246 nil],
       :effective_type     "type/Text",
       :id                 246,
       :visibility_type    "normal",
       :display_name       "Name",
       :fingerprint
       {:global {:distinct-count 9904, :nil% 0},
        :type
        {:type/Text {:percent-json 0, :percent-url 0, :percent-email 0, :percent-state 6.0E-4, :average-length 19.0383}}},
       :base_type          "type/Text"}
      {:description        nil,
       :semantic_type      nil,
       :coercion_strategy  nil,
       :name               "YearPublished",
       :settings           nil,
       :fk_target_field_id nil,
       :field_ref          ["field" 241 nil],
       :effective_type     "type/Integer",
       :id                 241,
       :visibility_type    "normal",
       :display_name       "YearPublished",
       :fingerprint
       {:global {:distinct-count 128, :nil% 0},
        :type
        {:type/Number
         {:min -3500, :q1 2005.1838238176017, :q3 2017.2176553834015, :max 2022, :sd 149.9845461325682, :avg 1999.7106}}},
       :base_type          "type/Integer"}
      {:description        nil,
       :semantic_type      "type/Category",
       :coercion_strategy  nil,
       :name               "MinPlayers",
       :settings           nil,
       :fk_target_field_id nil,
       :field_ref          ["field" 235 nil],
       :effective_type     "type/Integer",
       :id                 235,
       :visibility_type    "normal",
       :display_name       "MinPlayers",
       :fingerprint
       {:global {:distinct-count 10, :nil% 0},
        :type
        {:type/Number
         {:min 0, :q1 1.461516308891888, :q3 2.387201102281876, :max 9, :sd 0.6916283286379308, :avg 1.9553}}},
       :base_type          "type/Integer"}
      {:description        nil,
       :semantic_type      nil,
       :coercion_strategy  nil,
       :name               "MaxPlayers",
       :settings           nil,
       :fk_target_field_id nil,
       :field_ref          ["field" 244 nil],
       :effective_type     "type/Integer",
       :id                 244,
       :visibility_type    "normal",
       :display_name       "MaxPlayers",
       :fingerprint
       {:global {:distinct-count 39, :nil% 0},
        :type
        {:type/Number
         {:min 0,
          :q1  3.251746118456863,
          :q3  5.571939938436997,
          :max 999,
          :sd  16.378081147198117,
          :avg 5.404700000000002}}},
       :base_type          "type/Integer"}
      {:description        nil,
       :semantic_type      nil,
       :coercion_strategy  nil,
       :name               "PlayTime",
       :settings           nil,
       :fk_target_field_id nil,
       :field_ref          ["field" 237 nil],
       :effective_type     "type/Integer",
       :id                 237,
       :visibility_type    "normal",
       :display_name       "PlayTime",
       :fingerprint
       {:global {:distinct-count 102, :nil% 0},
        :type
        {:type/Number
         {:min 0,
          :q1  30.95717526316125,
          :q3  104.89542006076091,
          :max 22500,
          :sd  469.7325135804199,
          :avg 116.61609999999997}}},
       :base_type          "type/Integer"}
      {:description        nil,
       :semantic_type      "type/Category",
       :coercion_strategy  nil,
       :name               "MinAge",
       :settings           nil,
       :fk_target_field_id nil,
       :field_ref          ["field" 238 nil],
       :effective_type     "type/Integer",
       :id                 238,
       :visibility_type    "normal",
       :display_name       "MinAge",
       :fingerprint
       {:global {:distinct-count 19, :nil% 0},
        :type
        {:type/Number
         {:min 0,
          :q1  8.328090257270816,
          :q3  12.465215164151788,
          :max 21,
          :sd  3.364703534189498,
          :avg 10.273500000000002}}},
       :base_type          "type/Integer"}
      {:description        nil,
       :semantic_type      nil,
       :coercion_strategy  nil,
       :name               "UsersRated",
       :settings           nil,
       :fk_target_field_id nil,
       :field_ref          ["field" 234 nil],
       :effective_type     "type/Integer",
       :id                 234,
       :visibility_type    "normal",
       :display_name       "UsersRated",
       :fingerprint
       {:global {:distinct-count 2921, :nil% 0},
        :type
        {:type/Number
         {:min 30,
          :q1  258.18136639203186,
          :q3  1056.1149935920728,
          :max 102214,
          :sd  4858.328089414978,
          :avg 1581.5515000000014}}},
       :base_type          "type/Integer"}
      {:description        nil,
       :semantic_type      "type/Score",
       :coercion_strategy  nil,
       :name               "RatingAverage",
       :settings           nil,
       :fk_target_field_id nil,
       :field_ref          ["field" 236 nil],
       :effective_type     "type/Decimal",
       :id                 236,
       :visibility_type    "normal",
       :display_name       "RatingAverage",
       :fingerprint
       {:global {:distinct-count 334, :nil% 0}, :type {:type/Number {:min 8, :q1 8, :q3 8, :max 8, :sd nil, :avg 8}}},
       :base_type          "type/Decimal"}
      {:description        nil,
       :semantic_type      nil,
       :coercion_strategy  nil,
       :name               "BGGRank",
       :settings           nil,
       :fk_target_field_id nil,
       :field_ref          ["field" 240 nil],
       :effective_type     "type/Integer",
       :id                 240,
       :visibility_type    "normal",
       :display_name       "BGGRank",
       :fingerprint
       {:global {:distinct-count 10001, :nil% 0},
        :type
        {:type/Number
         {:min 1, :q1 2492.596151579445, :q3 7501.657019374749, :max 10001, :sd 2886.7864571239297, :avg 5001.2771}}},
       :base_type          "type/Integer"}
      {:description        nil,
       :semantic_type      nil,
       :coercion_strategy  nil,
       :name               "ComplexityAverage",
       :settings           nil,
       :fk_target_field_id nil,
       :field_ref          ["field" 242 nil],
       :effective_type     "type/Decimal",
       :id                 242,
       :visibility_type    "normal",
       :display_name       "ComplexityAverage",
       :fingerprint
       {:global {:distinct-count 375, :nil% 0},
        :type
        {:type/Number
         {:min 0,
          :q1  1.1669535764784056,
          :q3  2.466210140963133,
          :max 4,
          :sd  0.9024563318952951,
          :avg 1.8422509225092252}}},
       :base_type          "type/Decimal"}
      {:description        nil,
       :semantic_type      nil,
       :coercion_strategy  nil,
       :name               "OwnedUsers",
       :settings           nil,
       :fk_target_field_id nil,
       :field_ref          ["field" 247 nil],
       :effective_type     "type/Integer",
       :id                 247,
       :visibility_type    "normal",
       :display_name       "OwnedUsers",
       :fingerprint
       {:global {:distinct-count 3875, :nil% 0},
        :type
        {:type/Number
         {:min 6,
          :q1  552.3265927414272,
          :q3  1980.102521985435,
          :max 155312,
          :sd  6923.0256478107085,
          :avg 2565.5592355413246}}},
       :base_type          "type/Integer"}
      {:description        nil,
       :semantic_type      nil,
       :coercion_strategy  nil,
       :name               "Mechanics",
       :settings           nil,
       :fk_target_field_id nil,
       :field_ref          ["field" 239 nil],
       :effective_type     "type/Text",
       :id                 239,
       :visibility_type    "normal",
       :display_name       "Mechanics",
       :fingerprint
       {:global {:distinct-count 5109, :nil% 0},
        :type   {:type/Text {:percent-json 0, :percent-url 0, :percent-email 0, :percent-state 0, :average-length 58.8249}}},
       :base_type          "type/Text"}
      {:description        nil,
       :semantic_type      nil,
       :coercion_strategy  nil,
       :name               "Domains",
       :settings           nil,
       :fk_target_field_id nil,
       :field_ref          ["field" 245 nil],
       :effective_type     "type/Text",
       :id                 245,
       :visibility_type    "normal",
       :display_name       "Domains",
       :fingerprint
       {:global {:distinct-count 36, :nil% 0},
        :type   {:type/Text {:percent-json 0, :percent-url 0, :percent-email 0, :percent-state 0, :average-length 9.899}}},
       :base_type          "type/Text"}]}))
