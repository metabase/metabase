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
   [metabase.util.retry :as retry]
   [metabase.warehouses.api :as warehouses]))

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
              schema-ddl (table-utils/schema-full db-id)
              error (atom error)
              final-sql (atom (get-in query [:native :query]))
              retrier (retry/make (assoc (retry/retry-configuration)
                                         :max-attempts 5
                                         :retry-on-result-pred some?))]
          (retrier (fn []
                     (when-let [fixed-sql (fix-sql {:sql           @final-sql
                                                    :dialect       (:engine db)
                                                    :error_message @error
                                                    :schema_ddl    schema-ddl})]
                       (reset! final-sql fixed-sql))
                     (reset! error (check-query (assoc-in query [:native :query] @final-sql)))))
          (assoc-in response [:draft_card :dataset_query :native :query] @final-sql))
        response)
      response)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/metabot-v3/document` routes."
  (api.macros/ns-handler *ns* +auth))
