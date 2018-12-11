(ns metabase.driver.presto
  "Presto driver. See https://prestodb.io/docs/current/ for complete dox."
  (:require [clj-http.client :as http]
            [clj-time
             [coerce :as tcoerce]
             [core :as time]
             [format :as tformat]]
            [clojure
             [set :as set]
             [string :as str]]
            [clojure.tools.logging :as log]
            [honeysql
             [core :as hsql]
             [helpers :as h]]
            [metabase
             [config :as config]
             [driver :as driver]
             [util :as u]]
            [metabase.driver.common :as driver.common]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.query-processor
             [store :as qp.store]
             [util :as qputil]]
            [metabase.util
             [date :as du]
             [honeysql-extensions :as hx]
             [schema :as su]
             [ssh :as ssh]]
            [schema.core :as s])
  (:import java.sql.Time
           java.util.Date))

(driver/register! :presto, :parent :sql)

;;; Presto API helpers

(def ^:private PrestoConnectionDetails
  {:host    su/NonBlankString
   :port    (s/cond-pre su/NonBlankString su/IntGreaterThanZero)
   :catalog su/NonBlankString
   s/Any    s/Any})

(s/defn ^:private details->uri
  [{:keys [ssl host port]} :- PrestoConnectionDetails, path]
  (str (if ssl "https" "http") "://" host ":" port
       path))

(defn- details->request [{:keys [user password catalog report-timezone]}]
  (merge {:headers (merge {"X-Presto-Source" "metabase"
                           "X-Presto-User"   user}
                          (when catalog
                            {"X-Presto-Catalog" catalog})
                          (when report-timezone
                            {"X-Presto-Time-Zone" report-timezone}))}
         (when password
           {:basic-auth [user password]})))

(defn- parse-time-with-tz [s]
  ;; Try parsing with offset first then with full ZoneId
  (or (u/ignore-exceptions (du/parse-date "HH:mm:ss.SSS ZZ" s))
      (du/parse-date "HH:mm:ss.SSS ZZZ" s)))

(defn- parse-timestamp-with-tz [s]
  ;; Try parsing with offset first then with full ZoneId
  (or (u/ignore-exceptions (du/parse-date "yyyy-MM-dd HH:mm:ss.SSS ZZ" s))
      (du/parse-date "yyyy-MM-dd HH:mm:ss.SSS ZZZ" s)))

(def ^:private presto-date-time-formatter
  (du/->DateTimeFormatter "yyyy-MM-dd HH:mm:ss.SSS"))

(defn- parse-presto-time
  "Parsing time from presto using a specific formatter rather than the
  utility functions as this will be called on each row returned, so
  performance is important"
  [time-str]
  (->> time-str
       (du/parse-date :hour-minute-second-ms)
       tcoerce/to-long
       Time.))

(defn- field-type->parser [report-timezone field-type]
  (condp re-matches field-type
    #"decimal.*"                bigdec
    #"time"                     parse-presto-time
    #"time with time zone"      parse-time-with-tz
    #"timestamp"                (partial du/parse-date
                                         (if-let [report-tz (and report-timezone
                                                                 (time/time-zone-for-id report-timezone))]
                                           (tformat/with-zone presto-date-time-formatter report-tz)
                                           presto-date-time-formatter))
    #"timestamp with time zone" parse-timestamp-with-tz
    #".*"                       identity))

(defn- parse-presto-results [report-timezone columns data]
  (let [parsers (map (comp #(field-type->parser report-timezone %) :type) columns)]
    (for [row data]
      (vec
       (for [[value parser] (partition 2 (interleave row parsers))]
         (when (some? value)
           (parser value)))))))

(defn- fetch-presto-results! [details {prev-columns :columns, prev-rows :rows} uri]
  (let [{{:keys [columns data nextUri error]} :body} (http/get uri (assoc (details->request details) :as :json))]
    (when error
      (throw (ex-info (or (:message error) "Error running query.") error)))
    (let [rows    (parse-presto-results (:report-timezone details) columns data)
          results {:columns (or columns prev-columns)
                   :rows    (vec (concat prev-rows rows))}]
      (if (nil? nextUri)
        results
        (do (Thread/sleep 100) ; Might not be the best way, but the pattern is that we poll Presto at intervals
            (fetch-presto-results! details results nextUri))))))

(defn- execute-presto-query! [details query]
  {:pre [(map? details)]}
  (ssh/with-ssh-tunnel [details-with-tunnel details]
    (let [{{:keys [columns data nextUri error id]} :body} (http/post (details->uri details-with-tunnel "/v1/statement")
                                                                     (assoc (details->request details-with-tunnel) :body query, :as :json))]
      (when error
        (throw (ex-info (or (:message error) "Error preparing query.") error)))
      (let [rows    (parse-presto-results (:report-timezone details) (or columns []) (or data []))
            results {:columns (or columns [])
                     :rows    rows}]
        (if (nil? nextUri)
          results
          ;; When executing the query, it doesn't return the results, but is geared toward async queries. After
          ;; issuing the query, the below will ask for the results. Asking in a future so that this thread can be
          ;; interrupted if the client disconnects
          (let [results-future (future (fetch-presto-results! details-with-tunnel results nextUri))]
            (try
              @results-future
              (catch InterruptedException e
                (if id
                  ;; If we have a query id, we can cancel the query
                  (try
                    (http/delete (details->uri details-with-tunnel (str "/v1/query/" id))
                                 (details->request details-with-tunnel))
                    ;; If we fail to cancel the query, log it but propogate the interrupted exception, instead of
                    ;; covering it up with a failed cancel
                    (catch Exception e
                      (log/error e (str "Error cancelling query with id " id))))
                  (log/warn "Client connection closed, no query-id found, can't cancel query"))
                ;; Propogate the error so that any finalizers can still run
                (throw e)))))))))


;;; Generic helpers

(defn- quote-name [s]
  {:pre [(string? s)]}
  (str \" (str/replace s "\"" "\"\"") \"))

(defn- quote+combine-names [& names]
  (str/join \. (map quote-name names)))

;;; IDriver implementation

(s/defmethod driver/can-connect? :presto [_ {:keys [catalog] :as details} :- PrestoConnectionDetails]
  (let [{[[v]] :rows} (execute-presto-query! details (str "SHOW SCHEMAS FROM " (quote-name catalog)
                                                          " LIKE 'information_schema'"))]
    (= v "information_schema")))

(defmethod driver/date-interval :presto [_ unit amount]
  (hsql/call :date_add (hx/literal unit) amount :%now))

(s/defn ^:private database->all-schemas :- #{su/NonBlankString}
  "Return a set of all schema names in this `database`."
  [{{:keys [catalog schema] :as details} :details :as database}]
  (let [sql            (str "SHOW SCHEMAS FROM " (quote-name catalog))
        {:keys [rows]} (execute-presto-query! details sql)]
    (set (map first rows))))

(defn- describe-schema [{{:keys [catalog] :as details} :details} {:keys [schema]}]
  (let [sql            (str "SHOW TABLES FROM " (quote+combine-names catalog schema))
        {:keys [rows]} (execute-presto-query! details sql)
        tables         (map first rows)]
    (set (for [table-name tables]
           {:name table-name, :schema schema}))))

(def ^:private excluded-schemas #{"information_schema"})

(defmethod driver/describe-database :presto [driver database]
  (let [schemas (remove excluded-schemas (database->all-schemas database))]
    {:tables (reduce set/union (for [schema schemas]
                                 (describe-schema database {:schema schema})))}))

(defn- presto-type->base-type [field-type]
  (condp re-matches field-type
    #"boolean"     :type/Boolean
    #"tinyint"     :type/Integer
    #"smallint"    :type/Integer
    #"integer"     :type/Integer
    #"bigint"      :type/BigInteger
    #"real"        :type/Float
    #"double"      :type/Float
    #"decimal.*"   :type/Decimal
    #"varchar.*"   :type/Text
    #"char.*"      :type/Text
    #"varbinary.*" :type/*
    #"json"        :type/Text       ; TODO - this should probably be Dictionary or something
    #"date"        :type/Date
    #"time"        :type/Time
    #"time.+"      :type/DateTime
    #"array"       :type/Array
    #"map"         :type/Dictionary
    #"row.*"       :type/*          ; TODO - again, but this time we supposedly have a schema
    #".*"          :type/*))

(defmethod driver/describe-table :presto [_ {{:keys [catalog] :as details} :details} {schema :schema, table-name :name}]
  (let [sql            (str "DESCRIBE " (quote+combine-names catalog schema table-name))
        {:keys [rows]} (execute-presto-query! details sql)]
    {:schema schema
     :name   table-name
     :fields (set (for [[name type] rows]
                    {:name          name
                     :database-type type
                     :base-type     (presto-type->base-type type)}))}))

(defmethod sql.qp/->honeysql [:presto String]
  [_ s]
  (hx/literal (str/replace s "'" "''")))

(defmethod sql.qp/->honeysql [:presto Boolean]
  [_ bool]
  (hsql/raw (if bool "TRUE" "FALSE")))

(defmethod sql.qp/->honeysql [:presto Date]
  [_ date]
  (hsql/call :from_iso8601_timestamp (hx/literal (du/date->iso-8601 date))))

(defmethod sql.qp/->honeysql [:presto :stddev]
  [driver [_ field]]
  (hsql/call :stddev_samp (sql.qp/->honeysql driver field)))

(def ^:private time-format (tformat/formatter "HH:mm:SS.SSS"))

(defn- time->str
  ([t]
   (time->str t nil))
  ([t tz-id]
   (let [tz (time/time-zone-for-id tz-id)]
     (tformat/unparse (tformat/with-zone time-format tz) (tcoerce/to-date-time t)))))

(defmethod sql.qp/->honeysql [:presto :time]
  [_ [_ value]]
  (hx/cast :time (time->str value (driver/report-timezone))))

(defmethod driver/execute-query :presto [_ {database-id                  :database
                                            :keys                        [settings]
                                            {sql :query, params :params} :native
                                            query-type                   :type
                                            :as                          outer-query}]
  (let [sql                    (str "-- "
                                    (qputil/query->remark outer-query) "\n"
                                    (unprepare/unprepare (cons sql params) :quote-escape "'", :iso-8601-fn :from_iso8601_timestamp))
        details                (merge (:details (qp.store/database))
                                      settings)
        {:keys [columns rows]} (execute-presto-query! details sql)
        columns                (for [[col name] (map vector columns (map :name columns))]
                                 {:name name, :base_type (presto-type->base-type (:type col))})]
    (merge
     {:columns (map (comp u/keyword->qualified-name :name) columns)
      :rows    rows}
     ;; only include `:cols` info for native queries for the time being, since it changes all the types up for MBQL
     ;; queries (e.g. `:count` aggregations come back as `:type/BigInteger` instead of `:type/Integer`.) I don't want
     ;; to deal with fixing a million tests to make it work at this second since it doesn't make a difference from an
     ;; FE perspective. Perhaps when we get our test story sorted out a bit better we can fix this
     (when (= query-type :native)
       {:cols columns}))))


(defmethod driver/humanize-connection-error-message :presto [_ message]
  (condp re-matches message
    #"^java.net.ConnectException: Connection refused.*$"
    (driver.common/connection-error-messages :cannot-connect-check-host-and-port)

    #"^clojure.lang.ExceptionInfo: Catalog .* does not exist.*$"
    (driver.common/connection-error-messages :database-name-incorrect)

    #"^java.net.UnknownHostException.*$"
    (driver.common/connection-error-messages :invalid-hostname)

    #".*" ; default
    message))


;;; ISQLDriver implementation

(defmethod sql.qp/apply-top-level-clause [:presto :page] [_ _ honeysql-query {{:keys [items page]} :page}]
  (let [offset (* (dec page) items)]
    (if (zero? offset)
      ;; if there's no offset we can simply use limit
      (h/limit honeysql-query items)
      ;; if we need to do an offset we have to do nesting to generate a row number and where on that
      (let [over-clause (format "row_number() OVER (%s)"
                                (first (hsql/format (select-keys honeysql-query [:order-by])
                                                    :allow-dashed-names? true
                                                    :quoting :ansi)))]
        (-> (apply h/select (map last (:select honeysql-query)))
            (h/from (h/merge-select honeysql-query [(hsql/raw over-clause) :__rownum__]))
            (h/where [:> :__rownum__ offset])
            (h/limit items))))))

(defmethod sql.qp/date [:presto :default]         [_ _ expr] expr)
(defmethod sql.qp/date [:presto :minute]          [_ _ expr] (hsql/call :date_trunc (hx/literal :minute) expr))
(defmethod sql.qp/date [:presto :minute-of-hour]  [_ _ expr] (hsql/call :minute expr))
(defmethod sql.qp/date [:presto :hour]            [_ _ expr] (hsql/call :date_trunc (hx/literal :hour) expr))
(defmethod sql.qp/date [:presto :hour-of-day]     [_ _ expr] (hsql/call :hour expr))
(defmethod sql.qp/date [:presto :day]             [_ _ expr] (hsql/call :date_trunc (hx/literal :day) expr))
;; Presto is ISO compliant, so we need to offset Monday = 1 to Sunday = 1
(defmethod sql.qp/date [:presto :day-of-week]     [_ _ expr] (hx/+ (hx/mod (hsql/call :day_of_week expr) 7) 1))
(defmethod sql.qp/date [:presto :day-of-month]    [_ _ expr] (hsql/call :day expr))
(defmethod sql.qp/date [:presto :day-of-year]     [_ _ expr] (hsql/call :day_of_year expr))

;; Similar to DoW, sicne Presto is ISO compliant the week starts on Monday, we need to shift that to Sunday
(defmethod sql.qp/date [:presto :week]            [_ _ expr]
  (hsql/call :date_add
    (hx/literal :day) -1 (hsql/call :date_trunc
                           (hx/literal :week) (hsql/call :date_add
                                                (hx/literal :day) 1 expr))))

;; Offset by one day forward to "fake" a Sunday starting week
(defmethod sql.qp/date [:presto :week-of-year]    [_ _ expr]
  (hsql/call :week (hsql/call :date_add (hx/literal :day) 1 expr)))

(defmethod sql.qp/date [:presto :month]           [_ _ expr] (hsql/call :date_trunc (hx/literal :month) expr))
(defmethod sql.qp/date [:presto :month-of-year]   [_ _ expr] (hsql/call :month expr))
(defmethod sql.qp/date [:presto :quarter]         [_ _ expr] (hsql/call :date_trunc (hx/literal :quarter) expr))
(defmethod sql.qp/date [:presto :quarter-of-year] [_ _ expr] (hsql/call :quarter expr))
(defmethod sql.qp/date [:presto :year]            [_ _ expr] (hsql/call :year expr))

(defmethod sql.qp/unix-timestamp->timestamp [:presto :seconds] [_ _ expr]
  (hsql/call :from_unixtime expr))


(defmethod driver.common/current-db-time-date-formatters :presto [_]
  (driver.common/create-db-time-formatters "yyyy-MM-dd'T'HH:mm:ss.SSSZ"))

(defmethod driver.common/current-db-time-native-query :presto [_]
  "select to_iso8601(current_timestamp)")

(defmethod driver/current-db-time :presto [& args]
  (apply driver.common/current-db-time args))

(defmethod driver/supports? [:presto :set-timezone]                    [_ _] true)
(defmethod driver/supports? [:presto :basic-aggregations]              [_ _] true)
(defmethod driver/supports? [:presto :standard-deviation-aggregations] [_ _] true)
(defmethod driver/supports? [:presto :expressions]                     [_ _] true)
(defmethod driver/supports? [:presto :native-parameters]               [_ _] true)
(defmethod driver/supports? [:presto :expression-aggregations]         [_ _] true)
(defmethod driver/supports? [:presto :binning]                         [_ _] true)

;; during unit tests don't treat presto as having FK support
(defmethod driver/supports? [:presto :foreign-keys] [_ _] (not config/is-test?))
