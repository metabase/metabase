(ns metabase.mcp-client.transport
  "The client side of MCP's Streamable HTTP transport: one JSON-RPC message per POST, answered with a JSON object or
  a request-scoped SSE stream. Knows nothing about protocol eras beyond the headers it is handed."
  (:require
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.http :as u.http]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (java.io BufferedReader InputStream)))

(set! *warn-on-reflection* true)

(def ^:private accept-header "application/json, text/event-stream")

(def ^:private max-error-body-chars 2048)

;;; --------------------------------------------- Egress network policy ---------------------------------------------

(defn- network-policy-ex
  ([url policy]
   (network-policy-ex url policy nil))
  ([url policy cause]
   (let [host (u.http/->hostname url)]
     (ex-info (tru "MCP server host {0} is on a network Metabase is not allowed to connect to under the {1} policy"
                   host (name policy))
              {:type   :mcp-client/network-policy-error
               :url    url
               :host   host
               :policy policy}
              cause))))

(defn request-opts
  "clj-http options that keep a request to `url` inside `policy`: redirects are never followed, and the connection
  resolves DNS through a resolver that refuses addresses the policy does not permit. Behind a JVM-wide proxy the
  resolver sees only the proxy, so the target host is checked up front instead."
  [url policy]
  (if (u.http/jvm-proxied-url? url)
    (do (when-not (u.http/host-allowed-for-network-policy? policy url)
          (throw (network-policy-ex url policy)))
        {:redirect-strategy :none})
    (u/assoc-dissoc {:redirect-strategy :none}
                    :dns-resolver (u.http/network-policy-dns-resolver policy))))

(defn- rethrow-if-network-policy-error!
  [e url policy]
  (when (:ssrf (u/all-ex-data e))
    (throw (network-policy-ex url policy e))))

;;; ------------------------------------------------- SSE reading -------------------------------------------------

(defn- data-line?
  [^String line]
  (str/starts-with? line "data:"))

(defn- data-value
  [^String line]
  (let [s (subs line 5)]
    (if (str/starts-with? s " ") (subs s 1) s)))

(defn read-sse-messages
  "Read `in` as a `text/event-stream` and call `on-message` with each JSON-decoded event until it returns
  `::done`, returning that message, or the stream ends, returning nil. Multi-line `data:` fields are joined with
  newlines; comments and every other field are ignored. Closes `in`."
  [^InputStream in on-message]
  (with-open [r (io/reader in)]
    (letfn [(dispatch [data-lines]
              (when (seq data-lines)
                (let [message (json/decode+kw (str/join "\n" data-lines))]
                  (when (= ::done (on-message message))
                    message))))]
      (loop [data-lines []]
        (let [line (.readLine ^BufferedReader r)]
          (cond
            (nil? line)                 (dispatch data-lines)
            (= line "")                 (or (dispatch data-lines) (recur []))
            (str/starts-with? line ":") (recur data-lines)
            (data-line? line)           (recur (conj data-lines (data-value line)))
            :else                       (recur data-lines)))))))

;;; ------------------------------------------------ Response handling ------------------------------------------------

(defn- malformed-ex
  [url reason data]
  (ex-info (tru "Malformed response from MCP server: {0}" reason)
           (merge {:type :mcp-client/malformed-response :url url :reason reason} data)))

(defn- slurp-body
  ^String [body]
  (cond
    (nil? body)                 nil
    (instance? InputStream body) (slurp body)
    :else                       (str body)))

(defn- truncate
  [^String s]
  (when s
    (subs s 0 (min (count s) max-error-body-chars))))

(defn- jsonrpc-message?
  [x]
  (and (map? x) (= "2.0" (:jsonrpc x))))

(defn- decode-json-message
  "The JSON-RPC message answering `request-id` in `body`, or nil when the body is JSON but not JSON-RPC, which is
  how servers tend to phrase HTTP-level errors such as 401."
  [url ^String body request-id]
  (let [decoded (try
                  (json/decode+kw body)
                  (catch Exception _
                    (throw (malformed-ex url "body is not valid JSON" {:body (truncate body)}))))]
    (cond
      (jsonrpc-message? decoded) decoded
      (sequential? decoded)      (or (some #(when (and (jsonrpc-message? %) (= (:id %) request-id)) %) decoded)
                                     (throw (malformed-ex url "batch response has no message for our request id" {})))
      :else                      nil)))

(defn- close-quietly!
  [body]
  (when (instance? InputStream body)
    (try (.close ^InputStream body) (catch Exception _ nil))))

(defn- classify-response
  "Turn a clj-http response into `{:status :headers :content-type :message :body}`. `:message` is the JSON-RPC
  message answering `request-id` when the server sent one, whatever the HTTP status."
  [url {:keys [status headers body] :as resp} request-id on-message]
  (let [content-type (u.http/response-content-type resp)
        base         {:status status :headers headers :content-type content-type}
        success?     (<= 200 status 299)]
    (cond
      (#{202 204} status)
      (do (close-quietly! body)
          base)

      (and success? (= content-type "text/event-stream"))
      (let [handler (fn [message]
                      (if (and (= (:id message) request-id)
                               (or (contains? message :result) (contains? message :error)))
                        ::done
                        (do (on-message message) nil)))]
        (assoc base :message (read-sse-messages body handler)))

      (and success? (= content-type "application/json"))
      (let [text (slurp-body body)]
        (assoc base :message (or (decode-json-message url text request-id)
                                 (throw (malformed-ex url "body is not a JSON-RPC message" {:body (truncate text)})))))

      success?
      (do (close-quietly! body)
          (throw (malformed-ex url (str "unexpected content type " (pr-str content-type)) base)))

      :else
      (let [text (slurp-body body)]
        (assoc base
               :body    (truncate text)
               :message (when (and (= content-type "application/json") (not (str/blank? text)))
                          (try (decode-json-message url text request-id) (catch Exception _ nil))))))))

(defn post!
  "POST one JSON-RPC `message` to the client's server and classify the reply; see [[classify-response]].
  `headers` are sent in addition to the transport's own. `on-message` receives every SSE message that is not the
  response to `message` (server notifications, or requests from a legacy server). Throws
  `:mcp-client/network-policy-error` when the connection would leave the permitted networks."
  [{:keys [url network-policy connection-timeout-ms] :as client} message {:keys [headers timeout-ms on-message]}]
  (let [resp (try
               (http/request (merge {:method             :post
                                     :url                url
                                     :as                 :stream
                                     :throw-exceptions   false
                                     :headers            (merge {"Accept" accept-header "Content-Type" "application/json"}
                                                                headers)
                                     :body               (json/encode message)
                                     :connection-timeout connection-timeout-ms
                                     :socket-timeout     (or timeout-ms (:timeout-ms client))}
                                    (request-opts url network-policy)))
               (catch Exception e
                 (rethrow-if-network-policy-error! e url network-policy)
                 (throw e)))]
    (classify-response url resp (:id message) (or on-message (constantly nil)))))

(defn delete-session!
  "Best-effort HTTP DELETE that ends a legacy session. Servers may refuse with 405; nothing here throws."
  [{:keys [url network-policy connection-timeout-ms timeout-ms]} headers]
  (try
    (let [resp (http/request (merge {:method             :delete
                                     :url                url
                                     :throw-exceptions   false
                                     :headers            headers
                                     :connection-timeout connection-timeout-ms
                                     :socket-timeout     timeout-ms}
                                    (request-opts url network-policy)))]
      (log/debugf "MCP session DELETE returned HTTP %s" (:status resp)))
    (catch Exception e
      (log/debug e "MCP session DELETE failed"))))
