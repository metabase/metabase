(ns metabase.driver.sql-jdbc.actions
  (:require [clojure.java.jdbc :as jdbc]
            [honeysql.format :as hformat]
            [metabase.actions :as actions]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.query-processor :as qp]
            [metabase.query-processor.store :as qp.store]
            [metabase.util.i18n :as i18n]))

(defn- catch-throw [e status-code & [more-info]]
  (throw
   (ex-info (ex-message e)
            (merge {:exception-data (ex-data e)
                    :status-code status-code}
                   more-info))))

(defn- check-one-row-affected [conn query raw-hsql]
  (let [select-hsql     (-> raw-hsql (assoc :select [[:%count.* :row-count]]))
        row-count       (:row_count (first (jdbc/query conn (hformat/format select-hsql))) 0)]
    (when-not (= row-count 1)
      (throw (ex-info (i18n/tru "Sorry, this would affect {0} rows, but you can only act on 1" row-count)
                      {:query       query
                       :sql         select-hsql
                       :status-code 400})))))

(defmethod actions/row-action! [:delete :sql-jdbc]
  [_action driver {database-id :database :as query}]
  (let [connection-spec (sql-jdbc.conn/db->pooled-connection-spec database-id)
        raw-hsql        (qp.store/with-store
                          (try
                            (qp/preprocess query) ; seeds qp store as a side-effect so we can generate honeysql
                            (sql.qp/mbql->honeysql driver query)
                            (catch Exception e
                              (catch-throw e 404))))
        _ (check-one-row-affected connection-spec query raw-hsql)
        delete-hsql (-> raw-hsql
                        (dissoc :select)
                        (assoc :delete []))]
    {:rows-deleted (try (jdbc/execute! connection-spec (hformat/format delete-hsql))
                        (catch Exception e
                          (catch-throw e 400 {:query query
                                              :sql delete-hsql})))}))

(defmethod actions/row-action! [:update :sql-jdbc]
  [_action driver {database-id :database :keys [update-row] :as query}]
  (let [connection-spec (sql-jdbc.conn/db->pooled-connection-spec database-id)
        raw-hsql        (qp.store/with-store
                          (try
                            (qp/preprocess query) ; seeds qp store as a side-effect so we can generate honeysql
                            (sql.qp/mbql->honeysql driver query)
                            (catch Exception e
                              (catch-throw e 404))))]
    (check-one-row-affected connection-spec query raw-hsql)
    (let [target-table (first (:from raw-hsql))
          update-hsql (-> raw-hsql
                          (select-keys [:where])
                          (assoc :update target-table :set update-row))]
      {:rows-updated (try (jdbc/execute! connection-spec (hformat/format update-hsql))
                          (catch Exception e
                            (catch-throw e 400 {:query query
                                                :sql   update-hsql})))})))

(defmethod actions/row-action! [:create :sql-jdbc]
  [_action driver {database-id :database :keys [create-row] :as query}]
  (let [connection-spec (sql-jdbc.conn/db->pooled-connection-spec database-id)
        raw-hsql        (qp.store/with-store
                          (try
                            (qp/preprocess query) ; seeds qp store as a side effect so we can generate honeysql
                            (sql.qp/mbql->honeysql driver query)
                            (catch Exception e
                              (catch-throw e 404))))
        create-hsql (-> raw-hsql
                        (dissoc :select :from)
                        (assoc :insert-into (first (:from raw-hsql)))
                        (assoc :values [create-row]))]

    {:created-row
     (if (= :driver :postgres)
       ;; postgres is happy with "returning *", However:
       ;; for mysql: to return all the columns we must add them to the column list and provide default values in the VALUES clause.
       ;; for h2: I don't see an easy way to do it, so for those two, just use select *.
       (let [pg-create-hsql (-> raw-hsql (assoc :returning [:*]))]
         (try (jdbc/execute! connection-spec
                             (hformat/format pg-create-hsql)
                             {:return-keys true})
              (catch Exception e
                (catch-throw e 400 {:query query
                                    :sql   create-hsql}))))
       (try (let [col->val (jdbc/execute! connection-spec (hformat/format create-hsql) {:return-keys true})]
              (first
               (jdbc/query connection-spec (hformat/format (assoc raw-hsql
                                                                  :select [:*]
                                                                  :where (into [:and]
                                                                               (for [[col val] col->val]
                                                                                 [:= col val])))))))
            (catch Exception e
              (catch-throw e 400 {:query query
                                  :sql   create-hsql}))))}))

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
