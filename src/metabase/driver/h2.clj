(ns metabase.driver.h2
  (:require [korma.db :as kdb]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as generic-sql]
            [metabase.driver.generic-sql.interface :refer :all]))

(def ^:private ^:const column->base-type
  "Map of H2 Column types -> Field base types. (Add more mappings here as needed)"
  {:ARRAY                       :UnknownField
   :BIGINT                      :BigIntegerField
   :BINARY                      :UnknownField
   :BIT                         :BooleanField
   :BLOB                        :UnknownField
   :BOOL                        :BooleanField
   :BOOLEAN                     :BooleanField
   :BYTEA                       :UnknownField
   :CHAR                        :CharField
   :CHARACTER                   :CharField
   :CLOB                        :TextField
   :DATE                        :DateField
   :DATETIME                    :DateTimeField
   :DEC                         :DecimalField
   :DECIMAL                     :DecimalField
   :DOUBLE                      :FloatField
   :FLOAT                       :FloatField
   :FLOAT4                      :FloatField
   :FLOAT8                      :FloatField
   :GEOMETRY                    :UnknownField
   :IDENTITY                    :IntegerField
   :IMAGE                       :UnknownField
   :INT                         :IntegerField
   :INT2                        :IntegerField
   :INT4                        :IntegerField
   :INT8                        :BigIntegerField
   :INTEGER                     :IntegerField
   :LONGBLOB                    :UnknownField
   :LONGTEXT                    :TextField
   :LONGVARBINARY               :UnknownField
   :LONGVARCHAR                 :TextField
   :MEDIUMBLOB                  :UnknownField
   :MEDIUMINT                   :IntegerField
   :MEDIUMTEXT                  :TextField
   :NCHAR                       :CharField
   :NCLOB                       :TextField
   :NTEXT                       :TextField
   :NUMBER                      :DecimalField
   :NUMERIC                     :DecimalField
   :NVARCHAR                    :TextField
   :NVARCHAR2                   :TextField
   :OID                         :UnknownField
   :OTHER                       :UnknownField
   :RAW                         :UnknownField
   :REAL                        :FloatField
   :SIGNED                      :IntegerField
   :SMALLDATETIME               :DateTimeField
   :SMALLINT                    :IntegerField
   :TEXT                        :TextField
   :TIME                        :TimeField
   :TIMESTAMP                   :DateTimeField
   :TINYBLOB                    :UnknownField
   :TINYINT                     :IntegerField
   :TINYTEXT                    :TextField
   :UUID                        :TextField
   :VARBINARY                   :UnknownField
   :VARCHAR                     :TextField
   :VARCHAR2                    :TextField
   :VARCHAR_CASESENSITIVE       :TextField
   :VARCHAR_IGNORECASE          :TextField
   :YEAR                        :IntegerField
   (keyword "DOUBLE PRECISION") :FloatField})

(defrecord ^:private H2Driver []
  ISqlDriverDatabaseSpecific
  (connection-details->connection-spec [_ details]
    (kdb/h2 details))

  (database->connection-details [_ {:keys [details]}]
    details)

  (cast-timestamp-to-date [_ table-name field-name seconds-or-milliseconds]
    (format "CAST(TIMESTAMPADD('%s', \"%s\".\"%s\", DATE '1970-01-01') AS DATE)"
            (case seconds-or-milliseconds
              :seconds      "SECOND"
              :milliseconds "MILLISECOND")
            table-name field-name)))

(generic-sql/extend-add-generic-sql-mixins H2Driver)

(def ^:const driver
  (map->H2Driver {:column->base-type    column->base-type
                  :features             generic-sql/features
                  :sql-string-length-fn :LENGTH}))
