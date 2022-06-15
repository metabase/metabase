(ns metabase.driver.sql-jdbc.actions
  (:require [clojure.java.jdbc :as jdbc]
            [honeysql.format :as hformat]
            [medley.core :as m]
            [metabase.actions :as actions]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.query-processor :as qp]
            [metabase.query-processor.store :as qp.store]
            [metabase.util.i18n :refer [tru]]))

(defn- check-one-row-affected [conn query raw-hsql]
  (let [select-hsql     (-> raw-hsql (assoc :select [[:%count.* :row-count]]))
        row-count       (:row_count (first (jdbc/query conn (hformat/format select-hsql))) 0)]
    (when-not (= row-count 1)
      (throw (ex-info (tru "Sorry, this would affect {0} rows, but you can only act on 1" row-count)
                      {:query       query
                       :sql         select-hsql
                       :status-code 400})))))

(defn- constraint->columns [conn constraint-name]
  (->> ["select column_name from information_schema.constraint_column_usage where constraint_name = ?" constraint-name]
       (jdbc/query conn)
       (map :column_name)))

(defn- violates-not-null-constraint [_conn error-message]
  (let [[match? value column]
        (re-find #"ERROR:\s+(\w+) value in column \"([^\"]+)\" violates not-null constraint" error-message)]
    (when match?
      [{:message (tru "{0} violates not-null constraint" value)
        :column column}])))

(defn- violates-unique-constraint [conn error-message]
  (let [[match? constraint _value]
        (re-find #"ERROR:\s+duplicate key value violates unique constraint \"([^\"]+)\"" error-message)]
    (when match?
      (let [columns (constraint->columns conn constraint)]
        (mapv
         (fn [column]
           {:message (tru "violates unique constraint {0}" constraint)
            :constraint constraint
            :column column})
         columns)))))

(defn- update-or-delete-with-fk-constraint [conn error-message]
  (let [[match? table constraint ref-table _columns _value]
        (re-find #"ERROR:\s+update or delete on table \"([^\"]+)\" violates foreign key constraint \"([^\"]+)\" on table \"([^\"]+)\"" error-message)]
    (when match?
      (let [columns (constraint->columns conn constraint)]
        (mapv
         (fn [column]
           {:message (tru "violates foreign key constraint {0}" constraint)
            :table table
            :ref-table ref-table
            :constraint constraint
            :column column})
         columns)))))

(defmulti parse-sql-error
  "Parses the raw error message returned after an error in the driver database occurs, and converts it into a sequence
  of maps with a :column and :message key indicating what went wrong."
  (fn [driver _conn _message] driver))

(defmethod parse-sql-error :default [& _args] (throw "not implemented."))

(defmethod parse-sql-error :postgres
  [_driver conn message]
  (some #(% conn message)
        [violates-not-null-constraint
         violates-unique-constraint
         update-or-delete-with-fk-constraint]))

(defn- parse-error
  "Returns errors in a way that indicates which column had the problem. Can be used to highlight errors in forms."
  [driver conn e]
  (let [message (ex-message e)
        errors (->> message
                    (parse-sql-error driver conn))]
    (if errors
      {:errors
       (->> errors
            (m/index-by :column)
            (m/map-vals :message))}
      {:message message})))

(defn- catch-throw [e status-code & [more-info]]
  (throw
   (ex-info (ex-message e)
            (merge {:exception-data (ex-data e)
                    :status-code status-code}
                   more-info))))

(defmethod actions/row-action! [:delete :sql-jdbc]
  [_action driver {database-id :database :as query}]
  (let [conn        (sql-jdbc.conn/db->pooled-connection-spec database-id)
        raw-hsql    (qp.store/with-store
                      (try
                        (qp/preprocess query) ; seeds qp store as a side-effect so we can generate honeysql
                        (sql.qp/mbql->honeysql driver query)
                        (catch Exception e
                          (catch-throw e 404))))
        _           (check-one-row-affected conn query raw-hsql)
        delete-hsql (-> raw-hsql
                        (dissoc :select)
                        (assoc :delete []))]
    {:rows-deleted (try (jdbc/execute! conn (hformat/format delete-hsql))
                        (catch Exception e
                          (throw
                           (ex-info "Delete action error." (assoc (parse-error driver conn e) :status-code 400)))))}))

(defmethod actions/row-action! [:update :sql-jdbc]
  [_action driver {database-id :database :keys [update-row] :as query}]
  (let [conn (sql-jdbc.conn/db->pooled-connection-spec database-id)
        raw-hsql        (qp.store/with-store
                          (try
                            (qp/preprocess query) ; seeds qp store as a side-effect so we can generate honeysql
                            (sql.qp/mbql->honeysql driver query)
                            (catch Exception e
                              (catch-throw e 404))))]
    (check-one-row-affected conn query raw-hsql)
    (let [target-table (first (:from raw-hsql))
          update-hsql (-> raw-hsql
                          (select-keys [:where])
                          (assoc :update target-table :set update-row))]
      {:rows-updated (try (jdbc/execute! conn (hformat/format update-hsql))
                          (catch Exception e
                            (throw
                             (ex-info "Update action error." (assoc (parse-error driver conn e) :status-code 400)))))})))

(defmethod actions/row-action! [:create :sql-jdbc]
  [_action driver {database-id :database :keys [create-row] :as query}]
  (let [conn        (sql-jdbc.conn/db->pooled-connection-spec database-id)
        raw-hsql    (qp.store/with-store
                      (try
                        (qp/preprocess query) ; seeds qp store as a side effect so we can generate honeysql
                        (sql.qp/mbql->honeysql driver query)
                        (catch Exception e
                          (catch-throw e 404))))
        create-hsql (-> raw-hsql
                        (assoc :insert-into (first (:from raw-hsql)))
                        (assoc :values [create-row])
                        (dissoc :select :from))]
    {:created-row
     (if (= driver :postgres)
       ;; postgres is happy with "returning *", However:
       ;; for mysql: to return all the columns we must add them to the column list and provide default values in the VALUES clause.
       ;; for h2: I don't see an easy way to do it, so for those two, just use select *.
       (let [pg-create-hsql (-> create-hsql (assoc :returning [:*]))]
         (try (jdbc/execute! connection-spec (hformat/format pg-create-hsql) {:return-keys true})
              (catch Exception e
                (throw
                 (ex-info "Create action error." (assoc (parse-error driver conn e) :status-code 400))))))
       (try (let [col->val (jdbc/execute! conn (hformat/format create-hsql) {:return-keys true})]
              (first
               (jdbc/query conn (hformat/format (assoc raw-hsql
                                                       :select [:*]
                                                       ;; a single clause inside an and will be optimized away
                                                       ;; by honeysql
                                                       :where (into [:and]
                                                                    (for [[col val] col->val]
                                                                      [:= col val])))))))
            (catch Exception e
              (catch-throw e 400 {:query      query
                                  :driver     driver
                                  :raw-hsql   raw-hsql
                                  :create-sql create-hsql}))))}))

;; TODO -- will need to parse the values in case they're not integers or strings.
#_(metabase.driver.sql.query-processor/->honeysql :postgres
                                                  [:value
                                                   "232333d9-1434-4b1e-973d-4536d1dc8411"
                                                   {:base_type :type/UUID
                                                    :database_type "uuid"}])
