(ns metabase.driver.druid
  "Druid driver."
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.druid
             [execute :as execute]
             [query-processor :as qp]]
            [metabase.query-processor.context :as context]
            [metabase.util
             [i18n :refer [trs tru]]
             [ssh :as ssh]]))

(driver/register! :druid)

;;; ### Request helper fns

(defn- details->url
  "Helper for building a Druid URL.

    (details->url {:host \"http://localhost\", :port 8082} \"druid/v2\") -> \"http://localhost:8082/druid/v2\""
  [{:keys [host port]} & strs]
  {:pre [(string? host) (seq host) (integer? port)]}
  (apply str (format "%s:%d" host port) (map name strs)))

;; TODO - Should this go somewhere more general, like util ?
(defn- do-request
  "Perform a JSON request using `request-fn` against `url`.
   Tho

     (do-request http/get \"http://my-json-api.net\")"
  [request-fn url & {:as options}]
  {:pre [(fn? request-fn) (string? url)]}
  (let [options               (cond-> (merge {:content-type "application/json"} options)
                                (:body options) (update :body json/generate-string))
        {:keys [status body]} (request-fn url options)]
    (when (not= status 200)
      (throw (Exception. (tru "Error [{0}]: {1}" status body))))
    (try
      (json/parse-string body keyword)
      (catch Throwable _
        (throw (Exception. (tru "Failed to parse body: {0}" body)))))))

(def ^:private ^{:arglists '([url & {:as options}])} GET    (partial do-request http/get))
(def ^:private ^{:arglists '([url & {:as options}])} POST   (partial do-request http/post))
(def ^:private ^{:arglists '([url & {:as options}])} DELETE (partial do-request http/delete))


;;; ### Misc. Driver Fns

(defmethod driver/can-connect? :druid [_ details]
  {:pre [(map? details)]}
  (ssh/with-ssh-tunnel [details-with-tunnel details]
    (= 200 (:status (http/get (details->url details-with-tunnel "/status"))))))


;;; ### Query Processing

(defn- do-query [details query]
  {:pre [(map? details) (map? query)]}
  (ssh/with-ssh-tunnel [details-with-tunnel details]
    (try
      (POST (details->url details-with-tunnel "/druid/v2"), :body query)
      ;; don't need to do anything fancy if the query was killed
      (catch InterruptedException e
        (throw e))
      (catch Throwable e
        ;; try to extract the error
        (let [message (or (u/ignore-exceptions
                            (when-let [body (json/parse-string (:body (:object (ex-data e))) keyword)]
                              (str (:error body) "\n"
                                   (:errorMessage body) "\n"
                                   "Error class:" (:errorClass body))))
                          (.getMessage e))]
          (log/error (u/format-color 'red (trs "Error running query:")
                       "\n" message))
          ;; Re-throw a new exception with `message` set to the extracted message
          (throw (Exception. message e)))))))

(defn- cancel-query-with-id! [details query-id]
  (if-not query-id
    (log/warn (trs "Client closed connection, no queryId found, can't cancel query"))
    (ssh/with-ssh-tunnel [details-with-tunnel details]
      (log/warn (trs "Client closed connection, canceling Druid queryId {0}" query-id))
      (try
        (log/debug (trs "Canceling Druid query with ID {0}" query-id))
        (DELETE (details->url details-with-tunnel (format "/druid/v2/%s" query-id)))
        (catch Exception cancel-e
          (log/warn cancel-e (trs "Failed to cancel Druid query with queryId {0}" query-id)))))))

(defn- do-query-with-cancellation [canceled-chan details query]
  {:pre [(map? details) (map? query)]}
  (let [query-id  (get-in query [:context :queryId])
        query-fut (future
                    (try
                      (do-query details query)
                      (catch Throwable e
                        e)))
        cancel! (delay
                  (cancel-query-with-id! details query-id))]
    (a/go
      (when (a/<! canceled-chan)
        (future-cancel query-fut)
        @cancel!))
    (try
      ;; Run the query in a future so that this thread will be interrupted, not the thread running the query (which is
      ;; not interrupt aware)
      (u/prog1 @query-fut
        (when (instance? Throwable <>)
          (throw <>)))
      (catch InterruptedException e
        @cancel!
        (throw e)))))


;;; ### Sync

(defn- do-segment-metadata-query [details datasource]
  {:pre [(map? details)]}
  (do-query details {"queryType"     "segmentMetadata"
                     "dataSource"    datasource
                     "intervals"     ["1999-01-01/2114-01-01"]
                     "analysisTypes" []
                     "merge"         true}))

(defn- druid-type->base-type [field-type]
  (case field-type
    "STRING"      :type/Text
    "FLOAT"       :type/Float
    "LONG"        :type/Integer
    "hyperUnique" :type/DruidHyperUnique
    :type/Float))

(defn- describe-table-field [field-name {field-type :type, :as info}]
  ;; all dimensions are Strings, and all metrics as JS Numbers, I think (?)
  ;; string-encoded booleans + dates are treated as strings (!)
  {:name          (name field-name)
   :base-type     (druid-type->base-type field-type)
   :database-type field-type})

(defmethod driver/describe-table :druid
  [_ database table]
  (ssh/with-ssh-tunnel [details-with-tunnel (:details database)]
    (let [{:keys [columns]} (first (do-segment-metadata-query details-with-tunnel (:name table)))]
      {:schema nil
       :name   (:name table)
       :fields (set (concat
                     ;; every Druid table is an event stream w/ a timestamp field
                     [{:name          "timestamp"
                       :database-type "timestamp"
                       :base-type     :type/Instant
                       :pk?           true}]
                     (for [[field-name field-info] (dissoc columns :__time)]
                       (describe-table-field field-name field-info))))})))

(defmethod driver/describe-database :druid
  [_ database]
  {:pre [(map? (:details database))]}
  (ssh/with-ssh-tunnel [details-with-tunnel (:details database)]
    (let [druid-datasources (GET (details->url details-with-tunnel "/druid/v2/datasources"))]
      {:tables (set (for [table-name druid-datasources]
                      {:schema nil, :name table-name}))})))

(defmethod driver/mbql->native :druid
  [_ query]
  (qp/mbql->native query))

(defmethod driver/execute-reducible-query :druid
  [_ query context respond]
  (execute/execute-reducible-query (partial do-query-with-cancellation (context/canceled-chan context)) query respond))

(doseq [[feature supported?] {:set-timezone            true
                              :expression-aggregations true}]
  (defmethod driver/supports? [:druid feature] [_ _] supported?))
