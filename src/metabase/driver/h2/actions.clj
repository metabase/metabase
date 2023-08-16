(ns metabase.driver.h2.actions
  "Method impls for [[metabase.driver.sql-jdbc.actions]] for `:h2`."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.actions.error :as actions.error]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
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

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:h2 actions.error/violate-not-null-constraint]
  [_driver error-type _database _action-type error-message]
  (when-let [[_ column]
             (re-find #"NULL not allowed for column \"([^\"]+)\"" error-message)]
    {:type    error-type
     :message (tru "{0} must have values." (str/capitalize column))
     :errors  {column (tru "You must provide a value.")}}))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:h2 actions.error/violate-unique-constraint]
  [_driver error-type database _action-type error-message]
  (when-let [[_match constraint-name table]
             (re-find #"Unique index or primary key violation: \"[^.]+.(.+?) ON [^.]+.\"\"(.+?)\"\"" error-message)]
    (let [columns (constraint->column-names database table constraint-name)]
      {:type    error-type
       :message (tru "{0} already exist." (u/build-sentence (map str/capitalize columns) :stop? false))
       :errors  (reduce (fn [acc col]
                          (assoc acc col (tru "This {0} value already exists." (str/capitalize col))))
                        {}
                        columns)})))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:h2 actions.error/violate-foreign-key-constraint]
  [_driver error-type _database action-type error-message]
  (when-let [[_match _constraint-name _table column]
             (re-find #"Referential integrity constraint violation: \"([^\:]+): [^.]+.\"\"([^\s]+)\"\" FOREIGN KEY\(\"\"([^\"]+)\"\"\)" error-message)]
    (merge {:type error-type}
           (case action-type
             :row/create
             {:message (tru "Unable to create a new record.")
              :errors {column (tru "This {0} does not exist." (str/capitalize column))}}

             :row/delete
             {:message (tru "Other tables rely on this row so it cannot be updated/deleted.")
              :errors  {}}

             :row/update
             {:message (tru "Unable to update the record.")
              :errors  {column (tru "This {0} does not exist." (str/capitalize column))}}))))

(defmethod sql-jdbc.actions/maybe-parse-sql-error [:h2 actions.error/incorrect-value-type]
  [_driver error-type _database _action-type error-message]
  (when-let [[_ _expected-type _value]
             (re-find #"Data conversion error converting .*" error-message)]
    {:type    error-type
     :message (tru "Some of your values aren’t of the correct type for the database")
     :errors  {}}))

(comment
 (sql-jdbc.actions/maybe-parse-sql-error
  :h2 actions.error/violate-not-null-constraint nil nil
  "NULL not allowed for column \"RANKING\"; SQL statement:\nINSERT INTO \"PUBLIC\".\"GROUP\" (\"NAME\") VALUES (CAST(? AS VARCHAR)) [23502-214])")
 (sql-jdbc.actions/maybe-parse-sql-error
  :h2 actions.error/violate-unique-constraint (toucan2.core/select-one :model/Database :name "action-error-handling" :engine :h2) nil
  "Unique index or primary key violation: \"PUBLIC.CONSTRAINT_INDEX_4 ON PUBLIC.\"\"GROUP\"\"(RANKING NULLS FIRST) VALUES ( /* 1 */ 1 )\"; SQL statement:\nINSERT INTO \"PUBLIC\".\"GROUP\" (\"NAME\", \"RANKING\") VALUES (CAST(? AS VARCHAR), CAST(? AS INTEGER)) [23505-214]")
 (sql-jdbc.actions/maybe-parse-sql-error
  :h2 actions.error/incorrect-value-type nil nil
  "Data conversion error converting \"S\"; SQL statement:\nUPDATE \"PUBLIC\".\"GROUP\" SET \"RANKING\" = CAST(? AS INTEGER) WHERE \"PUBLIC\".\"GROUP\".\"ID\" = 1 [22018-214]")

 (sql-jdbc.actions/maybe-parse-sql-error
  :h2 actions.error/violate-foreign-key-constraint (toucan2.core/select-one :model/Database :name "action-error-handling" :engine :h2) nil
  "Referential integrity constraint violation: \"USER_GROUP-ID_GROUP_-159406530: PUBLIC.\"\"USER\"\" FOREIGN KEY(\"\"GROUP-ID\"\") REFERENCES PUBLIC.\"\"GROUP\"\"(ID) (CAST(999 AS BIGINT))\"; SQL statement:\nINSERT INTO \"PUBLIC\".\"USER\" (\"NAME\", \"GROUP-ID\") VALUES (CAST(? AS VARCHAR), CAST(? AS INTEGER)) [23506-214]"))
