(ns metabase.driver.sql-jdbc.actions
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [honeysql.format :as hformat]
            [medley.core :as m]
            [metabase.actions :as actions]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.models.table :as table :refer [Table]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.store :as qp.store]
            [metabase.util.honeysql-extensions :as hx]
            [metabase.util.i18n :refer [tru]]
            [toucan.db :as db]))

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

(defmethod parse-sql-error :default
  [_driver _conn e]
  {:message (pr-str e)})

(defmethod parse-sql-error :postgres
  [_driver conn message]
  (some #(% conn message)
        [violates-not-null-constraint
         violates-unique-constraint
         update-or-delete-with-fk-constraint]))

(defn- parse-error
  "Returns errors in a way that indicates which column had the problem. Can be used to highlight errors in forms."
  [driver conn e]
  (let [message (ex-message e)]
    (if-let [errors (and message
                         (parse-sql-error driver conn message))]
      {:errors (->> errors
                    (m/index-by :column)
                    (m/map-vals :message))}
      {:message (or message (pr-str e))})))

(defn- catch-throw [e status-code & [more-info]]
  (throw
   (ex-info (ex-message e)
            (merge {:exception-data (ex-data e)
                    :status-code status-code}
                   more-info))))

(def base-type->sql-type
  "Mapping from base-types to postgres sql-types to e.g. be used for casting."
  {:type/BigInteger          "BIGINT"
   :type/Boolean             "BOOL"
   :type/Date                "DATE"
   :type/DateTime            "TIMESTAMP"
   :type/DateTimeWithTZ      "TIMESTAMP WITH TIME ZONE"
   :type/DateTimeWithLocalTZ "TIMESTAMP WITH TIME ZONE"
   :type/Decimal             "DECIMAL"
   :type/Float               "FLOAT"
   :type/Integer             "INTEGER"
   :type/IPAddress           "INET"
   :type/Text                "TEXT"
   :type/Time                "TIME"
   :type/TimeWithTZ          "TIME WITH TIME ZONE"
   :type/UUID                "UUID"})

(defn- cast-values
  "Certain value types need to have their honeysql form updated to work properly during update/creation. This function
  uses honeysql casting to wrap values in the map that need to be cast with their column's type, and passes through
  types that do not need casting like integer or string."
  [column->value table-id]
  (let [column->field (m/index-by (comp keyword #(str/replace % "_" "-") :name)
                                  (:fields (first (table/with-fields (db/select Table :id table-id)))))]
    (m/map-kv-vals (fn [col value]
                     (let [{base-type :base_type :as field} (get column->field col)]
                       (if-let [sql-type (base-type->sql-type base-type)]
                         (hx/cast sql-type value)
                         (try
                           (metabase.driver.sql.query-processor/->honeysql :postgres [:value value field])
                           (catch Exception e
                             (throw (ex-info (str "column cast failed: " col)
                                             {:column col
                                              :original-ex (ex-message e)
                                              :status-code 400})))))))
                   column->value)))

(defmethod actions/row-action! [:delete :sql-jdbc]
  [_action driver {database-id :database :as query}]
  (let [conn         (sql-jdbc.conn/db->pooled-connection-spec database-id)
        raw-hsql     (qp.store/with-store
                       (try
                         (qp/preprocess query) ; seeds qp store as a side-effect so we can generate honeysql
                         (sql.qp/mbql->honeysql driver query)
                         (catch Exception e
                           (catch-throw e 404))))
        delete-hsql  (-> raw-hsql
                         (dissoc :select)
                         (assoc :delete []))
        rows-deleted (try (first (jdbc/execute! conn (hformat/format delete-hsql)))
                          (catch Exception e
                            (throw
                             (ex-info "Delete action error." (assoc (parse-error driver conn e) :status-code 400)))))]
    (if (= rows-deleted 1)
      {:rows-deleted [1]}
      (do (jdbc/db-set-rollback-only! conn)
          (throw (ex-info (tru "Sorry, this would delete {0} rows, but you can only act on 1" rows-deleted)
                          {:query       query
                           :sql         (hformat/format delete-hsql)
                           :status-code 400}))))))

(defmethod actions/row-action! [:update :sql-jdbc]
  [_action driver {database-id :database :keys [update-row] :as query}]
  (let [conn     (sql-jdbc.conn/db->pooled-connection-spec database-id)
        raw-hsql (qp.store/with-store
                   (try
                     (qp/preprocess query) ; seeds qp store as a side-effect so we can generate honeysql
                     (sql.qp/mbql->honeysql driver query)
                     (catch Exception e
                       (catch-throw e 404))))
        target-table (first (:from raw-hsql))
        update-hsql  (-> raw-hsql
                         (select-keys [:where])
                         (assoc :update target-table
                                :set (cast-values update-row (get-in query [:query :source-table]))))
        rows-updated (try (first (jdbc/execute! conn (hformat/format update-hsql)))
                          (catch Exception e
                            (throw
                             (ex-info "Update action error." (assoc (parse-error driver conn e) :status-code 400)))))]
    (if (= rows-updated 1)
      {:rows-updated [1]}
      (do (jdbc/db-set-rollback-only! conn)
          (throw (ex-info (tru "Sorry, this would update {0} rows, but you can only act on 1" rows-updated)
                          {:query       query
                           :sql         (hformat/format update-hsql)
                           :status-code 400}))))))

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
                        (assoc :values [(cast-values create-row (get-in query [:query :source-table]))])
                        (dissoc :select :from))]
    {:created-row
     (if (= driver :postgres)
       ;; postgres is happy with "returning *", but mysql and h2 aren't so just use select *.
       (let [pg-create-hsql (-> create-hsql (assoc :returning [:*]))
             raw-sql        (hformat/format pg-create-hsql)]
         (try (jdbc/execute! conn raw-sql {:return-keys true})
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
