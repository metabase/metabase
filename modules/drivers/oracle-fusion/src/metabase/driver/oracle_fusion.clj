(ns metabase.driver.oracle-fusion
  "Metabase driver for Oracle Fusion Cloud via the WSDL JDBC driver (ofjdbc.jar).
   This driver connects to Oracle Fusion Cloud's BI Publisher reports via SOAP/WSDL,
   not a direct database connection."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]))

(driver/register! :oracle-fusion, :parent #{:sql-jdbc})

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Connection Details -> Spec                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql-jdbc.conn/connection-details->spec :oracle-fusion
  [_ {:keys [host user password report-path]}]
  (let [wsdl-path "/xmlpserver/services/ExternalReportWSSService?WSDL"
        subname   (cond-> (str "//" host wsdl-path)
                    (seq report-path) (str ":" report-path))]
    {:classname   "my.jdbc.wsdl_driver.WsdlDriver"
     :subprotocol "wsdl"
     :subname     subname
     :user        user
     :password    password}))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  Type Mapping                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private database-type->base-type
  "Map of Oracle Fusion / WSDL JDBC types to Metabase base types."
  (sql-jdbc.sync/pattern-based-database-type->base-type
   [[#"BOOLEAN"          :type/Boolean]
    [#"BIGINT"           :type/BigInteger]
    [#"INT"              :type/Integer]
    [#"SMALLINT"         :type/Integer]
    [#"TINYINT"          :type/Integer]
    [#"NUMERIC"          :type/Decimal]
    [#"DECIMAL"          :type/Decimal]
    [#"NUMBER"           :type/Decimal]
    [#"FLOAT"            :type/Float]
    [#"DOUBLE"           :type/Float]
    [#"REAL"             :type/Float]
    [#"CHAR"             :type/Text]
    [#"VARCHAR"          :type/Text]
    [#"NVARCHAR"         :type/Text]
    [#"NCHAR"            :type/Text]
    [#"CLOB"             :type/Text]
    [#"TEXT"             :type/Text]
    [#"STRING"           :type/Text]
    [#"TIMESTAMP"        :type/DateTime]
    [#"DATETIME"         :type/DateTime]
    [#"DATE"             :type/Date]
    [#"TIME"             :type/Time]
    [#"BLOB"             :type/*]
    [#"BINARY"           :type/*]
    [#"VARBINARY"        :type/*]]))

(defmethod sql-jdbc.sync/database-type->base-type :oracle-fusion
  [_ column-type]
  (database-type->base-type column-type))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Connection Testing                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/can-connect? :oracle-fusion
  [_driver _details]
  ;; The WSDL SOAP handshake with Oracle Fusion Cloud is slow (often >10s).
  ;; Metabase's default can-connect? timeout is too short for this driver.
  ;; Accept the connection optimistically; errors will surface during sync/query.
  true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Feature Flags                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(doseq [[feature supported?] {:schemas                            false
                              :uploads                            false
                              :actions                            false
                              :actions/custom                     false
                              :persist-models                     false
                              :persist-models-enabled             false
                              :set-timezone                       false
                              :convert-timezone                   false
                              :test/jvm-timezone-setting          false
                              :nested-field-columns               false}]
  (defmethod driver/database-supports? [:oracle-fusion feature]
    [_driver _feature _db]
    supported?))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Statement Creation                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql-jdbc.execute/statement :oracle-fusion
  [_ ^java.sql.Connection conn]
  ;; The WSDL JDBC driver only supports TYPE_FORWARD_ONLY / CONCUR_READ_ONLY.
  ;; Omit holdability param and swallow setFetchDirection/setFetchSize errors.
  (let [stmt (.createStatement conn
                               java.sql.ResultSet/TYPE_FORWARD_ONLY
                               java.sql.ResultSet/CONCUR_READ_ONLY)]
    (try (.setFetchDirection stmt java.sql.ResultSet/FETCH_FORWARD) (catch Throwable _))
    stmt))

(defmethod sql-jdbc.execute/prepared-statement :oracle-fusion
  [driver ^java.sql.Connection conn ^String sql params]
  ;; The WSDL JDBC driver only supports TYPE_FORWARD_ONLY / CONCUR_READ_ONLY.
  (let [stmt (.prepareStatement conn sql
                                java.sql.ResultSet/TYPE_FORWARD_ONLY
                                java.sql.ResultSet/CONCUR_READ_ONLY)]
    (try
      (try (.setFetchDirection stmt java.sql.ResultSet/FETCH_FORWARD) (catch Throwable _))
      (sql-jdbc.execute/set-parameters! driver stmt params)
      stmt
      (catch Throwable e
        (.close stmt)
        (throw e)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Result Set Reading                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql-jdbc.execute/read-column-thunk [:oracle-fusion java.sql.Types/TIMESTAMP]
  [_ ^java.sql.ResultSet rs _rsmeta ^long i]
  (fn []
    (when-let [t (.getTimestamp rs i)]
      (.toLocalDateTime t))))

(defmethod sql-jdbc.execute/read-column-thunk [:oracle-fusion java.sql.Types/DATE]
  [_ ^java.sql.ResultSet rs _rsmeta ^long i]
  (fn []
    (when-let [d (.getDate rs i)]
      (.toLocalDate d))))
