(ns metabase.driver.druid-jdbc
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor.util :as sql.qp.u]
   [metabase.driver.sql.util.unprepare :as unprepare]
   [metabase.lib.field :as lib.field]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.util.honey-sql-2 :as h2x])
  (:import
   (java.sql ResultSet Types)
   (java.time ZonedDateTime)))

(set! *warn-on-reflection* true)

(driver/register! :druid-jdbc :parent :sql-jdbc)

;; TODO: remove support of sql and sql-jdbc features for now!
(doseq [[feature supported?] {:set-timezone            true
                              :expression-aggregations true}]
  (defmethod driver/database-supports? [:druid feature] [_driver _feature _db] supported?))

;; TODO: Clean up!
(defmethod driver/database-supports? [:druid-jdbc :nested-field-columns] [& _] true)
#_(defmethod driver/database-supports? (:engine database) :nested-field-columns database)

;; TODO: Double check this driver does not have to implement the following method.
#_(defmethod driver/describe-database :druid-jdbc
    [_ database]
    #_{:tables #{{:name "checkins", :schema "druid", :description nil}}}
  ;; should be -- or is the druid schema correct? -- probably
    #_{:tables #{{:schema nil, :name "checkins"}}}
    (sql-jdbc.sync/describe-database :druid-jdbc database))

;; TODO: Verify we do not need `;transparent_reconnection=true` parameter! If parameter is left out it seems
;;       connections can not be acquired!
(defmethod sql-jdbc.conn/connection-details->spec :druid-jdbc
  [_driver {:keys [host port] :as _db-details}]
  {:classname   "org.apache.calcite.avatica.remote.Driver"
   :subprotocol "avatica:remote"
   :subname     (str "url=http://" host ":" port "/druid/v2/sql/avatica/;transparent_reconnection=true")})

;; TODO: Implement COMPLEX type handling!
(defmethod sql-jdbc.sync/database-type->base-type :druid-jdbc
  [_ database-type]
  ({:TIMESTAMP            :type/DateTime
    :VARCHAR              :type/Text
    :DECIMAL              :type/Decimal
    :FLOAT                :type/Float
    :REAL                 :type/Float
    :DOUBLE               :type/Float
    :BIGINT               :type/BigInteger
    :COMPLEX<json>        :type/JSON}
   database-type
   :type/*))

;; TODO: Verify that use of local-date-time is correct here.
(defmethod sql-jdbc.execute/read-column-thunk [:druid-jdbc Types/TIMESTAMP]
  [_ ^ResultSet rs _ ^long i]
  (fn []
    (t/local-date-time (.getObject rs i))))

;; TODO: 1111, the OTHER, type should be handled more robustly. There should be more specific type info available
;;       _somewhere_, sync gets the COMPLEX<...> type value. It would make sense to use it here to decide on type
;;       handling.
;;       ...
;;      COMPLEX<...> is gathered from `DatabaseMetaData`, that's not available here.
(defmethod sql-jdbc.execute/read-column-thunk [:druid-jdbc 1111]
  [_ ^ResultSet rs _ ^long i]
  (fn []
    (let [o (.getObject rs i)]
      (cond-> o
        (string? o) (str/replace  #"^\"|\"$" "")))))

;; TODO: Following currently has no effect. Find a way how to set start of week for Druid JDBC!
(defmethod driver/db-start-of-week :druid
  [_]
  :sunday)

;; TODO: Verify literal use if fine here.
(defn- date-trunc [unit expr] [:date_trunc (h2x/literal unit) expr])

(defmethod sql.qp/date [:druid-jdbc :default] [_ _ expr] expr)
(defmethod sql.qp/date [:druid-jdbc :minute] [_ _ expr] (date-trunc :minute expr))
(defmethod sql.qp/date [:druid-jdbc :hour] [_ _ expr] (date-trunc :hour expr))
(defmethod sql.qp/date [:druid-jdbc :day] [_ _ expr] (date-trunc :day expr))
(defmethod sql.qp/date [:druid-jdbc :week] [_ _ expr] (date-trunc :week expr))
(defmethod sql.qp/date [:druid-jdbc :month] [_ _ expr] (date-trunc :month expr))
(defmethod sql.qp/date [:druid-jdbc :quarter] [_ _ expr] (date-trunc :quarter expr))
(defmethod sql.qp/date [:druid-jdbc :year] [_ _ expr] (date-trunc :year expr))

;; TODO: Verify literal use if fine here.
(defn- time-extract [unit expr] [:time_extract expr (h2x/literal unit)])

(defmethod sql.qp/date [:druid-jdbc :minute-of-hour] [_ _ expr] (time-extract :minute expr))
(defmethod sql.qp/date [:druid-jdbc :hour-of-day] [_ _ expr] (time-extract :hour expr))
(defmethod sql.qp/date [:druid-jdbc :day-of-week] [_ _ expr] (time-extract :dow expr))
(defmethod sql.qp/date [:druid-jdbc :day-of-month] [_ _ expr] (time-extract :day expr))
(defmethod sql.qp/date [:druid-jdbc :day-of-year] [_ _ expr] (time-extract :doy expr))
(defmethod sql.qp/date [:druid-jdbc :week-of-year] [_ _ expr] (time-extract :week expr))
(defmethod sql.qp/date [:druid-jdbc :month-of-year] [_ _ expr] (time-extract :month expr))
(defmethod sql.qp/date [:druid-jdbc :quarter-of-year] [_ _ expr] (time-extract :quarter expr))

(defmethod sql.qp/current-datetime-honeysql-form :druid-jdbc
  [_]
  [:raw "CURRENT_TIMESTAMP"])

;; `identifier` is used here because for reasons unknown timestampadd requires "unit" quoting isntead of single quote.
(defmethod sql.qp/add-interval-honeysql-form :druid-jdbc
  [_ hsql-form amount unit]
  [:TIMESTAMPADD (h2x/identifier :type-name unit) (h2x/->integer amount) hsql-form])

;; TODO: Instead of this, use varchar typing when doing group by
(defmethod driver/field-values-compatible? :druid-jdbc
  [_driver {:keys [database_type] :as _field}]
  (not (re-find #"COMPLEX<" (str database_type))))

(defmethod sql-jdbc.conn/data-source-name :druid-jdbc
  [_driver {:keys [host port] :as _details}]
  (format "druid-%s-%s" host port))

(defmethod sql-jdbc.execute/set-parameter [:druid-jdbc ZonedDateTime]
  [driver ps i t]
  (sql-jdbc.execute/set-parameter driver ps i (t/format "yyyy-MM-dd HH:mm:ss" t)))

(defmethod unprepare/unprepare-value [:druid-jdbc ZonedDateTime]
  [_ t]
  (format "'%s'" (t/format "yyyy-MM-dd HH:mm:ss" t)))

;; TODO: Cleanup!
(defmethod sql.qp/json-query :druid-jdbc
  [_driver unwrapped-identifier nfc-field]
  (assert (h2x/identifier? unwrapped-identifier)
          (format "Invalid identifier: %s" (pr-str unwrapped-identifier)))
  (let [#_#_field-type        (doto (:database-type nfc-field)
                            #_(as-> $ (tap> ["jsoon-q type" nfc-field])))
        nfc-path          (:nfc-path nfc-field)
        parent-identifier (sql.qp.u/nfc-field->parent-identifier unwrapped-identifier nfc-field)]
    (if (isa? (:base-type nfc-field) :type/Array)
      [::json_query parent-identifier [:raw "'" (str  (str/join "." (into ["$"] (rest nfc-path)))) "'"]]
      [::json_value parent-identifier [:raw "'" (str  (str/join "." (into ["$"] (rest nfc-path)))) "'"]])
    #_[::json-query parent-identifier field-type (rest nfc-path)]))

(defmethod sql.qp/->honeysql [:druid-jdbc :field]
  [driver [_ id-or-name opts :as clause]]
  (let [stored-field  (when (integer? id-or-name)
                        (lib.metadata/field (qp.store/metadata-provider) id-or-name))
        parent-method (get-method sql.qp/->honeysql [:sql :field])
        identifier    (parent-method driver clause)]
    (if-not (lib.field/json-field? stored-field)
      identifier
      (if (or (::sql.qp/forced-alias opts)
              (= ::add/source (::add/source-table opts)))
        (keyword (::add/source-alias opts))
        (walk/postwalk #(if (h2x/identifier? %)
                          (sql.qp/json-query :druid-jdbc % stored-field)
                          %)
                       identifier)))))

;; TODO: Cleanup
(defmethod sql-jdbc.sync/column->semantic-type :druid-jdbc
  [_driver database-type _column-name]
  #_(when (re-find #"json" (name database-type))
    (def dddd database-type))
  (case database-type
    "COMPLEX<json>"  :type/SerializedJSON
    nil))

;; TODO: Make this dependent on database features only, not the application state.
(defmethod driver/database-supports? [:druid-jdbc :nested-field-columns]
  [_driver _feat db]
  (driver.common/json-unfolding-default db))

;; TODO: Consider creating common namespace with client from original Druid driver and use that instead.
;; TODO: Does it make sense to take only maj min as jdbc does?
(defmethod driver/dbms-version :druid-jdbc
  [_driver database]
  (let [{:keys [host port]} (:details database)]
    (try (let [version (-> (http/get (format "http://%s:%s/status" host port))
                           :body
                           json/parse-string
                           (get "version"))
               [maj-min maj min] (re-find #"^(\d+)\.(\d+)" version)
               semantic (mapv #(Integer/parseInt %) [maj min])]
           {:version maj-min
            :semantic-version semantic})
         (catch Throwable _
           (log/warn "Unable to get dbms version. Using 0 fallback.")
           {:version "0.0"
            :semantic-version [0 0]
            :flavor "fallback"}))))

;; This should go
(defmethod sql.qp/cast-temporal-string [:druid-jdbc :Coercion/ISO8601->EpochMillis]
  [_driver _semantic_type expr]
  [::timestamp_to_millis expr]
  #_(h2x/->time expr))

