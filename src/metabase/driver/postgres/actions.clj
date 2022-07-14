(ns metabase.driver.postgres.actions
  "Method impls for [[metabase.driver.sql-jdbc.actions]] for `:postgres`."
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.util.i18n :refer [tru]]))

(defn- constraint->columns [conn constraint-name]
  (->> ["select column_name from information_schema.constraint_column_usage where constraint_name = ?" constraint-name]
       (jdbc/query conn {:identifers identity, :transaction? false})
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

(defmethod sql-jdbc.actions/parse-sql-error :postgres
  [_driver conn message]
  (some #(% conn message)
        [violates-not-null-constraint
         violates-unique-constraint
         update-or-delete-with-fk-constraint]))

(defmethod sql-jdbc.actions/base-type->sql-type :postgres
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
