(ns metabase.test.data.teradata
  (:require [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.test.data
             [interface :as tx]
             [sql :as sql.tx]
             [sql-jdbc :as sql-jdbc.tx]]
            [metabase.test.data.sql-jdbc
             [execute :as execute]
             [load-data :as load-data]]))

(sql-jdbc.tx/add-test-extensions! :teradata)

(defmethod sql.tx/field-base-type->sql-type [:teradata :type/BigInteger] [_ _] "BIGINT")
(defmethod sql.tx/field-base-type->sql-type [:teradata :type/Boolean]    [_ _] "BYTEINT")
(defmethod sql.tx/field-base-type->sql-type [:teradata :type/Date]       [_ _] "DATE")
(defmethod sql.tx/field-base-type->sql-type [:teradata :type/DateTime]   [_ _] "TIMESTAMP")
(defmethod sql.tx/field-base-type->sql-type [:teradata :type/Decimal]    [_ _] "DECIMAL")
(defmethod sql.tx/field-base-type->sql-type [:teradata :type/Float]      [_ _] "FLOAT")
(defmethod sql.tx/field-base-type->sql-type [:teradata :type/Integer]    [_ _] "INTEGER")
(defmethod sql.tx/field-base-type->sql-type [:teradata :type/Text]       [_ _] "VARCHAR(2048)")
(defmethod sql.tx/field-base-type->sql-type [:teradata :type/Time]       [_ _] "TIME")

;; Tested using Teradata Express VM image. Set the host to the correct address if localhost does not work.
(def ^:private connection-details
  (delay
    {:host     (tx/db-test-env-var-or-throw :teradata :host "localhost")
     :user     (tx/db-test-env-var-or-throw :teradata :user "dbc")
     :password (tx/db-test-env-var-or-throw :teradata :password "dbc")}))

(defmethod tx/dbdef->connection-details :teradata [& _] @connection-details)

(defmethod sql.tx/drop-table-if-exists-sql :teradata [_ {:keys [database-name]} {:keys [table-name]}]
  (format "DROP TABLE \"%s\".\"%s\"⅋" database-name table-name))

(defmethod sql.tx/create-db-sql :teradata [_ {:keys [database-name]}]
  (format "CREATE user \"%s\" AS password=\"%s\" perm=524288000 spool=524288000;" database-name database-name))

(defmethod sql.tx/drop-db-if-exists-sql :teradata [_ {:keys [database-name]}]
  (format "DELETE user \"%s\" ALL; DROP user \"%s\";" database-name database-name))

(defmethod sql.tx/qualified-name-components :teradata
  ([_ db-name]                       [db-name])
  ([_ db-name table-name]            [db-name table-name])
  ([_ db-name table-name field-name] [db-name table-name field-name]))

(defn- dbspec [& _]
  (sql-jdbc.conn/connection-details->spec :teradata @connection-details))

;; TODO override execute to be able to suppress db/table does not exist error.

(defmethod execute/execute-sql! :teradata [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod load-data/load-data! :teradata [& args]
  (apply load-data/load-data-one-at-a-time! args))

(defmethod sql.tx/pk-sql-type :teradata [_]
  "INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1 MINVALUE -2147483647 MAXVALUE 2147483647 NO CYCLE)")
