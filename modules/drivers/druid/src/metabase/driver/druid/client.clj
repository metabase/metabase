(ns metabase.driver.druid.client
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [metabase.models.secret :as secret]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.ssh :as ssh]))

(set! *warn-on-reflection* true)

(defn details->url
  "Helper for building a Druid URL.

    (details->url {:host \"http://localhost\", :port 8082} \"druid/v2\") -> \"http://localhost:8082/druid/v2\""
  [{:keys [host port]} & strs]
  {:pre [(string? host) (seq host) (integer? port)]}
  (apply str (format "%s:%d" host port) (map name strs)))

(defn- do-request
  "Perform a JSON request using `request-fn` against `url`.

     (do-request http/get \"http://my-json-api.net\")"
  [request-fn url & {:as options}]
  {:pre [(fn? request-fn) (string? url)]}
  ;; this is the way the `Content-Type` header is formatted in requests made by the Druid web interface
  (let [{:keys [auth-enabled auth-username auth-token-value]} options
        options (cond-> (merge {:content-type "application/json;charset=UTF-8"} options)
                        (:body options) (update :body json/generate-string)
                        auth-enabled (assoc :basic-auth (str auth-username ":" auth-token-value)))]

    (try
      (let [{:keys [status body]} (request-fn url options)]
        (when (not= status 200)
          (throw (ex-info (tru "Druid request error [{0}]: {1}" status (pr-str body))
                          {:type qp.error-type/db})))
        (try
          (json/parse-string body keyword)
          (catch Throwable e
            (throw (ex-info (tru "Failed to parse Druid response body: {0}" (pr-str body))
                            {:type qp.error-type/db}
                            e)))))
      (catch Throwable e
        (let [response (u/ignore-exceptions
                         (when-let [body (:body (ex-data e))]
                           (json/parse-string body keyword)))]
          (throw (ex-info (or (:errorMessage response)
                              (.getMessage e))
                          (merge
                           {:type            qp.error-type/db
                            :request-url     url
                            :request-options options}
                           (when response
                             {:response response}))
                          e)))))))

(def ^{:arglists '([url & {:as options}])} GET    "Execute a GET request."    (partial do-request http/get))
(def ^{:arglists '([url & {:as options}])} POST   "Execute a POST request."   (partial do-request http/post))
(def ^{:arglists '([url & {:as options}])} DELETE "Execute a DELETE request." (partial do-request http/delete))

(defn do-query
  "Run a Druid `query` against database connection `details`."
  [details query]
  {:pre [(map? details) (map? query)]}
  (ssh/with-ssh-tunnel [details-with-tunnel details]
    (try
      (POST (details->url details-with-tunnel "/druid/v2"),
        :body             query
        :auth-enabled     (:auth-enabled details)
        :auth-username    (:auth-username details)
        :auth-token-value (-> details
                              (secret/db-details-prop->secret-map "auth-token")
                              secret/value->string))
      ;; don't need to do anything fancy if the query was killed
      (catch InterruptedException e
        (throw e))
      (catch Throwable e
        (let [e' (ex-info (.getMessage e)
                          {:type  qp.error-type/db
                           :query query}
                          e)]
          (log/error e' "Error running query")
          ;; Re-throw a new exception with `message` set to the extracted message
          (throw e'))))))

(defn- cancel-query-with-id! [details query-id]
  (if-not query-id
    (log/warn "Client closed connection, no queryId found, can't cancel query")
    (ssh/with-ssh-tunnel [details-with-tunnel details]
      (log/warnf "Client closed connection, canceling Druid queryId %s" query-id)
      (try
        (log/debugf "Canceling Druid query with ID %s" query-id)
        (DELETE (details->url details-with-tunnel (format "/druid/v2/%s" query-id))
          :auth-enabled     (:auth-enabled details)
          :auth-username    (:auth-username details)
          :auth-token-value (-> details
                                (secret/db-details-prop->secret-map "auth-token")
                                secret/value->string))
        (catch Exception cancel-e
          (log/warnf cancel-e "Failed to cancel Druid query with queryId %s" query-id))))))

(defn do-query-with-cancellation
  "Run a Druid `query`, canceling it if `canceled-chan` gets a message."
  [canceled-chan details query]
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
