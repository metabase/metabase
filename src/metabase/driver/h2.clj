(ns metabase.driver.h2
  (:require [clojure.set :as set]
            [korma.db :as kdb]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as generic-sql]))

;; ## CONNECTION

(defn- connection-details->korma-connection [details-map]
  (korma.db/h2 (set/rename-keys details-map {:conn_str :db})))

(defn- database->connection-details [database]
  (:details database))


;; ## SYNCING

(def ^:const column->base-type
  "Map of H2 Column types -> Field base types. (Add more mappings here as needed)"
  {:ARRAY                 :UnknownField
   :BIGINT                :BigIntegerField
   :BINARY                :UnknownField
   :BIT                   :BooleanField
   :BLOB                  :UnknownField
   :BOOL                  :BooleanField
   :BOOLEAN               :BooleanField
   :BYTEA                 :UnknownField
   :CHAR                  :CharField
   :CHARACTER             :CharField
   :CLOB                  :TextField
   :DATE                  :DateField
   :DATETIME              :DateTimeField
   :DEC                   :DecimalField
   :DECIMAL               :DecimalField
   :DOUBLE                :FloatField
   :FLOAT                 :FloatField
   :FLOAT4                :FloatField
   :FLOAT8                :FloatField
   :GEOMETRY              :UnknownField
   :IDENTITY              :IntegerField
   :IMAGE                 :UnknownField
   :INT                   :IntegerField
   :INT2                  :IntegerField
   :INT4                  :IntegerField
   :INT8                  :BigIntegerField
   :INTEGER               :IntegerField
   :LONGBLOB              :UnknownField
   :LONGTEXT              :TextField
   :LONGVARBINARY         :UnknownField
   :LONGVARCHAR           :TextField
   :MEDIUMBLOB            :UnknownField
   :MEDIUMINT             :IntegerField
   :MEDIUMTEXT            :TextField
   :NCHAR                 :CharField
   :NCLOB                 :TextField
   :NTEXT                 :TextField
   :NUMBER                :DecimalField
   :NUMERIC               :DecimalField
   :NVARCHAR              :TextField
   :NVARCHAR2             :TextField
   :OID                   :UnknownField
   :OTHER                 :UnknownField
   :RAW                   :UnknownField
   :REAL                  :FloatField
   :SIGNED                :IntegerField
   :SMALLDATETIME         :DateTimeField
   :SMALLINT              :IntegerField
   :TEXT                  :TextField
   :TIME                  :TimeField
   :TIMESTAMP             :DateTimeField
   :TINYBLOB              :UnknownField
   :TINYINT               :IntegerField
   :TINYTEXT              :TextField
   :UUID                  :TextField
   :VARBINARY             :UnknownField
   :VARCHAR               :TextField
   :VARCHAR2              :TextField
   :VARCHAR_CASESENSITIVE :TextField
   :VARCHAR_IGNORECASE    :TextField
   :YEAR                  :IntegerField
   (keyword "DOUBLE PRECISION") :FloatField})

;; ## DRIVER

(def ^:const driver
  (generic-sql/make-sql-driver
   :column->base-type                    column->base-type
   :connection-details->korma-connection connection-details->korma-connection
   :database->connection-details         database->connection-details
   :sql-string-length-fn                 :LENGTH
   :timezone->set-timezone-sql           nil))
