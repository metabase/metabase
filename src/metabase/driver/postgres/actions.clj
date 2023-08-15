(ns metabase.driver.postgres.actions
  "Method impls for [[metabase.driver.sql-jdbc.actions]] for `:postgres`."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.actions.error :as actions.error]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

;; TODO -- we should probably be TTL caching this information. Otherwise parsing 100 errors for a bulk action will
;; result in 100 identical data warehouse queries. It's not like constraint columns are something we would expect to
;; change regularly anyway.
(defn- constraint->column-names
  "Given a constraint with `constraint-name` fetch the column names associated with that constraint."
  [database constraint-name]
  (let [jdbc-spec (sql-jdbc.conn/db->pooled-connection-spec (u/the-id database))
        sql-args  ["select column_name from information_schema.constraint_column_usage where constraint_name = ?" constraint-name]]
    (into []
          (map :column_name)
          (jdbc/reducible-query jdbc-spec sql-args {:identifers identity, :transaction? false}))))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:postgres actions.error/violate-not-null-constraint]
  [_driver error-type _database error-message]
  (when-let [[_ _value column _table]
             (re-find #"ERROR:\s+(\w+) value in column \"([^\"]+)\" of relation \"([^\"]+)\" violates not-null constraint"  error-message)]
    {:type    error-type
     :message (tru "{0} must have values." (str/capitalize column))
     :errors  {column (tru "You must provide a value.")}}))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:postgres actions.error/violate-unique-constraint]
  [_driver error-type database error-message]
  (when-let [[_match constraint _value]
             (re-find #"ERROR:\s+duplicate key value violates unique constraint \"([^\"]+)\"" error-message)]
    (let [columns (constraint->column-names database constraint)]
      {:type    error-type
       :message (tru "{0} already exist." (u/build-sentence (map str/capitalize columns) :stop? false))
       :errors  (reduce (fn [acc col]
                          (assoc acc col (tru "This {0} value already exists." (str/capitalize col))))
                        {}
                        columns)})))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:postgres actions.error/violate-foreign-key-constraint]
  [_driver error-type _database error-message]
  (or (when-let [[_match _table _constraint _ref-table _columns _value]
                 (re-find #"ERROR:\s+update or delete on table \"([^\"]+)\" violates foreign key constraint \"([^\"]+)\" on table \"([^\"]+)\"" error-message)]
        {:type    error-type
         :message (tru "Other tables rely on this row so it cannot be updated/deleted.")
         :errors  {}})
      (when-let [[_match _table _constraint column _value ref-table]
                 (re-find #"ERROR: insert or update on table \"([^\"]+)\" violates foreign key constraint \"([^\"]+)\"\n  Detail: Key \((.*?)\)=\((.*?)\) is not present in table \"([^\"]+)\"" #p error-message)]
        {:type    error-type
         :message (tru "Your row contains foreign key that is not existed, so it cannot be created/updated.")
         :errors  {column (tru "This value does not exist in {0} table" ref-table)}})))

(comment
 (sql-jdbc.actions/maybe-parse-sql-error
  :postgres actions.error/violate-foreign-key-constraint {:id 47}
  "ERROR: update or delete on table \"group\" violates foreign key constraint \"user_group-id_group_-159406530\" on table \"user\"\n  Detail: Key (id)=(1) is still referenced from table \"user\".")

 (sql-jdbc.actions/maybe-parse-sql-error
  :postgres actions.error/violate-unique-constraint {:id 47}
  "Batch entry 0 UPDATE \"public\".\"group\" SET \"ranking\" = CAST(2 AS INTEGER) WHERE \"public\".\"group\".\"id\" = 1 was aborted: ERROR: duplicate key value violates unique constraint \"group_ranking_key\"\n  Detail: Key (ranking)=(2) already exists.  Call getNextException to see other errors in the batch.")

 (sql-jdbc.actions/maybe-parse-sql-error
  :postgres actions.error/violate-not-null-constraint nil
  "ERROR: null value in column \"ranking\" of relation \"group\" violates not-null constraint\n  Detail: Failing row contains (57, admin, null).")

 (sql-jdbc.actions/maybe-parse-sql-error
  :postgres actions.error/incorrect-value-type nil
  "Batch entry 0 UPDATE \"public\".\"group\" SET \"ranking\" = CAST('S' AS INTEGER) WHERE \"public\".\"group\".\"id\" = 1 was aborted: ERROR: invalid input syntax for type integer: \"S\"  Call getNextException to see other errors in the batch."))

(defmethod sql-jdbc.actions/base-type->sql-type-map :postgres
  [_driver]
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
   :type/JSON                "JSON"
   :type/Text                "TEXT"
   :type/Time                "TIME"
   :type/TimeWithTZ          "TIME WITH TIME ZONE"
   :type/UUID                "UUID"})

;; For Postgres creating a Savepoint and rolling it back on error seems to be enough to let the parent transaction
;; proceed if some particular statement encounters an error.
(defmethod sql-jdbc.actions/do-nested-transaction :postgres
  [_driver ^java.sql.Connection conn thunk]
  (let [savepoint (.setSavepoint conn)]
    (try
      (thunk)
      (catch Throwable e
        (.rollback conn savepoint)
        (throw e))
      (finally
        (.releaseSavepoint conn savepoint)))))

;;; Add returning * so that we don't have to make an additional query.
(defmethod sql-jdbc.actions/prepare-query* [:postgres :row/create]
  [_driver _action hsql-query]
  (assoc hsql-query :returning [:*]))

;;; Result is already the created row.
(defmethod sql-jdbc.actions/select-created-row :postgres
  [_driver _create-hsql _conn result]
  result)
