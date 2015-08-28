(ns metabase.driver.h2
  (:require [clojure.string :as s]
            [korma.db :as kdb]
            [korma.sql.utils :as utils]
            [metabase.db :as db]
            [metabase.driver :as driver]
            (metabase.driver [generic-sql :as generic-sql, :refer [GenericSQLIDriverMixin GenericSQLISyncDriverTableFKsMixin
                                                                   GenericSQLISyncDriverFieldAvgLengthMixin GenericSQLISyncDriverFieldPercentUrlsMixin]]
                             [interface :refer [IDriver ISyncDriverTableFKs ISyncDriverFieldAvgLength ISyncDriverFieldPercentUrls]])
            (metabase.driver.generic-sql [interface :refer [ISqlDriverDatabaseSpecific]]
                                         [util :refer [funcs]])
            [metabase.models.database :refer [Database]]))

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

;; These functions for exploding / imploding the options in the connection strings are here so we can override shady options
;; users might try to put in their connection string. e.g. if someone sets `ACCESS_MODE_DATA` to `rws` we can replace that
;; and make the connection read-only.

(defn- connection-string->file+options
  "Explode a CONNECTION-STRING like `file:my-db;OPTION=100;OPTION_2=TRUE` to a pair of file and an options map.

    (connection-string->file+options \"file:my-crazy-db;OPTION=100;OPTION_X=TRUE\")
      -> [\"file:my-crazy-db\" {\"OPTION\" \"100\", \"OPTION_X\" \"TRUE\"}]"
  [connection-string]
  (let [[file & options] (s/split connection-string #";+")
        options          (into {} (for [option options]
                                    (s/split option #"=")))]
    [file options]))

(defn- file+options->connection-string
  "Implode the results of `connection-string->file+options` back into a connection string."
  [file options]
  (apply str file (for [[k v] options]
                    (str ";" k "=" v))))

(defn- connection-string-set-safe-options
  "Add Metabase Security Settings™ to this CONNECTION-STRING (i.e. try to keep shady users from writing nasty SQL)."
  [connection-string]
  (let [[file options] (connection-string->file+options connection-string)]
    (file+options->connection-string file (merge options {"IFEXISTS"         "TRUE"
                                                          "ACCESS_MODE_DATA" "r"}))))

(defn- connection-details->connection-spec [_ details]
  (kdb/h2 (if db/*allow-potentailly-unsafe-connections* details
              (update details :db connection-string-set-safe-options))))

(defn- database->connection-details [_ {:keys [details]}]
  details)

(defn- unix-timestamp->timestamp [_ field-or-value seconds-or-milliseconds]
  (utils/func (format "TIMESTAMPADD('%s', %%s, TIMESTAMP '1970-01-01T00:00:00Z')" (case seconds-or-milliseconds
                                                                                    :seconds      "SECOND"
                                                                                    :milliseconds "MILLISECOND"))
              [field-or-value]))

(defn- wrap-process-query-middleware [_ qp]
  (fn [{query-type :type, :as query}]
    {:pre [query-type]}
    ;; For :native queries check to make sure the DB in question has a (non-default) NAME property specified in the connection string.
    ;; We don't allow SQL execution on H2 databases for the default admin account for security reasons
    (when (= (keyword query-type) :native)
      (let [{:keys [db]}   (db/sel :one :field [Database :details] :id (:database query))
            _              (assert db)
            [_ options]    (connection-string->file+options db)
            {:strs [USER]} options]
        (when (or (s/blank? USER)
                  (= USER "sa")) ; "sa" is the default USER
          (throw (Exception. "Running SQL queries against H2 databases using the default (admin) database user is forbidden.")))))
    (qp query)))

(defrecord H2Driver [])

(extend H2Driver
  ISqlDriverDatabaseSpecific  {:connection-details->connection-spec connection-details->connection-spec
                               :database->connection-details        database->connection-details
                               :unix-timestamp->timestamp           unix-timestamp->timestamp}
  ;; Override the generic SQL implementation of wrap-process-query-middleware so we can block unsafe native queries (see above)
  IDriver                     (assoc GenericSQLIDriverMixin :wrap-process-query-middleware wrap-process-query-middleware)
  ISyncDriverTableFKs         GenericSQLISyncDriverTableFKsMixin
  ISyncDriverFieldAvgLength   GenericSQLISyncDriverFieldAvgLengthMixin
  ISyncDriverFieldPercentUrls GenericSQLISyncDriverFieldPercentUrlsMixin)

(def ^:const driver
  (map->H2Driver {:column->base-type    column->base-type
                  :features             generic-sql/features
                  :sql-string-length-fn :LENGTH}))
