(ns metabase.metabot
  "The core metabot namespace. Consists primarily of functions named infer-X,
  where X is the thing we want to extract from the bot response."
  (:require
    [cheshire.core :as json]
    [clojure.set :refer [rename-keys]]
    [clojure.walk :as walk]
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

(defn remove-nil-vals [m]
  (let [m' (reduce-kv
             (fn [acc k v]
               (cond-> acc
                 (some? v)
                 (assoc k v)))
             {}
             m)]
    (when (seq m') m')))

(defn infer-card-summary
  "Create a human-friendly summary of a card. Returns a map of the form:
  {:summary {:title \"Some inferred title\"
             :description \"Some inferred description\"}}"
  [{:keys [display visualization_settings dataset_query result_metadata]}]
  (let [{:keys [query]} (qp/compile-and-splice-parameters dataset_query)
        visualization_settings (remove-nil-vals visualization_settings)
        description            (cond->
                                 {:sql_query           query
                                  :display_type        display
                                  :column_descriptions (zipmap
                                                         (map (some-fn :display_name :name) result_metadata)
                                                         (map (some-fn :semantic_type :effective_type) result_metadata))
                                  :friendly_title      "%%FILL_THIS_TITLE_IN%%"
                                  :friendly_summary    "%%FILL_THIS_SUMMARY_IN%%"}
                                 visualization_settings
                                 (assoc :visualization_settings visualization_settings))
        json-str               (json/generate-string description)]
    {:summary
     (metabot-util/find-result
       (fn [rsp] (-> rsp
                     (json/parse-string true)
                     (rename-keys {:friendly_title   :title
                                   :friendly_summary :description})))
       (metabot-client/invoke-metabot
         {:messages
          [{:role    "system"
            :content "You are a helpful assistant that fills in the missing \"friendly_title\" and
                        \"friendly_summary\" keys in a json fragment. You like to occasionally use emojis to express
                        yourself but are otherwise very serious and professional."}
           {:role    "assistant"
            :content (cond-> "The \"display\" key is how I intend to present the final data."
                       (seq visualization_settings)
                       (str " The \"visualization_settings\" key has chart settings."))}
           {:role    "assistant"
            :content "The parts you replace are \"%%FILL_THIS_TITLE_IN%%\" and \"%%FILL_THIS_SUMMARY_IN%%\"."}
           {:role    "assistant"
            :content "Just return a json map with the \"friendly_title\" and \"friendly_summary\" fields and nothing else."}
           {:role    "assistant"
            :content "The \"friendly_title\" must be no more than 64 characters long."}
           {:role    "user"
            :content json-str}]}))}))

(defn infer-dashboard-summary
  "Create a human-friendly summary of a dashboard. Returns a map of the form:
  {:summary {:description \"Some inferred description\"}}"
  [dashboard-id]
  (let [{dashboard-name :name :keys [parameters dashcards] :as dashboard}
        (t2/hydrate (t2/select-one :model/Dashboard 54) [:dashcards
                                                         :card
                                                         :series
                                                         :dashcard/action
                                                         :dashcard/linkcard-info]
                    :tabs
                    :param_fields
                    :param_values)
        dashboard-summary
                 {:dashboard-name dashboard-name
                  :charts         (for [{:keys [card]} dashcards
                                        :let [{card-name :name
                                               :keys     [display visualization_settings parameter_mappings result_metadata]} card
                                              field-name->display-name (zipmap
                                                                         (map :name result_metadata)
                                                                         (map (some-fn :display_name :name) result_metadata))
                                              visualization_settings   (->> visualization_settings
                                                                            remove-nil-vals
                                                                            (walk/prewalk (fn [v] (field-name->display-name v v))))]]
                                    {:chart-name        card-name
                                     :chart-type        display
                                     :chart-settings    visualization_settings
                                     :data-column-names (vals field-name->display-name)})}
        json-str (json/generate-string dashboard-summary)]
    {:summary
     {:description
      (metabot-util/find-result
        identity
        (metabot-client/invoke-metabot
          {:messages
           [{:role    "system"
             :content "You are a helpful assistant that summarizes dashboards I am generating for my customers.
            I will provide you a json-encoded description of the dashboard and you will give me a one
            paragraph summary of what it does. Provide only the summary and nothing else"}
            {:role    "user"
             :content json-str}]}))}}))

(comment
  (infer-dashboard-summary 54)
  (let [{dashboard-name :name :keys [parameters dashcards] :as dashboard}
        param-id->param (zipmap
                          (map :id parameters)
                          (map #(select-keys [:name :type]) parameters))
        (t2/hydrate (t2/select-one :model/Dashboard 54) [:dashcards
                                                         :card
                                                         :series
                                                         :dashcard/action
                                                         :dashcard/linkcard-info]
                    :tabs
                    :param_fields
                    :param_values)]
    {:dashboard-name    dashboard-name
     :charts            (for [{:keys [card parameter_mappings] :as dcs} dashcards
                              :let [{card-name :name
                                     :keys     [display
                                                visualization_settings
                                                result_metadata]} card
                                    field-name->display-name (zipmap
                                                               (map :name result_metadata)
                                                               (map (some-fn :display_name :name) result_metadata))
                                    visualization_settings   (->> visualization_settings
                                                                  remove-nil-vals
                                                                  (walk/prewalk (fn [v] (field-name->display-name v v))))]]
                          {:chart-name        card-name
                           :chart-type        display
                           :chart-settings    visualization_settings
                           :data-column-names (vals field-name->display-name)
                           :param-mapping     parameter_mappings})
     :global-parameters (vals param-id->param)}))
