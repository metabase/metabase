(ns metabase.driver.postgres.actions
  "Method impls for [[metabase.driver.sql-jdbc.actions]] for `:postgres`."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.actions.core :as actions]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-trun tru]]))

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

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:postgres actions/violate-not-null-constraint]
  [_driver error-type _database _action-type error-message]
  (when-let [[_ column]
             (re-find #"null value in column \"([^\"]+)\".*violates not-null constraint"  error-message)]
    {:type    error-type
     :message (tru "{0} must have values." (str/capitalize column))
     :errors  {column (tru "You must provide a value.")}}))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:postgres actions/violate-unique-constraint]
  [_driver error-type database _action-type error-message]
  (when-let [[_match constraint _value]
             (re-find #"duplicate key value violates unique constraint \"([^\"]+)\"" error-message)]
    (let [columns (constraint->column-names database constraint)]
      {:type    error-type
       :message (tru "{0} already {1}." (u/build-sentence (map str/capitalize columns) :stop? false) (deferred-trun "exists" "exist" (count columns)))
       :errors  (reduce (fn [acc col]
                          (assoc acc col (tru "This {0} value already exists." (str/capitalize col))))
                        {}
                        columns)})))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:postgres actions/violate-foreign-key-constraint]
  [_driver error-type _database action-type error-message]
  (or (when-let [[_match _table _constraint _ref-table column _value _ref-table-2]
                 (re-find #"update or delete on table \"([^\"]+)\" violates foreign key constraint \"([^\"]+)\" on table \"([^\"]+)\"\n  Detail: Key \((.*?)\)=\((.*?)\) is still referenced from table \"([^\"]+)\"" error-message)]
        (merge {:type error-type}
               (case action-type
                 :row/delete
                 {:message (tru "Other tables rely on this row so it cannot be deleted.")
                  :errors  {}}

                 :row/update
                 {:message (tru "Unable to update the record.")
                  :errors  {column (tru "This {0} does not exist." (str/capitalize column))}})))
      (when-let [[_match _table _constraint column _value _ref-table]
                 (re-find #"insert or update on table \"([^\"]+)\" violates foreign key constraint \"([^\"]+)\"\n  Detail: Key \((.*?)\)=\((.*?)\) is not present in table \"([^\"]+)\"" error-message)]
          {:type    error-type
           :message (case action-type
                      :row/create
                      (tru "Unable to create a new record.")

                      :row/update
                      (tru "Unable to update the record."))
           :errors  {column (tru "This {0} does not exist." (str/capitalize column))}})))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:postgres actions/incorrect-value-type]
  [_driver error-type _database _action-type error-message]
  (when-let [[_] (re-find #"invalid input syntax for .*" error-message)]
    {:type    error-type
     :message (tru "Some of your values aren’t of the correct type for the database.")
     :errors  {}}))

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
