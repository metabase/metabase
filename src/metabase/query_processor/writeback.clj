(ns metabase.query-processor.writeback
  "Code for executing writeback queries."
  (:require
   [metabase.driver :as driver]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.parameters :as parameters]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

(defn execute-write-query!
  "Execute an writeback query from an action."
  [{query-type :type, :as query}]
  ;; make sure this is a native query.
  (when-not (= query-type :native)
    (throw (ex-info (tru "Only native queries can be executed as write queries.")
                    {:type qp.error-type/invalid-query, :status-code 400, :query query})))
  (qp.setup/do-with-qp-setup
   query
   (^:once fn* [query]
    (qp.perms/check-query-action-permissions* query)
    (let [query (parameters/substitute-parameters query)]
      ;; ok, now execute the query.
      (log/debugf "Executing query\n\n%s" (u/pprint-to-str query))
      (driver/execute-write-query! driver/*driver* query)))))

(defn execute-write-sql!
  "Execute a write query in SQL against a database given by `db-id`."
  [db-id sql-or-sql+params]
  (if (sequential? sql-or-sql+params)
    (let [[sql & params] sql-or-sql+params]
      (execute-write-query! {:type     :native
                             :database db-id
                             :native   {:query  sql
                                        :params params}}))
    (execute-write-query! {:type     :native
                           :database db-id
                           :native   {:query sql-or-sql+params}})))
