(ns metabase.driver.presto
  "Presto driver. See https://prestodb.io/docs/current/ for complete dox."
  (:require [buddy.core.codecs :as codecs]
            [clj-http.client :as http]
            [clojure
             [set :as set]
             [string :as str]]
            [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            [honeysql
             [core :as hsql]
             [helpers :as h]]
            [java-time :as t]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.common :as driver.common]
            [metabase.driver.sql
             [query-processor :as sql.qp]
             [util :as sql.u]]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.query-processor
             [context :as context]
             [store :as qp.store]
             [timezone :as qp.timezone]
             [util :as qputil]]
            [metabase.util
             [date-2 :as u.date]
             [honeysql-extensions :as hx]
             [i18n :refer [trs tru]]
             [schema :as su]
             [ssh :as ssh]]
            [schema.core :as s])
  (:import java.sql.Time
           [java.time OffsetDateTime ZonedDateTime]))

(driver/register! :presto, :parent :sql)

;;; Presto API helpers

(def ^:private PrestoConnectionDetails
  {:host    su/NonBlankString
   :port    (s/cond-pre su/NonBlankString su/IntGreaterThanZero)
   :catalog su/NonBlankString
   s/Any    s/Any})

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

(s/defn ^:private details->uri
  [{:keys [ssl host port]} :- PrestoConnectionDetails, path]
  (str (if ssl "https" "http") "://" host ":" port
       path))

(defn- details->request [{:keys [user password catalog]}]
  (merge {:headers (merge {"X-Presto-Source" "metabase"
                           "X-Presto-User"   user}
                          (when catalog
                            {"X-Presto-Catalog" catalog})
                          (when-let [report-timezone (qp.timezone/report-timezone-id-if-supported :presto)]
                            {"X-Presto-Time-Zone" report-timezone}))}
         (when password
           {:basic-auth [user password]})))

(defn ^:private create-cancel-url [cancel-uri host port info-uri]
  ;; Replace the host in the cancel-uri with the host from the info-uri provided from the presto response- this doesn't
  ;; break SSH tunneling as the host in the cancel-uri is different if it's enabled
  (str/replace cancel-uri (str host ":" port) (get (str/split info-uri #"/") 2)))

(defn- field-type->parser [field-type]
  (letfn [(parse-temporal [s]
            (u.date/parse s (qp.timezone/results-timezone-id)))]
    (condp re-matches field-type
      #"decimal.*"                bigdec
      #"time"                     parse-temporal
      #"time with time zone"      parse-temporal
      #"timestamp"                parse-temporal
      #"timestamp with time zone" parse-temporal
      identity)))

(defn- parse-row-fn [cols]
  (let [parsers (mapv (comp field-type->parser :type) cols)]
    (fn [row]
      (mapv
       (fn [v parser]
         (u/prog1 (when (some? v)
                    (parser v))
           (log/tracef "Parse %s -> %s" (pr-str v) (pr-str <>))))
       row
       parsers))))

(defn- fetch-next-page [details uri]
  (log/debug (trs "fetch-next-page w/ URI") uri)
  (let [{{:keys [columns data nextUri error]} :body} (http/get uri (assoc (details->request details) :as :json))]
    (when error
      (throw (ex-info (or (:message error) (tru "Error running query.")) error)))
    (let [parse-row (parse-row-fn columns)
          next-page (delay
                      (when nextUri
                        ;; Might not be the best way, but the pattern is that we poll Presto at intervals
                        (when (empty? data)
                          (Thread/sleep 100))
                        (fetch-next-page details nextUri)))]
      {:rows (lazy-cat
              (for [row data]
                (parse-row row))
              (:rows @next-page))
       :cols (lazy-seq
              (if (seq columns)
                (for [{col-name :name, col-type :type} columns]
                  {:name      col-name
                   :base_type (presto-type->base-type col-type)})
                (:cols @next-page)))})))

(defn- cancel-query-with-id! [details query-id info-uri]
  (if-not query-id
    (log/warn (trs "Client connection closed, no query-id found, can't cancel query"))
    ;; If we have a query id, we can cancel the query
    (try
      (let [tunneled-uri (details->uri details (str "/v1/query/" query-id))
            adjusted-uri (create-cancel-url tunneled-uri (get details :host) (get details :port) info-uri)]
        (http/delete adjusted-uri (details->request details)))
      ;; If we fail to cancel the query, log it but propogate the interrupted exception, instead of
      ;; covering it up with a failed cancel
      (catch Exception e
        (log/error e (trs "Error canceling query with ID {0}" query-id))))))

(defn- fetch-results-async [details canceled-chan query-id info-uri uri]
  ;; When executing the query, it doesn't return the results, but is geared toward async queries. After
  ;; issuing the query, the below will ask for the results. Asking in a future so that this thread can be
  ;; interrupted if the client disconnects
  (let [futur (future
                (try
                  (fetch-next-page details uri)
                  (catch Throwable e
                    e)))
        cancel! (delay
                  (cancel-query-with-id! details query-id info-uri))]
    (when canceled-chan
      (a/go
        (when (a/<! canceled-chan)
          (future-cancel futur)
          @cancel!)))
    (try
      (let [more-rows @futur]
        (when (instance? Throwable more-rows)
          (throw more-rows))
        more-rows)
      (catch InterruptedException e
        @cancel!
        (throw e)))))

(defn- execute-presto-query
  {:style/indent 1}
  [details query canceled-chan respond]
  {:pre [(map? details)]}
  (ssh/with-ssh-tunnel [details-with-tunnel details]
    (let [{{:keys [columns data nextUri error id infoUri]} :body}
          (http/post (details->uri details-with-tunnel "/v1/statement")
                     (assoc (details->request details-with-tunnel)
                            :body query, :as :json, :redirect-strategy :lax))]
      (when error
        (throw (ex-info (or (:message error) "Error preparing query.") error)))
      (let [parse-row     (parse-row-fn (or columns []))
            rows          (for [row (or data [])]
                            (parse-row row))
            cols          (for [{col-name :name, col-type :type} columns]
                            {:name      col-name
                             :base_type (presto-type->base-type col-type)})
            async-results (delay
                            (when nextUri
                              (fetch-results-async details canceled-chan id infoUri nextUri)))]
        (respond {:cols (if (seq cols)
                          cols
                          (:cols @async-results))}
                 (lazy-cat rows (:rows @async-results)))))))

(def ^:private presto-metadata-sync-query-timeout
  (u/minutes->ms 2))

(defn- execute-presto-query-for-sync
  "Execute a Presto query for metadata sync."
  [details query]
  (let [result-chan (a/promise-chan)]
    (execute-presto-query details query nil (fn [cols rows]
                                              (a/>!! result-chan {:cols cols, :rows rows})))
    (let [[val] (a/alts!! [result-chan (a/timeout presto-metadata-sync-query-timeout)])]
      (a/close! result-chan)
      val)))

;;; `:sql` driver implementation

(s/defmethod driver/can-connect? :presto
  [driver {:keys [catalog] :as details} :- PrestoConnectionDetails]
  (let [{[[v]] :rows} (execute-presto-query-for-sync details
                        (format "SHOW SCHEMAS FROM %s LIKE 'information_schema'"
                                (sql.u/quote-name driver :database catalog)))]
    (= v "information_schema")))

(defmethod sql.qp/add-interval-honeysql-form :presto
  [_ hsql-form amount unit]
  (hsql/call :date_add (hx/literal unit) amount hsql-form))

(s/defn ^:private database->all-schemas :- #{su/NonBlankString}
  "Return a set of all schema names in this `database`."
  [driver {{:keys [catalog schema] :as details} :details :as database}]
  (let [sql            (str "SHOW SCHEMAS FROM " (sql.u/quote-name driver :database catalog))
        {:keys [rows]} (execute-presto-query-for-sync details sql)]
    (set (map first rows))))

(defn- describe-schema [driver {{:keys [catalog] :as details} :details} {:keys [schema]}]
  (let [sql            (str "SHOW TABLES FROM " (sql.u/quote-name driver :schema catalog schema))
        {:keys [rows]} (execute-presto-query-for-sync details sql)
        tables         (map first rows)]
    (set (for [table-name tables]
           {:name table-name, :schema schema}))))

(def ^:private excluded-schemas #{"information_schema"})

(defmethod driver/describe-database :presto
  [driver database]
  (let [schemas (remove excluded-schemas (database->all-schemas driver database))]
    {:tables (reduce set/union (for [schema schemas]
                                 (describe-schema driver database {:schema schema})))}))

(defmethod driver/describe-table :presto
  [driver {{:keys [catalog] :as details} :details} {schema :schema, table-name :name}]
  (let [sql            (str "DESCRIBE " (sql.u/quote-name driver :table catalog schema table-name))
        {:keys [rows]} (execute-presto-query-for-sync details sql)]
    {:schema schema
     :name   table-name
     :fields (set (for [[idx [name type]] (m/indexed rows)]
                    {:name              name
                     :database-type     type
                     :base-type         (presto-type->base-type type)
                     :database-position idx}))}))

(defmethod sql.qp/->honeysql [:presto Boolean]
  [_ bool]
  (hsql/raw (if bool "TRUE" "FALSE")))

(defmethod sql.qp/->honeysql [:presto :time]
  [_ [_ t]]
  (hx/cast :time (u.date/format-sql (t/local-time t))))

(defmethod sql.qp/->float :presto
  [_ value]
  (hx/cast :double value))

(defmethod sql.qp/->honeysql [:presto :regex-match-first]
  [driver [_ arg pattern]]
  (hsql/call :regexp_extract (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver pattern)))

(defmethod sql.qp/->honeysql [:presto :median]
  [driver [_ arg]]
  (hsql/call :approx_percentile (sql.qp/->honeysql driver arg) 0.5))

(defmethod sql.qp/->honeysql [:presto :percentile]
  [driver [_ arg p]]
  (hsql/call :approx_percentile (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver p)))

(def ^:private ^:dynamic *param-splice-style*
  "How we should splice params into SQL (i.e. 'unprepare' the SQL). Either `:friendly` (the default) or `:paranoid`.
  `:friendly` makes a best-effort attempt to escape strings and generate SQL that is nice to look at, but should not
  be considered safe against all SQL injection -- use this for 'convert to SQL' functionality. `:paranoid` hex-encodes
  strings so SQL injection is impossible; this isn't nice to look at, so use this for actually running a query."
  :friendly)

(defmethod unprepare/unprepare-value [:presto String]
  [_ ^String s]
  (case *param-splice-style*
    :friendly (str \' (sql.u/escape-sql s :ansi) \')
    :paranoid (format "from_utf8(from_hex('%s'))" (codecs/bytes->hex (.getBytes s "UTF-8")))))

;; See https://prestodb.io/docs/current/functions/datetime.html

;; This is only needed for test purposes, because some of the sample data still uses legacy types
(defmethod unprepare/unprepare-value [:presto Time]
  [driver t]
  (unprepare/unprepare-value driver (t/local-time t)))

(defmethod unprepare/unprepare-value [:presto OffsetDateTime]
  [_ t]
  (format "timestamp '%s %s %s'" (t/local-date t) (t/local-time t) (t/zone-offset t)))

(defmethod unprepare/unprepare-value [:presto ZonedDateTime]
  [_ t]
  (format "timestamp '%s %s %s'" (t/local-date t) (t/local-time t) (t/zone-id t)))

(defmethod driver/execute-reducible-query :presto
  [driver
   {database-id                  :database
    :keys                        [settings]
    {sql :query, params :params} :native
    query-type                   :type
    :as                          outer-query}
   context
   respond]
  (let [sql     (str "-- "
                     (qputil/query->remark :presto outer-query) "\n"
                     (binding [*param-splice-style* :paranoid]
                       (unprepare/unprepare driver (cons sql params))))
        details (merge (:details (qp.store/database))
                       settings)]
    (execute-presto-query details sql (context/canceled-chan context) respond)))

(defmethod driver/humanize-connection-error-message :presto
  [_ message]
  (condp re-matches message
    #"^java.net.ConnectException: Connection refused.*$"
    (driver.common/connection-error-messages :cannot-connect-check-host-and-port)

    #"^clojure.lang.ExceptionInfo: Catalog .* does not exist.*$"
    (driver.common/connection-error-messages :database-name-incorrect)

    #"^java.net.UnknownHostException.*$"
    (driver.common/connection-error-messages :invalid-hostname)

    #".*"                               ; default
    message))

;;; `:sql-driver` methods

(defmethod sql.qp/apply-top-level-clause [:presto :page]
  [_ _ honeysql-query {{:keys [items page]} :page}]
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
(defmethod sql.qp/date [:presto :week]
  [_ _ expr]
  (hsql/call :date_add
    (hx/literal :day) -1 (hsql/call :date_trunc
                           (hx/literal :week) (hsql/call :date_add
                                                (hx/literal :day) 1 expr))))

;; Offset by one day forward to "fake" a Sunday starting week
(defmethod sql.qp/date [:presto :week-of-year]
  [_ _ expr]
  (hsql/call :week (hsql/call :date_add (hx/literal :day) 1 expr)))

(defmethod sql.qp/date [:presto :month]           [_ _ expr] (hsql/call :date_trunc (hx/literal :month) expr))
(defmethod sql.qp/date [:presto :month-of-year]   [_ _ expr] (hsql/call :month expr))
(defmethod sql.qp/date [:presto :quarter]         [_ _ expr] (hsql/call :date_trunc (hx/literal :quarter) expr))
(defmethod sql.qp/date [:presto :quarter-of-year] [_ _ expr] (hsql/call :quarter expr))
(defmethod sql.qp/date [:presto :year]            [_ _ expr] (hsql/call :date_trunc (hx/literal :year) expr))

(defmethod sql.qp/unix-timestamp->honeysql [:presto :seconds]
  [_ _ expr]
  (hsql/call :from_unixtime expr))

(defmethod driver.common/current-db-time-date-formatters :presto
  [_]
  (driver.common/create-db-time-formatters "yyyy-MM-dd'T'HH:mm:ss.SSSZ"))

(defmethod driver.common/current-db-time-native-query :presto
  [_]
  "select to_iso8601(current_timestamp)")

(defmethod driver/current-db-time :presto
  [& args]
  (apply driver.common/current-db-time args))

(doseq [[feature supported?] {:set-timezone                    true
                              :basic-aggregations              true
                              :standard-deviation-aggregations true
                              :expressions                     true
                              :native-parameters               true
                              :expression-aggregations         true
                              :binning                         true
                              :foreign-keys                    true}]
  (defmethod driver/supports? [:presto feature] [_ _] supported?))
