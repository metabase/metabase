(ns metabase.driver.druid.client
  (:refer-clojure :exclude [get-in])
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.sql-jdbc.connection.ssh-tunnel :as ssh]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.performance :refer [get-in]]))

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
                  (:body options) (update :body json/encode)
                  auth-enabled (assoc :basic-auth (str auth-username ":" auth-token-value)))]

    (try
      (let [{:keys [status body]} (request-fn url options)]
        (when (not= status 200)
          (throw (ex-info (tru "Druid request error [{0}]: {1}" status (pr-str body))
                          {:type driver-api/qp.error-type.db})))
        (try
          (json/decode+kw body)
          (catch Throwable e
            (throw (ex-info (tru "Failed to parse Druid response body: {0}" (pr-str body))
                            {:type driver-api/qp.error-type.db}
                            e)))))
      (catch Throwable e
        (let [response (u/ignore-exceptions
                         (when-let [body (:body (ex-data e))]
                           (json/decode+kw body)))]
          (throw (ex-info (or (:errorMessage response)
                              (.getMessage e))
                          (merge
                           {:type            driver-api/qp.error-type.db
                            :request-url     url
                            :request-options options}
                           (when response
                             {:response response}))
                          e)))))))

(def ^{:arglists '([url & {:as options}]), :style/indent [:form]} GET    "Execute a GET request."    (partial do-request http/get))
(def ^{:arglists '([url & {:as options}]), :style/indent [:form]} POST   "Execute a POST request."   (partial do-request http/post))
(def ^{:arglists '([url & {:as options}]), :style/indent [:form]} DELETE "Execute a DELETE request." (partial do-request http/delete))

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
            :auth-token-value (driver-api/secret-value-as-string :druid details "auth-token"))
      ;; don't need to do anything fancy if the query was killed
      (catch InterruptedException e
        (throw e))
      (catch Throwable e
        (let [e' (ex-info (.getMessage e)
                          {:type  driver-api/qp.error-type.db
                           :query query}
                          e)]
          (log/error e' "Error running query")
          ;; Re-throw a new exception with `message` set to the extracted message
          (throw e'))))))

(defn- undo-query-with-id! [details query-id]
  (if-not query-id
    (log/warn "Client closed connection, no queryId found, can't cancel query")
    (ssh/with-ssh-tunnel [details-with-tunnel details]
      (log/warnf "Client closed connection, canceling Druid queryId %s" query-id)
      (try
        (log/debugf "Canceling Druid query with ID %s" query-id)
        (DELETE (details->url details-with-tunnel (format "/druid/v2/%s" query-id))
                :auth-enabled     (:auth-enabled details)
                :auth-username    (:auth-username details)
                :auth-token-value (driver-api/secret-value-as-string :druid details "auth-token"))
        (catch Exception cancel-e
          (log/warnf cancel-e "Failed to cancel Druid query with queryId %s" query-id))))))

(defn do-query-with-cancellation
  "Run a Druid `query`, canceling it if `canceled-chan` gets a message."
  [canceled-chan details query]
  {:pre [(map? details) (map? query)]}
  (let [query-id  (get-in query [:context :queryId])
        ;; Run the query in a future so that we can interrupt it from the canceled-chan callback.
        query-fut (future (do-query details query))
        undo! #(undo-query-with-id! details query-id)]
    (a/go
      (when (a/<! canceled-chan)
        (future-cancel query-fut)
        (undo!)))
    (try @query-fut
         (catch java.util.concurrent.ExecutionException e
           (undo!)
           ;; Unwrap exceptions from the future.
           (throw (.getCause e)))
         (catch InterruptedException e
           (undo!)
           (throw e)))))
