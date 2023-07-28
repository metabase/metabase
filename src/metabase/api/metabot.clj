(ns metabase.api.metabot
  (:require
   [clojure.string :as str]
   [compojure.core :refer [POST]]
   [metabase.api.common :as api]
   [metabase.metabot :as metabot]
   [metabase.metabot.feedback :as metabot-feedback]
   [metabase.metabot.mbql-inference :as mbql-inference]
   [metabase.metabot.util :as metabot-util]
   [metabase.metabot.task-impl :as task-impl]
   [metabase.models :refer [Card Database]]
   [metabase.util.log :as log]
   [metabase.util.schema :as su]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- check-database-support
  "Do a preliminary check to ensure metabot will work. Throw an exception if not."
  [database-id]
  (when-not (metabot-util/supported? database-id)
    (throw
     (let [message "Metabot is not supported for this database type."]
       (ex-info
        message
        {:status-code 400
         :message     message})))))

(defn- infer-sql-or-throw
  "An http-friendly version of infer-sql that throws a useful error if it fails to produce sql."
  [context question]
  (or
   (metabot/infer-sql context)
   (throw
    (let [message (format
                   "Query '%s' didn't produce any SQL. Perhaps try a more detailed query."
                   question)]
      (ex-info
       message
       {:status-code 400
        :message     message})))))

(defn- add-viz-to-dataset
  "Given a calling context and resulting dataset, add a more interesting visual to the card."
  [context {:keys [bot-sql] :as dataset}]
  (let [context (assoc context :sql bot-sql :prompt_task :infer_viz)
        {:keys [template prompt_template_version]} (metabot/infer-viz context)]
    (cond-> (update dataset :card merge template)
      prompt_template_version
      (update :prompt_template_versions conj prompt_template_version))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/model/:model-id"
  "Ask Metabot to generate a SQL query given a prompt about a given model."
  [model-id :as {{:keys [question]} :body}]
  ;{model-id ms/PositiveInt
  ; question string?}
  (log/infof
   "Metabot '/api/metabot/model/%s' being called with prompt: '%s'"
   model-id
   question)
  (let [model   (api/check-404 (t2/select-one Card :id model-id :dataset true))
        _       (check-database-support (:database_id model))
        context {:model       (metabot-util/denormalize-model model)
                 :user_prompt question
                 :prompt_task :infer_sql}
        dataset (infer-sql-or-throw context question)]
    (add-viz-to-dataset context dataset)))

;{
; "card": {
;          "dataset_query": {
;                            "database": 1,
;                            "type": "native",
;                            "native": {
;                                       "query": "WITH ORDERS_PEOPLE_PRODUCTS AS (SELECT\n  \"SUBTOTAL\" AS ORDER_SUBTOTAL,\n  \"TAX\" AS ORDER_TAX,\n  \"TOTAL\" AS ORDER_TOTAL,\n  \"DISCOUNT\" AS ORDER_DISCOUNT,\n  \"CREATED_AT\" AS ORDER_CREATION_TIME,\n  \"QUANTITY\" AS ORDER_QUANTITY,\n  \"People - User__ADDRESS\" AS CUSTOMER_ADDRESS,\n  \"People - User__EMAIL\" AS CUSTOMER_EMAIL,\n  \"People - User__PASSWORD\" AS CUSTOMER_PASSWORD,\n  \"People - User__NAME\" AS CUSTOMER_NAME,\n  \"People - User__CITY\" AS CUSTOMER_CITY,\n  \"People - User__LONGITUDE\" AS CUSTOMER_LONGITUDE,\n  \"People - User__STATE\" AS CUSTOMER_STATE,\n  \"People - User__SOURCE\" AS CUSTOMER_SOURCE,\n  \"People - User__BIRTH_DATE\" AS CUSTOMER_BIRTH_DATE,\n  \"People - User__ZIP\" AS CUSTOMER_ZIPCODE,\n  \"People - User__LATITUDE\" AS CUSTOMER_LATITUDE,\n  \"People - User__CREATED_AT\" AS CUSTOMER_CREATION_DATE,\n  \"Products__EAN\" AS PRODUCT_EAN,\n  \"Products__TITLE\" AS PRODUCT_NAME,\n  \"Products__CATEGORY\" AS PRODUCT_CATEGORY,\n  \"Products__VENDOR\" AS PRODUCT_VENDOR,\n  \"Products__PRICE\" AS PRODUCT_PRICE,\n  \"Products__RATING\" AS PRODUCT_RATING,\n  \"Products__CREATED_AT\" AS PRODUCT_CREATION_DATE\nFROM\n  {{#1}} AS INNER_QUERY) SELECT\n  *\nFROM\n  ORDERS_PEOPLE_PRODUCTS;",
;                                       "template-tags": {
;                                                         "#1": {
;                                                                "type": "card",
;                                                                "name": "#1",
;                                                                "id": "01ee71cc-2bef-4a4c-9654-da58247b5d95",
;                                                                "card-id": 1,
;                                                                "display-name": "#1"
;                                                                }
;                                                         }
;                                       }
;                            },
;          "display": "table",
;          "visualization_settings": {}
;          },
; "prompt_template_versions": [
;                              "infer_model:0001",
;                              "infer_sql:0005"
;                              ],
; "bot-sql": "SELECT\n  *\nFROM\n  ORDERS_PEOPLE_PRODUCTS;"
; }

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/database/:database-id"
  "Ask Metabot to generate a native question given a prompt about a given database."
  [database-id :as {{:keys [question]} :body}]
  {database-id su/IntGreaterThanZero
   question    su/NonBlankString}
  (log/infof
   "Metabot '/api/metabot/database/%s' being called with prompt: '%s'"
   database-id
   question)
  (let [{:keys [mbql]} (mbql-inference/infer-mbql question)]
    {:card {:dataset_query {:database 1                     ;;TODO
                            :type :query
                            :query mbql}
            :display :table
            :visualization_settings {}}})
  #_(let [{:as database} (api/check-404 (t2/select-one Database :id database-id))
          _       (check-database-support (:id database))
          context {:database    (metabot-util/denormalize-database database)
                   :user_prompt question
                   :prompt_task :infer_model}]
      (if-some [model (metabot/infer-model context)]
        (let [context (merge context {:model model :prompt_task :infer_sql})
              dataset (infer-sql-or-throw context question)]
          (add-viz-to-dataset context dataset))
        (throw
         (let [message (format
                        (str/join
                         " "
                         ["Query '%s' didn't find a good match to your data."
                          "Perhaps try a query that mentions the model name or columns more specifically."])
                        question)]
           (ex-info
            message
            {:status-code 400
             :message     message}))))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/database/:database-id/query"
  "Ask Metabot to generate a SQL query given a prompt about a given database."
  [database-id :as {{:keys [question]} :body}]
  {database-id su/IntGreaterThanZero
   question    su/NonBlankString}
  (log/infof
   "Metabot '/api/metabot/database/%s/query' being called with prompt: '%s'"
   database-id
   question)
  (let [{:as database} (api/check-404 (t2/select-one Database :id database-id))
        _       (check-database-support (:id database))
        context {:database    (metabot-util/denormalize-database database)
                 :user_prompt question
                 :prompt_task :infer_native_sql}]
    (metabot/infer-native-sql-query context)))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/feedback"
  "Record feedback on metabot results."
  [:as {feedback :body}]
  (if-some [stored-feedback (metabot-feedback/submit-feedback feedback)]
    {:feedback stored-feedback
     :message  "Thanks for your feedback"}
    (throw
     (let [message "There was a problem submitting your feedback."]
       (ex-info
        message
        {:status-code 500
         :message     message})))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;; Direct generation of MBQL using our standalone pretrained LLMs ;;;;;;;;;;;;;;;;;;;;;;;;;;;;

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/mbql"
  "Generate a training dataset based on models for this database"
  [prompt]
  {prompt su/NonBlankString}
  (log/infof "Metabot generating mbql for prompt: %s" prompt)
  (let [inferencer (task-impl/fine-tune-mbql-inferencer)
        embedder   (task-impl/fine-tune-embedder)]
    (mbql-inference/infer-mbql
     {:embedder   embedder
      :inferencer inferencer}
     prompt)))

(api/define-routes)

