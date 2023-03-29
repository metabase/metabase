(ns metabase.driver.postgres.actions
  "Method impls for [[metabase.driver.sql-jdbc.actions]] for `:postgres`."
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn- maybe-parse-not-null-error [_database error-message]
  (when-let [[_ _value column]
             (re-find #"ERROR:\s+(\w+) value in column \"([^\"]+)\" violates not-null constraint" error-message)]
    [{:message (tru "violates not-null constraint")
      :column column}]))

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

(defn- maybe-parse-unique-constraint-error [database error-message]
  (let [[match? constraint _value]
        (re-find #"ERROR:\s+duplicate key value violates unique constraint \"([^\"]+)\"" error-message)]
    (when match?
      (let [columns (constraint->column-names database constraint)]
        (mapv
         (fn [column]
           {:message (tru "violates unique constraint {0}" constraint)
            :constraint constraint
            :column column})
         columns)))))

(defn- maybe-parse-fk-constraint-error [database error-message]
  (let [[match? table constraint ref-table _columns _value]
        (re-find #"ERROR:\s+update or delete on table \"([^\"]+)\" violates foreign key constraint \"([^\"]+)\" on table \"([^\"]+)\"" error-message)]
    (when match?
      (let [columns (constraint->column-names database constraint)]
        (mapv
         (fn [column]
           {:message    (tru "violates foreign key constraint {0}" constraint)
            :table      table
            :ref-table  ref-table
            :constraint constraint
            :column     column})
         columns)))))

(defmethod sql-jdbc.actions/parse-sql-error :postgres
  [_driver database message]
  (some #(% database message)
        [maybe-parse-not-null-error
         maybe-parse-unique-constraint-error
         maybe-parse-fk-constraint-error]))

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
