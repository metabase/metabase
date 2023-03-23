(ns metabase.api.metabot
  (:require
   [clojure.string :as str]
   [compojure.core :refer [POST]]
   [metabase.api.common :as api]
   [metabase.db.query :as mdb.query]
   [metabase.models.card :refer [Card]]
   [metabase.models.field-values :refer [FieldValues]]
   [metabase.models.persisted-info :as persisted-info]
   [metabase.models.setting :refer [defsetting]]
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

(def dataset-result
  '{:database_id            1,
    :started_at             #t "2023-03-22T23:22:07.760675Z[UTC]",
    :json_query
    {:type       "query",
     :database   1,
     :query
     {:source-table "card__1036", :breakout [["field" 42 {:temporal-unit "quarter-of-year"}]], :aggregation [["count"]]},
     :middleware {:js-int-to-string? true, :add-default-userland-constraints? true}},
    :average_execution_time nil,
    :status                 :completed,
    :context                :ad-hoc,
    :row_count              4,
    :running_time           137,
    :data
    {:cols
     ({:description       "The date and time an order was submitted.",
       :semantic_type     :type/CreationTimestamp,
       :table_id          2,
       :coercion_strategy nil,
       :unit              :quarter-of-year,
       :name              "CREATED_AT",
       :settings          nil,
       :source            :breakout,
       :field_ref         [:field 42 {:temporal-unit :quarter-of-year}],
       :effective_type    :type/Integer,
       :nfc_path          nil,
       :parent_id         nil,
       :id                42,
       :visibility_type   :normal,
       :display_name      "Created At",
       :fingerprint
       {:global {:distinct-count 9998, :nil% 0.0},
        :type   {:type/DateTime {:earliest "2016-04-30T18:56:13.352Z", :latest "2020-04-19T14:07:15.657Z"}}},
       :base_type         :type/Integer}
      {:base_type      :type/BigInteger,
       :semantic_type  :type/Quantity,
       :name           "count",
       :display_name   "Count",
       :source         :aggregation,
       :field_ref      [:aggregation 0],
       :effective_type :type/BigInteger}),
     :download_perms   :full,
     :native_form
     {:query
      "SELECT CAST(extract(quarter from \"source\".\"CREATED_AT\") AS integer) AS \"CREATED_AT\", COUNT(*) AS \"count\" FROM (SELECT \"PUBLIC\".\"ORDERS\".\"ID\" AS \"ID\", \"PUBLIC\".\"ORDERS\".\"CREATED_AT\" AS \"CREATED_AT\", \"People - User\".\"LONGITUDE\" AS \"People - User__LONGITUDE\", \"People - User\".\"STATE\" AS \"People - User__STATE\", \"People - User\".\"LATITUDE\" AS \"People - User__LATITUDE\", \"Products\".\"PRICE\" AS \"Products__PRICE\" FROM \"PUBLIC\".\"ORDERS\" LEFT JOIN \"PUBLIC\".\"PEOPLE\" AS \"People - User\" ON \"PUBLIC\".\"ORDERS\".\"USER_ID\" = \"People - User\".\"ID\" LEFT JOIN \"PUBLIC\".\"PRODUCTS\" AS \"Products\" ON \"PUBLIC\".\"ORDERS\".\"PRODUCT_ID\" = \"Products\".\"ID\") AS \"source\" GROUP BY CAST(extract(quarter from \"source\".\"CREATED_AT\") AS integer) ORDER BY CAST(extract(quarter from \"source\".\"CREATED_AT\") AS integer) ASC",
      :params nil},
     :results_timezone "UTC",
     :dataset          true,
     :results_metadata
     {:columns
      [{:description       "The date and time an order was submitted.",
        :semantic_type     :type/CreationTimestamp,
        :coercion_strategy nil,
        :unit              :quarter-of-year,
        :name              "CREATED_AT",
        :settings          nil,
        :field_ref         [:field 42 {:temporal-unit :quarter-of-year}],
        :effective_type    :type/Integer,
        :id                42,
        :visibility_type   :normal,
        :display_name      "Created At",
        :fingerprint
        {:global {:distinct-count 9998, :nil% 0.0},
         :type   {:type/DateTime {:earliest "2016-04-30T18:56:13.352Z", :latest "2020-04-19T14:07:15.657Z"}}},
        :base_type         :type/Integer}
       {:display_name   "Count",
        :semantic_type  :type/Quantity,
        :field_ref      [:aggregation 0],
        :name           "count",
        :base_type      :type/BigInteger,
        :effective_type :type/BigInteger,
        :fingerprint
        {:global {:distinct-count 4, :nil% 0.0},
         :type   {:type/Number {:min 4203.0, :q1 4302.5, :q3 5077.5, :max 5313.0, :sd 493.74284804946797, :avg 4690.0}}}}]},
     :insights         nil}})

(defn extract-sql [bot-response]
  (let [candidates (map str/trim (str/split bot-response #"```"))]
    (when (seq candidates)
      (some
       (fn [candidate]
         (println candidate)
         (when (str/starts-with? candidate "SELECT")
           (mdb.query/format-sql candidate)))
       candidates))))

(defn standardize-name [{:keys [id name] :as _model} sql]
  (let [rgx (re-pattern (format "\\Q\"%s\"\\E" name))]
    (str/replace sql rgx (format "{{#%s-%s}}" id (u/slugify name)))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/model/:model-id"
  "Ask Metabot to generate a SQL query given a prompt about a given model."
  [model-id :as {{:keys [question fake] :as body} :body}]
  (tap> {:model-id model-id
         :request  body})
  (binding [persisted-info/*allow-persisted-substitution* false]
    ;(qp.perms/check-current-user-has-adhoc-native-query-perms query)
    (let [{:keys [database_id] :as model} (api/check-404 (t2/select-one Card :id model-id))
          model-assertions (model-messages model)
          response-sql     (cond
                             fake "SELECT * FROM ORDERS; -- THIS IS FAKE"
                             (and
                              (openai-api-key)
                              (openai-organization)) (let [resp (write-sql model-assertions question)]
                                                       (tap> resp)
                                                       (some->> resp
                                                                :choices
                                                                first
                                                                :message
                                                                :content
                                                                extract-sql
                                                                (standardize-name model)))
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
