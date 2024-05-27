(ns metabase.driver.h2.actions
  "Method impls for [[metabase.driver.sql-jdbc.actions]] for `:h2`."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.actions.core :as actions]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru deferred-trun]]
   [metabase.util.log :as log]))

(defmethod sql-jdbc.actions/base-type->sql-type-map :h2
  [_driver]
  {:type/BigInteger     "BIGINT"
   :type/Boolean        "BOOL"
   :type/Date           "DATE"
   :type/DateTime       "DATETIME"
   :type/DateTimeWithTZ "TIMESTAMP WITH TIME ZONE"
   :type/Decimal        "DECIMAL"
   :type/Float          "FLOAT"
   :type/Integer        "INTEGER"
   :type/Text           "VARCHAR"
   :type/Time           "TIME"})

;; H2 doesn't need to do anything special with nested transactions; the original transaction can proceed even if some
;; specific statement errored.
(defmethod sql-jdbc.actions/do-nested-transaction :h2
  [_driver _conn thunk]
  (thunk))

(defn- db-identifier->name
  "Get the name of identifier from JDBC error message.
  An identifier can contains quote and full schema, database, table , etc.
  This formats so that we get  only the identifer name with quote removed.


    (db-identifier->name \"PUBLIC.TABLE\" ) => \"TABLE\""
  [s]
  (-> s
      (str/replace #"\"" "")
      (str/split #"\.")
      last))

(defn- constraint->column-names
  "Given a constraint with `constraint-name` fetch the column names associated with that constraint."
  [database table-name constraint-name]
  (let [jdbc-spec (sql-jdbc.conn/db->pooled-connection-spec (u/the-id database))
        sql-args  ["SELECT C.TABLE_CATALOG, C.TABLE_SCHEMA, K.COLUMN_NAME
                   FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS C
                   JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE K ON C.CONSTRAINT_NAME = K.CONSTRAINT_NAME
                   WHERE C.INDEX_NAME = ? AND C.TABLE_NAME = ?"
                   constraint-name table-name]]
    (first
     (reduce
      (fn [[columns catalog schema] {:keys [table_catalog table_schema column_name]}]
        (if (and (or (nil? catalog) (= table_catalog catalog))
                 (or (nil? schema) (= table_schema schema)))
          [(conj columns column_name) table_catalog table_schema]
          (do (log/warnf "Ambiguous catalog/schema for constraint %s in table %s"
                         constraint-name table-name)
              (reduced nil))))
      [[] nil nil]
      (jdbc/reducible-query jdbc-spec sql-args {:identifers identity, :transaction? false})))))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:h2 actions/violate-not-null-constraint]
  [_driver error-type _database _action-type error-message]
  (when-let [[_ column]
             (re-find #"NULL not allowed for column \"([^\"]+)\"" error-message)]
    {:type    error-type
     :message (tru "{0} must have values." (str/capitalize column))
     :errors  {column (tru "You must provide a value.")}}))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:h2 actions/violate-unique-constraint]
  [_driver error-type database _action-type error-message]
  (when-let [[_match constraint-name table]
             (re-find #"Unique index or primary key violation: \"[^.]+.(.+?) ON [^.]+.\"\"(.+?)\"\"" error-message)]
    (let [columns (constraint->column-names database table constraint-name)]
      {:type    error-type
       :message (tru "{0} already {1}." (u/build-sentence (map str/capitalize columns) :stop? false) (deferred-trun "exists" "exist" (count columns)))
       :errors  (reduce (fn [acc col]
                          (assoc acc col (tru "This {0} value already exists." (str/capitalize col))))
                        {}
                        columns)})))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:h2 actions/violate-foreign-key-constraint]
  [_driver error-type _database action-type error-message]
  (when-let [[_match column]
             (re-find #"Referential integrity constraint violation: \"[^\:]+: [^\s]+ FOREIGN KEY\(([^\s]+)\)" error-message)]
    (let  [column (db-identifier->name column)]
     (merge {:type error-type}
            (case action-type
              :row/create
              {:message (tru "Unable to create a new record.")
               :errors {column (tru "This {0} does not exist." (str/capitalize column))}}

              :row/delete
              {:message (tru "Other tables rely on this row so it cannot be deleted.")
               :errors  {}}

              :row/update
              {:message (tru "Unable to update the record.")
               :errors  {column (tru "This {0} does not exist." (str/capitalize column))}})))))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:h2 actions/incorrect-value-type]
  [_driver error-type _database _action-type error-message]
  (when-let [[_ _expected-type _value]
             (re-find #"Data conversion error converting .*" error-message)]
    {:type    error-type
     :message (tru "Some of your values aren’t of the correct type for the database.")
     :errors  {}}))
