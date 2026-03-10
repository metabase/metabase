(ns metabase-enterprise.metabot-v3.api.document
  "`/api/ee/metabot-v3/document` routes"
  (:require
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.table-utils :as table-utils]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.query-processor :as qp]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouses.core :as warehouses]))

(set! *warn-on-reflection* true)

(defn- fix-sql [fix-request]
  (let [response (metabot-v3.client/fix-sql fix-request)
        return-sql (:sql fix-request)]
    (when-let [fixes (:fixes response)]
      (str/join "\n" (reduce
                      (fn [sql-lines fix]
                        (assoc sql-lines (dec (:line_number fix)) (:fixed_sql fix)))
                      (vec (str/split-lines return-sql))
                      fixes)))))

(defn- check-query
  "If the query is valid, return nil. If not, return the error message."
  [query]
  (try
    (qp/process-query query)
    nil
    (catch Exception e
      (ex-message e))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/generate-content"
  "Create a new piece of content to insert into the document."
  [_route-params
   _query-params

   body :- [:map
            [:instructions ms/NonBlankString]
            [:references {:optional true} ms/Map]]]
  (let [response (metabot-v3.client/document-generate-content {:instructions    (:instructions body)
                                                               :references      (:references body)
                                                               :user_id         api/*current-user-id*
                                                               :conversation_id (str (random-uuid))})
        query (get-in response [:draft_card :dataset_query])]
    (if (and query (= "native" (:type query)))
      (if-let [error (check-query query)]
        (let [db-id (-> (:references body)
                        keys
                        first
                        name
                        (#(str/split % #":"))
                        last
                        Integer/parseInt)
              db (warehouses/get-database db-id)
              schema-ddl (table-utils/schema-full db-id)]
          ;; Attempt to fix SQL 5 times before returning.
          (loop [attempts-left 5
                 sql (get-in query [:native :query])
                 error error]
            (let [fixed-sql (fix-sql {:sql           sql
                                      :dialect       (:engine db)
                                      :error_message error
                                      :schema_ddl    schema-ddl})
                  ;; Only re-check query if new SQL was produced.
                  error (when fixed-sql
                          (check-query (assoc-in query [:native :query] fixed-sql)))]
              (if (and error (> attempts-left 1))
                (recur (dec attempts-left) fixed-sql error)
                (assoc-in response [:draft_card :dataset_query :native :query] (or fixed-sql sql))))))
        response)
      response)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/metabot-v3/document` routes."
  (api.macros/ns-handler *ns* +auth))
