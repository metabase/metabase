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
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.query-processor :as sqlqp]
            [metabase.driver.generic-sql.util.unprepare :as unprepare]
            [metabase.query-processor
             [store :as qp.store]
             [util :as qputil]]
            [metabase.util
             [date :as du]
             [honeysql-extensions :as hx]
             [i18n :refer [tru]]
             [ssh :as ssh]]
            [metabase.util.schema :as su]
            [schema.core :as s])
  (:import java.sql.Time
           java.util.Date))

(defrecord PrestoDriver []
  :load-ns true
  clojure.lang.Named
  (getName [_] "Presto"))

;;; Presto API helpers

(defn- details->uri
  [{:keys [ssl host port]} path]
  {:pre [(string? host) (seq host) ((some-fn integer? string?) port)]}
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

(defn- quote-name [nm]
  (str \" (str/replace nm "\"" "\"\"") \"))

(defn- quote+combine-names [& names]
  (str/join \. (map quote-name names)))

;;; IDriver implementation

(defn- can-connect? [{:keys [catalog] :as details}]
  (let [{[[v]] :rows} (execute-presto-query! details (str "SHOW SCHEMAS FROM " (quote-name catalog)
                                                          " LIKE 'information_schema'"))]
    (= v "information_schema")))

(defn- date-interval [unit amount]
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

(defn- describe-database [driver database]
  (let [schemas (remove (sql/excluded-schemas driver) (database->all-schemas database))]
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

(defn- describe-table [{{:keys [catalog] :as details} :details} {schema :schema, table-name :name}]
  (let [sql            (str "DESCRIBE " (quote+combine-names catalog schema table-name))
        {:keys [rows]} (execute-presto-query! details sql)]
    {:schema schema
     :name   table-name
     :fields (set (for [[name type] rows]
                    {:name          name
                     :database-type type
                     :base-type     (presto-type->base-type type)}))}))

(defmethod sqlqp/->honeysql [PrestoDriver String]
  [_ s]
  (hx/literal (str/replace s "'" "''")))

(defmethod sqlqp/->honeysql [PrestoDriver Boolean]
  [_ bool]
  (hsql/raw (if bool "TRUE" "FALSE")))

(defmethod sqlqp/->honeysql [PrestoDriver Date]
  [_ date]
  (hsql/call :from_iso8601_timestamp (hx/literal (du/date->iso-8601 date))))

(defmethod sqlqp/->honeysql [PrestoDriver :stddev]
  [driver [_ field]]
  (hsql/call :stddev_samp (sqlqp/->honeysql driver field)))

(def ^:private time-format (tformat/formatter "HH:mm:SS.SSS"))

(defn- time->str
  ([t]
   (time->str t nil))
  ([t tz-id]
   (let [tz (time/time-zone-for-id tz-id)]
     (tformat/unparse (tformat/with-zone time-format tz) (tcoerce/to-date-time t)))))

(defmethod sqlqp/->honeysql [PrestoDriver :time]
  [_ [_ value]]
  (hx/cast :time (time->str value (driver/report-timezone))))

(defn- execute-query [{database-id                  :database
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


(defn- humanize-connection-error-message [message]
  (condp re-matches message
    #"^java.net.ConnectException: Connection refused.*$"
    (driver/connection-error-messages :cannot-connect-check-host-and-port)

    #"^clojure.lang.ExceptionInfo: Catalog .* does not exist.*$"
    (driver/connection-error-messages :database-name-incorrect)

    #"^java.net.UnknownHostException.*$"
    (driver/connection-error-messages :invalid-hostname)

    #".*" ; default
    message))


;;; ISQLDriver implementation

(defn- apply-page [honeysql-query {{:keys [items page]} :page}]
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

(defn- date [unit expr]
  (case unit
    :default         expr
    :minute          (hsql/call :date_trunc (hx/literal :minute) expr)
    :minute-of-hour  (hsql/call :minute expr)
    :hour            (hsql/call :date_trunc (hx/literal :hour) expr)
    :hour-of-day     (hsql/call :hour expr)
    :day             (hsql/call :date_trunc (hx/literal :day) expr)
    ;; Presto is ISO compliant, so we need to offset Monday = 1 to Sunday = 1
    :day-of-week     (hx/+ (hx/mod (hsql/call :day_of_week expr) 7) 1)
    :day-of-month    (hsql/call :day expr)
    :day-of-year     (hsql/call :day_of_year expr)
    ;; Similar to DoW, sicne Presto is ISO compliant the week starts on Monday, we need to shift that to Sunday
    :week            (hsql/call :date_add (hx/literal :day) -1 (hsql/call :date_trunc (hx/literal :week) (hsql/call :date_add (hx/literal :day) 1 expr)))
    ;; Offset by one day forward to "fake" a Sunday starting week
    :week-of-year    (hsql/call :week (hsql/call :date_add (hx/literal :day) 1 expr))
    :month           (hsql/call :date_trunc (hx/literal :month) expr)
    :month-of-year   (hsql/call :month expr)
    :quarter         (hsql/call :date_trunc (hx/literal :quarter) expr)
    :quarter-of-year (hsql/call :quarter expr)
    :year            (hsql/call :year expr)))

(defn- string-length-fn [field-key]
  (hsql/call :length field-key))

(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    :seconds      (hsql/call :from_unixtime expr)
    :milliseconds (recur (hx// expr 1000.0) :seconds)))


;;; Driver implementation

(def ^:private presto-date-formatters (driver/create-db-time-formatters "yyyy-MM-dd'T'HH:mm:ss.SSSZ"))
(def ^:private presto-db-time-query "select to_iso8601(current_timestamp)")

(u/strict-extend PrestoDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:can-connect?                      (u/drop-first-arg can-connect?)
          :date-interval                     (u/drop-first-arg date-interval)
          :describe-database                 describe-database
          :describe-table                    (u/drop-first-arg describe-table)
          :describe-table-fks                (constantly nil) ; no FKs in Presto
          :details-fields                    (constantly (ssh/with-tunnel-config
                                                           [driver/default-host-details
                                                            (assoc driver/default-port-details :default 8080)
                                                            (assoc driver/default-dbname-details
                                                              :name         "catalog"
                                                              :placeholder  (tru "hive"))
                                                            driver/default-user-details
                                                            driver/default-password-details
                                                            driver/default-ssl-details]))
          :execute-query                     (u/drop-first-arg execute-query)
          :features                          (constantly (set/union #{:set-timezone
                                                                      :basic-aggregations
                                                                      :standard-deviation-aggregations
                                                                      :expressions
                                                                      :native-parameters
                                                                      :expression-aggregations
                                                                      :binning
                                                                      :native-query-params}
                                                                    (when-not config/is-test?
                                                                      ;; during unit tests don't treat presto as having FK support
                                                                      #{:foreign-keys})))
          :humanize-connection-error-message (u/drop-first-arg humanize-connection-error-message)
          :current-db-time                   (driver/make-current-db-time-fn presto-db-time-query presto-date-formatters)})

  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:apply-page                (u/drop-first-arg apply-page)
          :column->base-type         (constantly nil)
          :connection-details->spec  (constantly nil)
          :current-datetime-fn       (constantly :%now)
          :date                      (u/drop-first-arg date)
          :excluded-schemas          (constantly #{"information_schema"})
          :quote-style               (constantly :ansi)
          :string-length-fn          (u/drop-first-arg string-length-fn)
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)}))

(defn -init-driver
  "Register the Presto driver"
  []
  (driver/register-driver! :presto (PrestoDriver.)))
