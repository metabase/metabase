(ns metabase.metabot
  "The core metabot namespace. Consists primarily of functions named infer-X,
  where X is the thing we want to extract from the bot response."
  (:require
    [cheshire.core :as json]
    [malli.core :as m]
    [malli.generator :as mg]
    [malli.json-schema :as mjs]
    [malli.transform :as mt]
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
              template-tags (lib-native/template-tags inner_query)
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

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn schema [available-fields]
  (m/schema
    [:map {:registry
           {:metabot/available_fields
            (into [:enum
                   {:title       "Field id"
                    :description "The id for a field to be used in the query"}]
                  (map :id (:available_fields available-fields)))
            :metabot/available_aggregations
            (into [:enum
                   {:title       "Aggregation"
                    :description "An aggregation that can be performed on data"}]
                  [:avg :count :count-where :distinct :max :median
                   :min :percentile :share :stddev :sum :sum-where :var])
            :metabot/operators
            (into [:enum
                   {:title       "Boolean operators"
                    :description "af"}]
                  [:< :<= := :>= :>])}}
     [:aggregation
      {:optional true}
      [:vector
       [:tuple {:title       "Aggregation"
                :description "A single aggregate operation over a field"}
        :metabot/available_aggregations :metabot/available_fields]]]
     [:breakout
      {:optional true}
      [:vector {:min 1} :metabot/available_fields]]
     [:filters
      {:optional true}
      [:vector
       [:tuple {:title       "Filter"
                :description "A boolean operation that can be used to filter results"}
        :metabot/operators
        :metabot/available_fields
        [:or
         [:map [:field_id :metabot/available_fields]]
         [:map [:int_val :int]]
         [:map [:double_val :double]]
         [:map [:string_val :string]]]]]]]))

(comment
  ;; This is useful for making sure the above schema is right
  (let [model               (t2/select-one 'Card :id 1)
        {model-id :id :keys [result_metadata database_id]} model
        available-fields    {:available_fields (mapv #(select-keys % [:id :name]) result_metadata)}
        field-id->field-ref (zipmap
                              (map :id result_metadata)
                              (map :field_ref result_metadata))
        malli-schema        (schema available-fields)]
    (mg/generate malli-schema)))

(defn infer-mbql [{:keys [model user_prompt] :as context}]
  (let [{model-id :id :keys [result_metadata database_id]} model
        available-fields    {:available_fields (mapv #(select-keys % [:id :name]) result_metadata)}
        field-id->field-ref (zipmap
                              (map :id result_metadata)
                              (map :field_ref result_metadata))
        malli-schema        (schema available-fields)
        json-schema         (mjs/transform malli-schema)
        prompt              {:messages
                             [{:role    "system"
                               :content "You are a pedantic assistant that provides schema-compliant json and nothing else."}
                              {:role "assistant" :content "This is my data:"}
                              {:role "assistant" :content (json/generate-string available-fields {:pretty true})}
                              {:role "assistant" :content "This is the json schema that the response MUST conform to:"}
                              {:role "assistant" :content (json/generate-string json-schema {:pretty true})}
                              {:role "assistant" :content "Only give me the generated json that conforms to the schema."}
                              {:role "user" :content user_prompt}]}
        json-response       (metabot-util/find-result
                              (fn [message]
                                (tap> message)
                                (metabot-util/extract-json message))
                              (metabot-client/invoke-metabot prompt))]
    (try
      (let [{:keys [breakout aggregation filters]
             :as   coerced-response} (m/coerce malli-schema json-response mt/json-transformer)]
        (if (m/validate malli-schema coerced-response)
          (let [inner-mbql (cond-> (assoc
                                     (select-keys coerced-response [:breakout :aggregation])
                                     :source-table (format "card__%s" model-id))
                             breakout
                             (update :breakout (partial mapv field-id->field-ref))
                             aggregation
                             (update :aggregation (partial mapv (fn [[op id]]
                                                                  [op (field-id->field-ref id)])))
                             filters
                             (update :filters (fn [filters]
                                                (mapv
                                                  (fn [[op id m]]
                                                    (let [{:keys [field_id
                                                                  int_val
                                                                  double_val
                                                                  string_val]} m]
                                                      [op
                                                       (field-id->field-ref id)
                                                       (if field_id
                                                         (field-id->field-ref field_id)
                                                         (or int_val
                                                             double_val
                                                             string_val))]))
                                                  filters))))]
            (tap> inner-mbql)
            {:database database_id
             :type     :query
             :query    inner-mbql})
          {:fail coerced-response}))
      (catch Exception e
        {:fail   json-response
         :reason :invalid-response}))))

(comment
  (let [{:keys [fail] :as mbql} (infer-mbql
                                  {:user_prompt "Provide descriptive stats for sales per state"
                                   :model       (t2/select-one 'Card :id 1)})]
    (if fail
      fail)
    {:mbql mbql
     :data (qp/process-query mbql)})

  (let [{:keys [fail] :as mbql} (infer-mbql
                                  {:user_prompt "How many sales were in Idaho?"
                                   :model       (t2/select-one 'Card :id 1)})]
    (if fail
      fail)
    {:mbql mbql
     :data (update-in (qp/process-query mbql) [:data :rows] (fn [rows] (take 10 rows)))})
  )

