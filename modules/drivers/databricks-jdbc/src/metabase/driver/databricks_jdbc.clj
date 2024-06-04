(ns metabase.driver.databricks-jdbc
  (:require
   #_[java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.interface :as sql-jdbc.sync.interface]
   [metabase.driver.sql.query-processor :as sql.qp]
   #_[metabase.driver.sql.util :as sql.u]
   #_[metabase.driver.sql.util.unprepare :as unprepare]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.query-processor.store :as qp.store]
   #_[metabase.query-processor.util :as qp.util]
   [metabase.util :as u]
   [ring.util.codec :as codec])
  (:import
   [java.sql Connection Date PreparedStatement Timestamp]
   [java.time LocalDate LocalDateTime]))

(set! *warn-on-reflection* true)

(driver/register! :databricks-jdbc, :parent :sql-jdbc)

(doseq [[feature supported?] {:basic-aggregations              true
                              :binning                         true
                              :expression-aggregations         true
                              :expressions                     true
                              :native-parameters               true
                              :nested-queries                  true
                              :standard-deviation-aggregations true
                              :test/jvm-timezone-setting       false}]
  (defmethod driver/database-supports? [:databricks-jdbc feature] [_driver _feature _db] supported?))

;; TODO: Following is probably incorrect. Find out why it was added and address!
#_(defmethod sql-jdbc.execute/statement-supported? :databricks-jdbc [_] false)

(defmethod sql-jdbc.conn/connection-details->spec :databricks-jdbc
  [_driver {:keys [catalog host http-path schema token] :as _details}]
  {:classname        "com.databricks.client.jdbc.Driver"
   :subprotocol      "databricks"
   ;; TODO: urlencode strings!
   :subname          (str "//" host ":443/"
                          ;; TODO: following should be mandatory!
                          (when (string? (not-empty catalog))
                            (str ";ConnCatalog=" (codec/url-encode catalog)))
                          (when (string? (not-empty schema))
                            (str ";ConnSchema=" (codec/url-encode schema))))
   :transportMode    "http"
   :ssl              1
   :AuthMech         3
   :httpPath         http-path
   :uid              "token"
   :pwd              token
   ;; TODO: Decide whether following is necessary
   ;;       based on https://docs.databricks.com/en/integrations/jdbc/capability.html#jdbc-native.
   :UseNativeQuery 1
   ;; TODO: There's an exception
   "LogLevel" 0})

;; TODO: Rather make this public in original namespace.
(defn- db-or-id-or-spec->database [db-or-id-or-spec]
  (cond (mi/instance-of? :model/Database db-or-id-or-spec)
        db-or-id-or-spec

        (integer? db-or-id-or-spec)
        (qp.store/with-metadata-provider db-or-id-or-spec
          (lib.metadata/database (qp.store/metadata-provider)))

        :else
        nil))

(defmethod driver/describe-database :databricks-jdbc
  [driver db-or-id-or-spec]
  {:tables
   (sql-jdbc.execute/do-with-connection-with-options
    driver
    db-or-id-or-spec
    nil
    (fn [^Connection conn]
      (let [database                 (db-or-id-or-spec->database db-or-id-or-spec)
            {:keys [catalog schema]} (:details database)
            dbmeta                   (.getMetaData conn)]
        (with-open [rs (.getTables dbmeta catalog schema nil
                                   ;; manually verified
                                   (into-array String ["TABLE" "VIEW"]))]
          (let [rs-meta (.getMetaData rs)
                col-count (.getColumnCount rs-meta)
                rows (loop [rows []]
                       (.next rs)
                       (if (.isAfterLast rs)
                         rows
                         (recur (conj rows (mapv (fn [idx]
                                                   (.getObject rs ^long idx))
                                                 (map inc (range col-count)))))))
                fields (map (fn [[_catalog schema table-name _table-type remarks]]
                              {:name table-name
                               :schema schema
                               :description remarks})
                            rows)
                ;; eg this could be execute for all fields first?
                fields* (filter (comp (partial sql-jdbc.sync.interface/have-select-privilege?
                                               :databricks-jdbc
                                               conn
                                               schema)
                                      :name)
                                fields)]
            (set fields*))))))})

;; TODO: Why is the following required?
#_(defmethod sql-jdbc.conn/data-warehouse-connection-pool-properties :databricks-jdbc
  [driver database]
  (merge
   ((get-method sql-jdbc.conn/data-warehouse-connection-pool-properties :sql-jdbc) driver database)
   {"preferredTestQuery" "SELECT 1"}))

;; TODO: Verify the types are correct!
(defmethod sql-jdbc.sync/database-type->base-type :databricks-jdbc
  [_ database-type]
  (condp re-matches (u/lower-case-en (name database-type))
    #"boolean"          :type/Boolean
    #"tinyint"          :type/Integer
    #"smallint"         :type/Integer
    #"int"              :type/Integer
    #"bigint"           :type/BigInteger
    #"float"            :type/Float
    #"double"           :type/Float
    #"double precision" :type/Double
    #"decimal.*"        :type/Decimal
    #"char.*"           :type/Text
    #"varchar.*"        :type/Text
    #"string.*"         :type/Text
    #"binary*"          :type/*
    #"date"             :type/Date
    #"time"             :type/Time
    #"timestamp"        :type/DateTime
    #"interval"         :type/*
    #"array.*"          :type/Array
    #"map"              :type/Dictionary
    #".*"               :type/*))

#_(defn- valid-describe-table-row? [{:keys [col_name data_type]}]
  (every? (every-pred (complement str/blank?)
                      (complement #(str/starts-with? % "#")))
          [col_name data_type]))

#_(defn- dash-to-underscore [s]
  (when s
    (str/replace s #"-" "_")))

;; TODO: Following probably also not necessary!
#_(defmethod driver/describe-table :databricks-jdbc
  [driver database {table-name :name, schema :schema}]
  {:name   table-name
   :schema schema
   :fields
   (with-open [conn (jdbc/get-connection (sql-jdbc.conn/db->pooled-connection-spec database))]
     (let [results (jdbc/query {:connection conn} [(format
                                                    "describe %s"
                                                    (sql.u/quote-name driver :table
                                                                      (dash-to-underscore schema)
                                                                      (dash-to-underscore table-name)))])]
       (set
        (for [[idx {col-name :col_name, data-type :data_type, :as result}] (m/indexed results)
              :while (valid-describe-table-row? result)]
          {:name              col-name
           :database-type     data-type
           :base-type         (sql-jdbc.sync/database-type->base-type :databricks-jdbc (keyword data-type))
           :database-position idx}))))})

;; TODO: Why is the following required?
#_(def ^:dynamic *param-splice-style*
  "How we should splice params into SQL (i.e. 'unprepare' the SQL). Either `:friendly` (the default) or `:paranoid`.
  `:friendly` makes a best-effort attempt to escape strings and generate SQL that is nice to look at, but should not
  be considered safe against all SQL injection -- use this for 'convert to SQL' functionality. `:paranoid` hex-encodes
  strings so SQL injection is impossible; this isn't nice to look at, so use this for actually running a query."
  :friendly)

;; TODO: Why is the following required?
;; bound variables are not supported in Spark SQL (maybe not Hive either, haven't checked)
#_(defmethod driver/execute-reducible-query :databricks-jdbc
  [driver {{sql :query, :keys [params], :as inner-query} :native, :as outer-query} context respond]
  (let [inner-query (-> (assoc inner-query
                               :remark (qp.util/query->remark :databricks-jdbc outer-query)
                               :query  (if (seq params)
                                         (binding [*param-splice-style* :paranoid]
                                           (unprepare/unprepare driver (cons sql params)))
                                         sql)
                               ;; TODO: mbql u inaccessible, resolve!
                               :max-rows 1000 #_(mbql.u/query->max-rows-limit outer-query))
                        (dissoc :params))
        query       (assoc outer-query :native inner-query)]
    ((get-method driver/execute-reducible-query :sql-jdbc) driver query context respond)))

;; TODO: Databricks should be able to handle setting session timezone!
#_(defmethod sql-jdbc.execute/connection-with-timezone :databricks-jdbc
  [driver database _timezone-id]
  (let [conn (.getConnection (sql-jdbc.execute/datasource-with-diagnostic-info! driver database))]
    (try
      (.setTransactionIsolation conn Connection/TRANSACTION_READ_UNCOMMITTED)
      conn
      (catch Throwable e
        (.close conn)
        (throw e)))))

;; TODO: Why is the following required?
#_(defmethod sql-jdbc.execute/prepared-statement :databricks-jdbc
  [driver ^Connection conn ^String sql params]
  (let [stmt (.prepareStatement conn sql
                                ResultSet/TYPE_FORWARD_ONLY
                                ResultSet/CONCUR_READ_ONLY)]
    (try
      (.setFetchDirection stmt ResultSet/FETCH_FORWARD)
      (sql-jdbc.execute/set-parameters! driver stmt params)
      stmt
      (catch Throwable e
        (.close stmt)
        (throw e)))))

;; TODO: Why is the following required?
#_(when-not (get (methods driver/database-supports?) [:databricks-jdbc :foreign-keys])
  (defmethod driver/database-supports? [:databricks-jdbc :foreign-keys] [_driver _feature _db] true))

(defmethod sql.qp/quote-style :databricks-jdbc
  [_driver]
  :mysql)

;; TODO: unprepare value
;; TODO: Verify following is actually the right thing to do.
(defmethod sql-jdbc.execute/set-parameter [:databricks-jdbc LocalDate]
  [_driver ^PreparedStatement ps i ^LocalDate t]
  (.setObject ps i (Date/valueOf t)))

;; TODO: unprepare value
;; TODO: Verify following is actually the right thing to do.
(defmethod sql-jdbc.execute/set-parameter [:databricks-jdbc LocalDateTime]
  [_driver ^PreparedStatement ps i ^LocalDateTime t]
  (.setObject ps i (Timestamp/valueOf t)))

;; TODO: !!!
#_(defmethod sql.qp/add-interval-honeysql-form :databricks-plain
  [driver hsql-form amount unit]
  (if (= unit :quarter)
    (recur driver hsql-form (* amount 3) :month)
    (h2x/+ (h2x/->timestamp hsql-form)
           [::interval amount unit])))
