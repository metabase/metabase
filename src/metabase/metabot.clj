(ns metabase.metabot
  "The core metabot namespace. Consists primarily of functions named infer-X,
  where X is the thing we want to extract from the bot response."
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.generator :as mg]
   [malli.json-schema :as mjs]
   [malli.transform :as mtx]
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
  (mc/schema
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
         [:map [:value [:or :int :double :string]]]]]]]
     [:limit
      {:optional true}
      pos-int?]
     [:order-by
      {:title       "Sort order"
       :description "A sequential set of fields that determine the sort order of the data"
       :optional    true}
      [:tuple
       [:enum :asc :desc]
       :metabot/available_fields]]]))

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

(defn add-field-data [{:keys [result_metadata] :as model}]
  (let [available-fields    {:available_fields (mapv #(select-keys % [:id :name]) result_metadata)}
        field-id->field-ref (zipmap
                              (map :id result_metadata)
                              (map :field_ref result_metadata))]
    (-> model
        (assoc :available_fields available-fields)
        (assoc :field-id->field-ref field-id->field-ref)
        (assoc :mbql_malli_schema (schema available-fields)))))

(defn- postprocess-result
  [{model-id :id :keys [field-id->field-ref mbql_malli_schema database_id]}
   json-response]
  (let [{:keys [breakout aggregation filters]
         :as   coerced-response} (mc/coerce mbql_malli_schema json-response mtx/json-transformer)]
    (if (mc/validate mbql_malli_schema coerced-response)
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
                                               (let [{:keys [field_id value]} m]
                                                 [op
                                                  (field-id->field-ref id)
                                                  (if field_id
                                                    (field-id->field-ref field_id)
                                                    value)]))
                                             filters))))]
        (tap> inner-mbql)
        {:database database_id
         :type     :query
         :query    inner-mbql})
      {:fail coerced-response})))

(defn- ->prompt
  "Returns {:messages [{:role ... :content ...} ...]} prompt map for use in API calls."
  [& role-content-pairs]
  {:messages (for [[role content] role-content-pairs]
               {:role (name role)
                :content (if (sequential? content)
                           (str/join "\n" content)
                           content)})})

(defn- json-block
  "Returns Markdown-style code block string with x encoded as JSON"
  [x]
  (str "\n```\n" (json/generate-string x) "\n```\n"))

(defn infer-mbql
  "Returns MBQL query from natural language user prompt"
  [user_prompt model]
  (let [{:keys [available_fields mbql_malli_schema] :as new-model} (add-field-data model)
        json-schema   (mjs/transform mbql_malli_schema)
        prompt        (->prompt
                       [:system ["You are a Metabase query generation assistant. You respond to user queries by building a JSON object that conforms to the schema:"
                                 (json-block json-schema)
                                 "A JSON description of the fields available in the user's data model:"
                                 (json-block available_fields)
                                 "Take a natural-language query from the user and construct a query using the supplied schema and available fields."]]
                       [:user user_prompt])
        json-response (metabot-util/find-result
                       (fn [message]
                         (tap> message)
                         (metabot-util/extract-json message))
                       (metabot-client/invoke-metabot prompt))]
    (tap> json-response)
    (try
      (postprocess-result new-model json-response)
      (catch Exception _
        {:fail   json-response
         :reason :invalid-response}))))

(comment
  ;; This works pretty well
  (let [{:keys [fail] :as mbql} (infer-mbql
                                 "Provide descriptive stats for sales per state"
                                 (t2/select-one 'Card :id 1))]
    (if fail
      fail
      {:mbql mbql
       :data (qp/process-query mbql)}))

  (let [{:keys [fail] :as mbql} (infer-mbql
                                 "What are the 10 highest rated products?"
                                 (t2/select-one 'Card :id 1))]
    (if fail
      [:fail fail]
      mbql))

  (let [{:keys [fail] :as mbql} (infer-mbql
                                 "What products have a rating greater than 2.0?"
                                 (t2/select-one 'Card :id 1))]
    (if fail
      [:fail fail]
      mbql))

  (let [{:keys [fail] :as mbql} (infer-mbql
                                 "How many sales were in Idaho?"
                                 (t2/select-one 'Card :id 1))]
    (if fail
      fail
      {:mbql mbql
       :data (update-in (qp/process-query mbql) [:data :rows] (fn [rows] (take 10 rows)))}))

  (let [{:keys [available_fields field-id->field-ref mbql_malli_schema database_id]} (add-field-data (t2/select-one 'Card :id 1))
        json-response {:aggregation [["count" 53]]
                       :breakout    [53]
                       :filters     [["=" 53 {:value "Idaho"}]]}]
    ;(m/coerce mbql_malli_schema json-response mt/json-transformer)
    (mg/generate mbql_malli_schema)
    )

  )
