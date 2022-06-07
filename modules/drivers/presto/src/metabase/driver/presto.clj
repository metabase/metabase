(ns metabase.driver.presto
  "Presto driver. Executes queries via the REST API. See https://prestodb.io/docs/current/ for complete dox."
  (:require [clj-http.client :as http]
            [clojure.core.async :as a]
            [clojure.set :as set]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.driver :as driver]
            [metabase.driver.presto-common :as presto-common]
            [metabase.driver.sql-jdbc.sync.describe-database :as sql-jdbc.describe-database]
            [metabase.driver.sql.util :as sql.u]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.query-processor.context :as qp.context]
            [metabase.query-processor.store :as qp.store]
            [metabase.query-processor.timezone :as qp.timezone]
            [metabase.query-processor.util :as qp.util]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [metabase.util.i18n :refer [trs tru]]
            [metabase.util.schema :as su]
            [metabase.util.ssh :as ssh]
            [schema.core :as s]))

(driver/register! :presto, :parent :presto-common)

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
                   :base_type (presto-common/presto-type->base-type col-type)})
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
                             :base_type (presto-common/presto-type->base-type col-type)})
            async-results (delay
                            (when nextUri
                              (fetch-results-async details canceled-chan id infoUri nextUri)))]
        (respond {:cols (if (seq cols)
                          cols
                          (:cols @async-results))}
                 (lazy-cat rows (:rows @async-results)))))))

(def ^:private presto-metadata-sync-query-timeout
  (u/minutes->ms 2))

(defn- execute-query-for-sync
  [details query]
  (let [result-chan (a/promise-chan)
        query       (if (string? query)
                      query
                      (do
                        (assert (empty? (second query)) "Presto doesn't allow parameterized queries")
                        (first query)))]
    (execute-presto-query details query nil (fn [cols rows]
                                              (a/>!! result-chan {:cols cols, :rows rows})))
    (let [[val] (a/alts!! [result-chan (a/timeout presto-metadata-sync-query-timeout)])]
      (a/close! result-chan)
      val)))

;;; `:sql` driver implementation

(s/defmethod driver/can-connect? :presto
  [driver {:keys [catalog] :as details} :- PrestoConnectionDetails]
  (let [{[[v]] :rows} (execute-query-for-sync details
                        (format "SHOW SCHEMAS FROM %s LIKE 'information_schema'"
                                (sql.u/quote-name driver :database catalog)))]
    (= v "information_schema")))

(s/defn ^:private database->all-schemas :- #{su/NonBlankString}
  "Return a set of all schema names in this `database`."
  [driver {{:keys [catalog schema] :as details} :details :as database}]
  (let [sql            (presto-common/describe-catalog-sql driver catalog)
        {:keys [rows]} (execute-query-for-sync details sql)]
    (set (map first rows))))

(defn- have-select-privilege? [driver details schema table-name]
  (try
    (let [sql-args (sql-jdbc.describe-database/simple-select-probe-query driver schema table-name)]
      ;; if the query completes without throwing an Exception, we can SELECT from this table
      (execute-query-for-sync details sql-args)
      true)
    (catch Throwable _
      false)))

(defn- describe-schema [driver {{:keys [catalog user] :as details} :details :as db} {:keys [schema]}]
  (let [sql (presto-common/describe-schema-sql driver catalog schema)]
    (set (for [[table-name & _] (:rows (execute-query-for-sync details sql))
               :when            (have-select-privilege? driver details schema table-name)]
           {:name   table-name
            :schema schema}))))

(defmethod driver/describe-database :presto
  [driver database]
  (let [schemas (remove presto-common/excluded-schemas (database->all-schemas driver database))]
    {:tables (reduce set/union (for [schema schemas]
                                 (describe-schema driver database {:schema schema})))}))

(defmethod driver/describe-table :presto
  [driver {{:keys [catalog] :as details} :details} {schema :schema, table-name :name}]
  (let [sql            (presto-common/describe-table-sql driver catalog schema table-name)
        {:keys [rows]} (execute-query-for-sync details sql)]
    {:schema schema
     :name   table-name
     :fields (set (for [[idx [name type]] (m/indexed rows)]
                    {:name              name
                     :database-type     type
                     :base-type         (presto-common/presto-type->base-type type)
                     :database-position idx}))}))

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
                     (qp.util/query->remark :presto outer-query) "\n"
                     (binding [presto-common/*param-splice-style* :paranoid]
                       (unprepare/unprepare driver (cons sql params))))
        details (merge (:details (qp.store/database))
                       settings)]
    (execute-presto-query details sql (qp.context/canceled-chan context) respond)))

(defmethod driver/humanize-connection-error-message :presto
  [_ message]
  (condp re-matches message
    #"^java.net.ConnectException: Connection refused.*$"
    :cannot-connect-check-host-and-port

    #"^clojure.lang.ExceptionInfo: Catalog .* does not exist.*$"
    :database-name-incorrect

    #"^java.net.UnknownHostException.*$"
    :invalid-hostname

    #".*"                               ; default
    message))
