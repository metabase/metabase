(ns metabase.driver.mysql
  (:require (korma [db :as kdb]
                   mysql)
            (korma.sql [engine :refer [sql-func]]
                       [utils :as korma-utils])
            (metabase.driver [generic-sql :as generic-sql, :refer [GenericSQLIDriverMixin GenericSQLISyncDriverTableFKsMixin
                                                                   GenericSQLISyncDriverFieldAvgLengthMixin GenericSQLISyncDriverFieldPercentUrlsMixin]]
                             [interface :refer [IDriver ISyncDriverTableFKs ISyncDriverFieldAvgLength ISyncDriverFieldPercentUrls
                                                ISyncDriverSpecificSyncField driver-specific-sync-field!]])
            (metabase.driver.generic-sql [interface :refer :all])))

;;; # Korma 0.4.2 Bug Workaround
;; (Buggy code @ https://github.com/korma/Korma/blob/684178c386df529558bbf82097635df6e75fb339/src/korma/mysql.clj)
;; This looks like it's been fixed upstream but until a new release is available we'll have to hack the function here

(defn- mysql-count [query v]
  (sql-func "COUNT" (if (and (or (instance? clojure.lang.Named v) ; the issue was that name was being called on things that like maps when we tried to get COUNT(DISTINCT(...))
                                 (string? v))                     ; which would barf since maps don't implement clojure.lang.Named
                             (= (name v) "*"))
                      (korma-utils/generated "*")
                      v)))

(intern 'korma.mysql 'count mysql-count)


;;; # IMPLEMENTATION

(def ^:private ^:const column->base-type
  {:BIGINT     :BigIntegerField
   :BINARY     :UnknownField
   :BIT        :UnknownField
   :BLOB       :UnknownField
   :CHAR       :CharField
   :DATE       :DateField
   :DATETIME   :DateTimeField
   :DECIMAL    :DecimalField
   :DOUBLE     :FloatField
   :ENUM       :UnknownField
   :FLOAT      :FloatField
   :INT        :IntegerField
   :INTEGER    :IntegerField
   :LONGBLOB   :UnknownField
   :LONGTEXT   :TextField
   :MEDIUMBLOB :UnknownField
   :MEDIUMINT  :IntegerField
   :MEDIUMTEXT :TextField
   :NUMERIC    :DecimalField
   :REAL       :FloatField
   :SET        :UnknownField
   :TEXT       :TextField
   :TIME       :TimeField
   :TIMESTAMP  :DateTimeField
   :TINYBLOB   :UnknownField
   :TINYINT    :IntegerField
   :TINYTEXT   :TextField
   :VARBINARY  :UnknownField
   :VARCHAR    :TextField
   :YEAR       :IntegerField})

#_(defn- column->base-type [t]
  (println "t ================================================================================>" t)
  (column->base-type* t))

(defrecord MySQLDriver []
  ISqlDriverDatabaseSpecific
  (connection-details->connection-spec [_ details]
    (kdb/mysql details))

  (database->connection-details [_ {:keys [details]}]
    details)

  (cast-timestamp-to-date [_ table-name field-name seconds-or-milliseconds]
    (format "CAST(TIMESTAMPADD(%s, `%s`.`%s`, DATE '1970-01-01') AS DATE)"
            (case seconds-or-milliseconds
              :seconds      "SECOND"
              :milliseconds "MILLISECOND")
            table-name field-name))

  (timezone->set-timezone-sql [_ timezone]
    ;; If this fails you need to load the timezone definitions from your system into MySQL;
    ;; run the command `mysql_tzinfo_to_sql /usr/share/zoneinfo | mysql -u root mysql`
    ;; See https://dev.mysql.com/doc/refman/5.7/en/time-zone-support.html for details
    (format "SET @@session.time_zone = '%s';" timezone))

  ISqlDriverQuoteName
  (quote-name [_ nm]
    (str \` nm \`)))

(extend MySQLDriver
  IDriver                     GenericSQLIDriverMixin
  ISyncDriverTableFKs         GenericSQLISyncDriverTableFKsMixin
  ISyncDriverFieldAvgLength   GenericSQLISyncDriverFieldAvgLengthMixin
  ISyncDriverFieldPercentUrls GenericSQLISyncDriverFieldPercentUrlsMixin)

(def ^:const driver
  (map->MySQLDriver {:column->base-type    column->base-type
                     :features             (conj generic-sql/features :set-timezone)
                     :sql-string-length-fn :CHAR_LENGTH}))
