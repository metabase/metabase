(ns metabase.driver.sql-jdbc.actions
  (:require
   [clojure.java.jdbc :as jdbc]
   [honeysql.format :as hformat]
   [metabase.actions :as actions]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.util.i18n :as i18n]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]))

(defmethod actions/row-action! [:delete :sql-jdbc]
  ;; "Often condition is a map of primary-key(s) => value(s)."
  [_action driver {database-id :database :as query}]
  (let [connection-spec (sql-jdbc.conn/db->pooled-connection-spec database-id)
        _               (require '[metabase.test :as mt]) ;;HACK: using mt here is not good
        raw-hsql        (mt/with-everything-store ;;HACK: using mt and with-everything-store is not good
                          (sql.qp/mbql->honeysql driver query))
        select-hsql     (-> raw-hsql (assoc :select [[:%count.* :row-count]]))
        row-count       (:row_count (first (jdbc/query connection-spec (hformat/format select-hsql))) 0)]
    (when (not= 1 row-count)
      (throw (ex-info (i18n/tru "Sorry, this would delete {0} rows, but you can only delete 1 and only 1!!!" row-count)
                      {:query       query
                       :sql         select-hsql
                       :status-code 400})))
    (let [delete-hsql (-> raw-hsql (dissoc :select) (assoc :delete []))
          result      (try (jdbc/execute! connection-spec (hformat/format delete-hsql))
                      (catch Exception e
                        (throw (ex-info (.getMessage e) {:query       query
                                                         :sql         delete-hsql
                                                         :status-code 400}))))]
      {:rows-deleted result})))


#_(defmethod actions/row-action! [:update :metabase.driver/driver]
    [_action driver {database-id :database :as query}]
    query)

;; TODO -- need to parse the values in case they're not integers or whatever THANX
#_(metabase.driver.sql.query-processor/->honeysql :postgres
                                                  [:value
                                                   "232333d9-1434-4b1e-973d-4536d1dc8411"
                                                   {:base_type :type/UUID
                                                    :database_type "uuid"}])

;; #uuid "232333d9-1434-4b1e-973d-4536d1dc8411"
