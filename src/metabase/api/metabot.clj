(ns metabase.api.metabot
  (:require
   [clojure.string :as str]
   [compojure.core :refer [POST]]
   [metabase.api.common :as api]
   [metabase.db.query :as mdb.query]
   [metabase.models :refer [Card Collection Database Field FieldValues Table]]
   [metabase.models.persisted-info :as persisted-info]
   [metabase.models.setting :refer [defsetting]]
   [metabase.query-processor :as qp]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [toucan2.core :as t2]
   [wkok.openai-clojure.api :as openai.api]
   ))

(set! *warn-on-reflection* true)

(defsetting openai-api-key
  (deferred-tru "The OpenAI API Key.")
  :visibility :settings-manager)

(defsetting openai-organization
  (deferred-tru "The OpenAPI Organization ID.")
  :visibility :settings-manager)

(def bot-directions
  (str "You are a helpful assistant that writes SQL based on my input."
       "Don't explain your answer, just show me the SQL using Postgresql as the dialect."))

(defn- column-types
  "Given a model, provide a set of statements about each column type and display name."
  [{:keys [result_metadata]}]
  (map (fn [{:keys [name display_name description]}]
         (format "The column '%s' has a display name of '%s' and is described as '%s'"
                 name
                 display_name
                 description))
       result_metadata))

(defn- enumerated-values
  "Given a model, provide a set of statements about which values a column may take on."
  [{:keys [result_metadata]}]
  (for [{column-name :name :keys [id]} result_metadata
        :let [{:keys [values]} (t2/select-one FieldValues :field_id id)]
        :when (seq values)]
    (format "The column '%s' has these potential values: %s."
            column-name
            (str/join ", " (map (partial format "'%s'") values)))))

(defn model-messages
  "Given a model, provide a set of statements about this model, including:
   - The model name (called a table)
   - The types in each column and column aliases
   - What types the column may take on, if low cardinality"
  [{model-name :name :keys [result_metadata] :as model}]
  (let [col-names (str/join ", " (map (comp (partial format "'%s'") :name) result_metadata))]
    (map
     (fn [s] {:role "assistant" :content s})
     (reduce
      into
      [(format "I have a table named '%s' with the following columns: %s." model-name col-names)]
      [(column-types model)
       (enumerated-values model)]))))

(comment
  (let [{model-name :name :keys [result_metadata] :as model} (t2/select-one [Card :name :result_metadata] :id 1036)
        col-names (str/join ", " (map (comp (partial format "'%s'") :name) result_metadata))]
    (reduce
     into
     [(format "I have a table named '%s' with the following columns: %s." model-name col-names)]
     [(column-types model)
      (enumerated-values model)])
    )

  (t2/select-one Card :id 1036)

  (model-messages 1036)
  )

(defn write-sql [model-assertions prompt]
  (openai.api/create-chat-completion
   {:model    "gpt-3.5-turbo"
    :messages (conj
               (into
                [{:role "system" :content bot-directions}]
                model-assertions)
               {:role "user" :content prompt})}
   {:api-key      (openai-api-key)
    :organization (openai-organization)}))

(defn extract-sql [bot-response]
  (let [[_pre sql _post] (str/split bot-response #"```(sql|SQL)?")]
    (when sql (mdb.query/format-sql sql))))

(defn standardize-name [{:keys [id name] :as _model} sql]
  (let [rgx (re-pattern (format "\\Q\"%s\"\\E" name))]
    (str/replace sql rgx (format "{{#%s}}" id))
    ;(str/replace sql rgx (format "{{#%s-%s}}" id (str/replace (u/slugify name) #"_" "-")))
    ))

(defn replacements [{:keys [dataset_query]}]
  (->> (let [{:keys [query]} dataset_query
             {:keys [joins]} query]
         (for [{:keys [alias fields] :as _join} joins
               [_ field] fields
               :let [field-name (:name (t2/select-one [Field :name] :id field))]]
           [field-name (format "%s__%s" alias field-name)]))
       (sort-by (comp - count first))))

(defn replace-fields [model sql]
  (let [r (replacements model)]
    (reduce
     (fn [sql [o n]]
       (str/replace sql o n)) sql r)))

(defn bot-response->sql [resp]
  (some->> resp
           :choices
           first
           :message
           :content
           extract-sql
           ;(standardize-name model)
           ;(replace-fields model)
           ))

(defn get-sql [model {:keys [question fake]}]
  (cond
    fake "SELECT * FROM ORDERS; -- THIS IS FAKE"
    (and (openai-api-key) (openai-organization)) (let [model-assertions (model-messages model)
                                                       resp             (write-sql model-assertions question)]
                                                   (tap> {:response resp})
                                                   (bot-response->sql resp))
    :else "Set MB_OPENAI_API_KEY and MB_OPENAI_ORGANIZATION env vars and relaunch!"))

(defn fix-aliases [query]
  (str/replace
   query
   #"AS \"([^_]+__([^\"]+))\""
   (fn [[_ _ b]] (format "AS \"%s\"" b))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/model/:model-id"
  "Ask Metabot to generate a SQL query given a prompt about a given model."
  [model-id :as {{:keys [question fake] :as body} :body}]
  (tap> {:model-id model-id
         :request  body})
  (binding [persisted-info/*allow-persisted-substitution* false]
    ;(qp.perms/check-current-user-has-adhoc-native-query-perms query)
    (let [{model-name :name :keys [database_id dataset_query] :as model} (api/check-404 (t2/select-one Card :id model-id))
          {inner-query :query} (qp/compile-and-splice-parameters dataset_query)
          inner-query (fix-aliases inner-query)
          bot-sql (get-sql model {:question question :fake fake})
          final-sql (format "WITH \"%s\" AS (%s) %s" model-name inner-query bot-sql)
          _ (tap> {:bot-sql bot-sql
                   :final-sql final-sql})
          response-sql     (cond
                             fake "SELECT * FROM ORDERS; -- THIS IS FAKE"
                             (and (openai-api-key) (openai-organization)) final-sql
                             :else "Set MB_OPENAI_API_KEY and MB_OPENAI_ORGANIZATION env vars and relaunch!")
          ;response         {:original_question       question
          ;                  :assertions              (mapv :content model-assertions)
          ;                  :sql_query               text
          ;                  :database_id             database_id
          ;                  :id                      model-id
          ;                  ;; Hard coded dataset result. Has nothing to do with any of the above.
          ;                  :suggested_visualization dataset-result}
          response         {:dataset_query          {:database database_id
                                                     :type     "native"
                                                     :native   {:query response-sql}}
                            :display                :table
                            :visualization_settings {}}
          ]
      (tap> response)
      response)))


#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/database/:database-id"
  "Ask Metabot to generate a SQL query given a prompt about a given database."
  [database-id :as {{:keys [question fake] :as body} :body}]
  (tap> {:database-id database-id
         :request     body})
  (binding [persisted-info/*allow-persisted-substitution* false]
    (let [response {:dataset_query          {:database database-id
                                             :type     "native"
                                             :native   {:query "SELECT * FROM ORDERS; -- THIS IS FAKE"}}
                    :display                :table
                    :visualization_settings {}}
          ]
      (tap> response)
      response)))

;{
; dataset_query: {
;                 database: 1,
;                 type: "native",
;                 native: {
;                          query: "<generated query>"
;                          }
;                 },
; display: "<suggested display type>",
; visualization_settings: { ... }
; }

(api/define-routes)
