(ns dev.server.middleware.proxy
  "Development-only middleware to proxy API requests to a remote backend."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.config.core :as config]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- remote-api-url
  "Remote backend URL from MB_REMOTE_API_URL env var. Read at runtime, not compile time."
  []
  (config/config-str :mb-remote-api-url))

(defn- api-call?
  "Is this ring request an API call (exact `/api` or path starts with `/api/`)?"
  [{:keys [^String uri]}]
  (or (= uri "/api")
      (str/starts-with? uri "/api/")))

(defn- build-target-url
  "Build the full URL for the remote backend."
  [uri query-string]
  (str (remote-api-url) uri (when query-string (str "?" query-string))))

(defn- request-method->clj-http-fn
  "Convert Ring request method keyword to clj-http function."
  [method]
  (case method
    :get     http/get
    :post    http/post
    :put     http/put
    :delete  http/delete
    :patch   http/patch
    :head    http/head
    :options http/options
    http/get))

(def ^:private allowed-proxy-request-headers
  #{"accept"
    "accept-language"
    "authorization"
    "content-type"
    "cookie"
    "user-agent"})

(def ^:private blocked-proxy-request-headers
  #{"connection"
    "content-length"
    "forwarded"
    "host"
    "proxy-authenticate"
    "proxy-authorization"
    "te"
    "trailer"
    "transfer-encoding"
    "upgrade"
    "x-real-ip"})

(defn- blocked-proxy-request-header?
  [header-name]
  (or (contains? blocked-proxy-request-headers header-name)
      (str/starts-with? header-name "x-forwarded-")
      (str/starts-with? header-name "proxy-")))

(defn- proxy-headers
  "Filter and prepare headers for proxying using an explicit allowlist and origin rewrite."
  [headers]
  (let [forwarded-headers
        (reduce-kv
         (fn [result header-name value]
           (let [normalized-name (u/lower-case-en (name header-name))]
             (if (and (contains? allowed-proxy-request-headers normalized-name)
                      (not (blocked-proxy-request-header? normalized-name)))
               (assoc result normalized-name value)
               result)))
         {}
         headers)]
    (assoc forwarded-headers "origin" (remote-api-url))))

(defn- rewrite-set-cookie
  "Remove domain and secure attributes from Set-Cookie header so cookies work on localhost."
  [cookie-value]
  (-> cookie-value
      (str/replace #";\s*[Dd]omain=[^;]*" "")
      (str/replace #";\s*[Ss]ecure" "")
      (str/replace #";\s*[Ss]ame[Ss]ite=[^;]*" "; SameSite=Lax")))

(defn- find-set-cookie-key
  "Find the Set-Cookie header key (case-insensitive)."
  [headers]
  (some (fn [k] (when (= "set-cookie" (u/lower-case-en (name k))) k))
        (keys headers)))

(defn- rewrite-response-cookies
  "Rewrite Set-Cookie headers to work with localhost."
  [headers]
  (if-let [cookie-key (find-set-cookie-key headers)]
    (let [cookies   (get headers cookie-key)
          rewritten (if (sequential? cookies)
                      (mapv rewrite-set-cookie cookies)
                      (rewrite-set-cookie cookies))]
      (-> headers
          (dissoc cookie-key)
          (assoc "Set-Cookie" rewritten)))
    headers))

(defn- clj-http-cookie->set-cookie-header
  "Convert a clj-http cookie map entry to a Set-Cookie header string."
  [[cookie-name {:keys [value path expires max-age http-only]}]]
  (str cookie-name "=" value
       (when path (str "; Path=" path))
       (when expires (str "; Expires=" expires))
       (when max-age (str "; Max-Age=" max-age))
       (when http-only "; HttpOnly")
       "; SameSite=Lax"))

(def ^:private localhost-hosts
  #{"127.0.0.1" "::1" "localhost"})

(defn- strip-port
  [host]
  (cond
    (nil? host)
    nil

    (str/starts-with? host "[")
    (or (second (re-find #"^\[([^\]]+)\](?::\d+)?$" host)) host)

    (> (count (re-seq #":" host)) 1)
    host

    :else
    (first (str/split host #":" 2))))

(defn- localhost-request?
  [{:keys [headers server-name]}]
  (let [host (or (get headers "host") server-name)]
    (contains? localhost-hosts (some-> host strip-port u/lower-case-en))))

(defn- add-cookies-to-headers
  "Convert clj-http :cookies map to Set-Cookie headers."
  [headers cookies]
  (if (seq cookies)
    (let [set-cookie-headers (mapv clj-http-cookie->set-cookie-header cookies)]
      (assoc headers "Set-Cookie" set-cookie-headers))
    headers))

(defn- rewrite-response-headers
  [request raw-headers cookies]
  (let [localhost? (localhost-request? request)]
    (cond-> (dissoc raw-headers "transfer-encoding" "content-encoding")
      localhost? rewrite-response-cookies
      (and localhost? (seq cookies)) (add-cookies-to-headers cookies))))

(defn- proxy-request
  "Proxy a request to the remote backend and return the response."
  {:arglists '([request])}
  [{:keys [request-method uri query-string headers body], :as request}]
  (let [target-url (build-target-url uri query-string)
        http-fn    (request-method->clj-http-fn request-method)
        opts       (cond-> {:headers           (proxy-headers headers)
                            :throw-exceptions  false
                            :as                :stream
                            :redirect-strategy :none}
                     body (assoc :body body))]
    (log/debugf "Proxying %s %s to %s" (name request-method) uri target-url)
    (try
      (let [response          (http-fn target-url opts)
            raw-headers       (:headers response)
            cookies           (:cookies response)
            rewritten-headers (rewrite-response-headers request raw-headers cookies)]
        (log/infof "Proxy %s %s -> %s (cookies-returned=%d)"
                   (name request-method) uri (:status response) (count cookies))
        {:status  (:status response)
         :headers rewritten-headers
         :body    (:body response)})
      (catch Exception e
        (log/errorf e "Error proxying request to %s" target-url)
        {:status 502
         :body   "Proxy error"}))))

(defn wrap-remote-api-proxy
  "Middleware that proxies API requests to a remote backend when MB_REMOTE_API_URL is set.
   Only active in dev mode."
  [handler]
  (if-let [url (and config/is-dev? (remote-api-url))]
    (do
      (log/infof "Remote API proxy enabled, forwarding /api/* to %s" url)
      (fn [request respond raise]
        (if (api-call? request)
          (try
            (respond (proxy-request request))
            (catch Exception e
              (raise e)))
          (handler request respond raise))))
    handler))
