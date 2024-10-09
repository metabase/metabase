(ns metabase.driver.pinot.client
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [clojure.string :as str]
   [metabase.models.secret :as secret]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.ssh :as ssh]))

(set! *warn-on-reflection* true)

(defn details->url
  "Helper for building a Pinot URL.
   (details->url {:controller-endpoint \"http://localhost:9000\"}) -> \"http://localhost:9000\""
  [{:keys [controller-endpoint]} & strs]
  {:pre [(string? controller-endpoint) (seq controller-endpoint)]}
  (apply str (format "%s" controller-endpoint) (map name strs)))

(defn- do-request
  "Perform a JSON request using `request-fn` against `url`.

     (do-request http/get \"http://my-json-api.net\")"
  [request-fn url & {:as options}]
  {:pre [(fn? request-fn) (string? url)]}
  ;; this is the way the `Content-Type` header is formatted in requests made by the Pinot web interface
  (let [{:keys [auth-enabled auth-token-type auth-token-value database-name]} options
        ;; Construct headers map
        headers (cond-> {}
                  (not= (:as options) :text) (assoc "Content-Type" "application/json;charset=UTF-8")
                  auth-enabled (assoc "Authorization" (str auth-token-type " " auth-token-value))
                  database-name (assoc "database" database-name))

        ;; Update options with headers and possibly serialize body if present
        options (cond-> (merge options {:headers headers})
                  (:body options) (update :body json/generate-string))]
    (try
      (let [{:keys [status body]} (request-fn url options)]
        (log/debugf "Pinot request url: %s, body: %s" url body)
        (when (not= status 200)
          (throw (ex-info (tru "Pinot request error [{0}]: {1}" status (pr-str body))
                          {:type qp.error-type/db})))
        (if (= (:as options) :text)
          body
          (try
            (json/parse-string body keyword)
            (catch Throwable e
              (throw (ex-info (tru "Failed to parse Pinot response body: {0}" (pr-str body))
                              {:type qp.error-type/db}
                              e))))))
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

(def ^{:arglists '([url & {:as options}]), :style/indent [:form]} GET    "Execute a GET request."    (partial do-request http/get))
(def ^{:arglists '([url & {:as options}]), :style/indent [:form]} POST   "Execute a POST request."   (partial do-request http/post))
(def ^{:arglists '([url & {:as options}]), :style/indent [:form]} DELETE "Execute a DELETE request." (partial do-request http/delete))

(defn parse-value
  "Parse value to appropriate type (e.g., number, boolean, or string)."
  [value]
  (cond
    (nil? value) nil
    (re-matches #"^-?\d+(\.\d+)?$" value) (read-string value)  ; Parse numbers
    (= "true" value) true
    (= "false" value) false
    :else value))  ; Leave as string

(defn parse-query-options
  "Parse a semicolon-separated string of query options into a map with keyword keys and correctly-typed values."
  [options-str]
  (if (or (nil? options-str) (empty? options-str))
    {}  ; Return an empty map if the input is nil or empty
    (->> (str/split options-str #";")
         (map #(str/split % #"=" 2))  ; Split into key-value pairs safely
         (filter #(= 2 (count %)))     ; Ensure only valid pairs are processed
         (map (fn [[k v]] [(keyword (str/trim k)) (parse-value (str/trim v))]))
         (into {}))))

(defn stringify-value
  "Convert values to string format for query options."
  [value]
  (cond
    (boolean? value) (if value "true" "false")
    :else (str value)))

(defn map->query-options
  "Convert a map of query options into a semicolon-separated string."
  [options-map]
  (->> options-map
       (map (fn [[k v]] (str (name k) "=" (stringify-value v))))
       (str/join ";")))

;; Example usage in your do-query function
(defn do-query
  "Run a Pinot `query` against the database connection `details`."
  [details query]
  {:pre [(map? details) (map? query)]}
  (ssh/with-ssh-tunnel [details-with-tunnel details]
    (try
      ;; Parse query options from string
      (let [query-options-str (get details :query-options "")
            query-options-map (parse-query-options query-options-str)
            existing-options (get query :queryOptions {})

            ;; Merge existing and new query options
            merged-options (merge existing-options query-options-map)

            ;; Create the enhanced query with merged options
            enhanced-query (assoc query :queryOptions (map->query-options merged-options))

            ;; Prepare the URL and send the enhanced query
            url (details->url details-with-tunnel "/sql")
            response (POST url
                       :body enhanced-query
                       :database-name (:database-name details)
                       :auth-enabled     (:auth-enabled details)
                       :auth-token-type  (:auth-token-type details)
                       :auth-token-value (secret/value-as-string nil details "auth-token-value"))]

        ;; Log the query, details, and response
        (log/debugf "Pinot details: %s, Pinot query: %s, Parsed Pinot response: %s"
                   details enhanced-query response)

        ;; Return the parsed response for further processing
        response)

      ;; Handle interrupted queries
      (catch InterruptedException e
        (log/error e "Query was interrupted")
        (throw e))

      ;; Handle other exceptions
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
      (log/warnf "Client closed connection, canceling Pinot queryId %s" query-id)
      (try
        (log/debugf "Canceling Pinot query with ID %s" query-id)
        (DELETE (details->url details-with-tunnel (format "/pinot/v2/%s" query-id))
          :database-name (:database-name details)
          :auth-enabled  (:auth-enabled details)
          :auth-token-type  (:auth-token-type details)
          :auth-token-value (secret/value-as-string nil details "auth-token-value"))
        (catch Exception cancel-e
          (log/warnf cancel-e "Failed to cancel Pinot query with queryId %s" query-id))))))

(defn do-query-with-cancellation
  "Run a Pinot `query`, canceling it if `canceled-chan` gets a message."
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
