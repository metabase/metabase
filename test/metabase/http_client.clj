(ns metabase.http-client
  "HTTP client for making API calls against the Metabase API. For test/REPL purposes."
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.config :as config]
   [metabase.server.handler :as handler]
   [metabase.server.middleware.session :as mw.session]
   [metabase.test-runner.assert-exprs :as test-runner.assert-exprs]
   [metabase.test.initialize :as initialize]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.humanize :as mu.humanize]
   [metabase.util.malli.schema :as ms]
   [peridot.multipart]
   [ring.util.codec :as codec])
  (:import
   (java.io ByteArrayInputStream InputStream)
   (metabase.async.streaming_response StreamingResponse)))

(set! *warn-on-reflection* true)

;;; build-url

(def ^:dynamic *url-prefix*
  "Prefix to automatically prepend to the URL of calls made with `client`."
  "/api")

(defn- build-query-string
  [query-parameters]
  (str/join \& (letfn [(url-encode [s]
                                  (cond-> s
                                    (keyword? s) u/qualified-name
                                    (some? s)    codec/url-encode))
                       (encode-key-value [k v]
                         (str (url-encode k) \= (url-encode v)))]
                      (flatten (for [[k value-or-values] query-parameters]
                                 (if (sequential? value-or-values)
                                   (for [v value-or-values]
                                     (encode-key-value k v))
                                   [(encode-key-value k value-or-values)]))))))

(defn build-url
  "Build an API URL for `localhost` and `MB_JETTY_PORT` with `query-parameters`.

    (build-url \"db/1\" {:x true}) -> \"http://localhost:3000/api/db/1?x=true\""
  [url query-parameters]
  {:pre [(string? url) (u/maybe? map? query-parameters)]}
  (let [url (if (= (first url) \/) url (str "/" url))]
    (str "http://localhost:"
         (config/config-str :mb-jetty-port)
         *url-prefix*
         url
         (when (seq query-parameters)
           (str "?" (build-query-string query-parameters))))))

(defn- build-body-params [http-body content-type]
  (when http-body
    (cond
      (string? http-body)
      {:body (ByteArrayInputStream. (.getBytes ^String http-body "UTF-8"))}

      (= "application/json" content-type)
      {:body (ByteArrayInputStream. (.getBytes (json/generate-string http-body) "UTF-8"))}

      (= "multipart/form-data" content-type)
      (peridot.multipart/build http-body)

      :else
      (throw (ex-info "If you want this content-type to work, improve me"
                      {:content-type content-type})))))

;;; parse-response

(def ^:private auto-deserialize-dates-keys
  #{:created_at :updated_at :last_login :date_joined :started_at :finished_at :last_analyzed :last_used_at :last_viewed_at})

(defn- auto-deserialize-dates
  "Automatically recurse over `response` and look for keys that are known to correspond to dates. Parse their values and
  convert to java temporal types."
  [response]
  (cond (sequential? response)
        (map auto-deserialize-dates response)

        (map? response)
        (->> response
             (map (fn [[k v]]
                    {k (cond
                         ;; `u.date/parse` converts OffsetDateTimes with `Z` offset to
                         ;; `ZonedDateTime` automatically (for better or worse) since this
                         ;; won't match what's actually in the DB convert it back to an `OffsetDateTime`
                         (contains? auto-deserialize-dates-keys k)
                         (try
                           (let [parsed (u.date/parse v)]
                             (if (t/zoned-date-time? parsed)
                               (t/offset-date-time parsed)
                               parsed))
                           (catch Throwable _
                             v))

                         (coll? v)
                         (auto-deserialize-dates v)

                         :else
                         v)}))
             (into {}))

        :else
        response))

(defn- parse-response-key
  "Parse JSON keys as numbers if possible, else convert them to keywords indiscriminately."
  [json-key]
  (try
    (let [parsed-key (edn/read-string json-key)]
      (if (number? parsed-key)
        parsed-key
        (keyword json-key)))
    (catch Throwable _
      (keyword json-key))))

(defn- parse-response
  "Deserialize the JSON response or return as-is if that fails."
  [body]
  (if-not (string? body)
    body
    (try
      (auto-deserialize-dates (json/parse-string body parse-response-key))
      (catch Throwable e
        ;; if this actually looked like some sort of JSON response and we failed to parse it, log it so we can debug it
        ;; more easily in the REPL.
        (when (or (str/starts-with? body "{")
                  (str/starts-with? body "["))
          (log/warnf e "Error parsing string response as JSON: %s\nResponse:\n%s" (ex-message e) body))
        (when-not (str/blank? body)
          body)))))

;;; authentication

(declare client)

(def ^:private Credentials
  [:map {:closed true}
   [:username ms/NonBlankString]
   [:password ms/NonBlankString]])

(mu/defn authenticate :- ms/UUIDString
  "Authenticate a test user with `username` and `password`, returning their Metabase Session token; or throw an
  Exception if that fails."
  [credentials :- Credentials]
  (initialize/initialize-if-needed! :test-users)
  (try
    (let [response (client :post 200 "session" credentials)]
      (or (:id response)
          (throw (ex-info "Unexpected response" {:response response}))))
    (catch Throwable e
      (log/errorf e "Failed to authenticate with credentials %s" credentials)
      (throw (ex-info "Failed to authenticate with credentials"
                      {:credentials credentials}
                      e)))))


;;; client

(defn build-request-map
  "Build the request map we ultimately pass to [[clj-http.client]]. Add user credential headers, specify JSON encoding,
  and encode body as JSON."
  [credentials http-body request-options]
  (let [content-type (or (get-in request-options [:headers "content-type"]) "application/json")]
    (m/deep-merge
     {:accept        :json
      :headers       {"content-type" content-type
                      @#'mw.session/metabase-session-header
                      (when credentials
                        (if (map? credentials)
                          (authenticate credentials)
                          credentials))}
      :cookie-policy :standard}
     request-options
     (-> (build-body-params http-body content-type)
         ;; IDK why but apache http throws on seeing content-length header
         (m/update-existing :headers dissoc "content-length")))))

(defn- check-status-code
  "If an `expected-status-code` was passed to the client, check that the actual status code matches, or throw an
  exception."
  [method-name url body expected-status-code actual-status-code]
  ;; if we get a 401 authenticated but weren't expecting it, this means we need to log in and get new credentials for
  ;; the current user. Throw an Exception and then [[metabase.test/user-http-request]] will handle it and call
  ;; `authenticate` to get new creds and retry the request automatically.
  (when (and (= actual-status-code 401)
             (not= expected-status-code 401))
    (let [message (format "%s %s expected a status code of %d, got %d."
                          method-name url expected-status-code actual-status-code)
          body    (try
                    (json/parse-string body keyword)
                    (catch Throwable _
                      body))]
      (throw (ex-info message {:status-code actual-status-code, :body body}))))
  ;; all other status codes should be test assertions against the expected status code if one was specified
  (when expected-status-code
    (is (= expected-status-code
           actual-status-code)
        (format "%s %s expected a status code of %d, got %d."
                method-name url expected-status-code actual-status-code))))

(def ^:private method->request-fn
  {:get    http/get
   :post   http/post
   :put    http/put
   :patch  http/patch
   :delete http/delete})

(def ^:private ClientParamsMap
  [:map {:closed true}
   [:credentials      {:optional true} [:maybe [:or ms/UUIDString map?]]]
   [:method                            (into [:enum] (keys method->request-fn))]
   [:expected-status  {:optional true} [:maybe ms/PositiveInt]]
   [:url                               ms/NonBlankString]
   [:http-body        {:optional true} [:maybe [:or map? vector?]]]
   [:query-parameters {:optional true} [:maybe map?]]
   [:request-options  {:optional true} [:maybe map?]]])

(mu/defn- -client
  ;; Since the params for this function can get a little complicated make sure we validate them
  [{:keys [credentials method expected-status url http-body query-parameters request-options]} :- ClientParamsMap]
  (initialize/initialize-if-needed! :db :web-server)
  (let [http-body   (test-runner.assert-exprs/derecordize http-body)
        request-map (build-request-map credentials http-body request-options)
        request-fn  (method->request-fn method)
        url         (build-url url query-parameters)
        method-name (u/upper-case-en (name method))
        _           (log/debug method-name (pr-str url) (pr-str request-map))
        thunk       (fn []
                      (try
                        (request-fn url request-map)
                        (catch clojure.lang.ExceptionInfo e
                          (log/debug e method-name url)
                          (ex-data e))
                        (catch Exception e
                          (throw (ex-info (.getMessage e)
                                          {:method  method-name
                                           :url     url
                                           :request request-map}
                                          e)))))
        ;; Now perform the HTTP request
        {:keys [status body] :as response} (thunk)]
    (log/debug :http-request method-name url status)
    (check-status-code method-name url body expected-status status)
    (update response :body parse-response)))

(defn- read-streaming-response
  [streaming-response content-type]
  (with-open [os (java.io.ByteArrayOutputStream.)]
    (let [f             (.f ^StreamingResponse streaming-response)
          canceled-chan (a/promise-chan)]
      (f os canceled-chan)
      (cond-> (.toByteArray os)
        (some #(re-find % content-type) [#"json" #"text"])
        (String. "UTF-8")))))

(defn- coerce-mock-response-body
  [response]
  (update response
          :body
          (fn [body]
            (cond
              ;; read the text response
              (instance? InputStream body)
              (with-open [r (io/reader body)]
                (slurp r))

              ;; read byte array stuffs like image
              (instance? (Class/forName "[B") body)
              (String. ^bytes body "UTF-8")

              ;; Most APIs that execute a request returns a streaming response
              (instance? StreamingResponse body)
              (read-streaming-response body (get-in response [:headers "Content-Type"]))

              :else
              body))))

(defn- build-mock-request
  [{:keys [query-parameters url credentials http-body method request-options]}]
  (let [http-body        (test-runner.assert-exprs/derecordize http-body)
        query-parameters (merge
                          query-parameters
                          ;; sometimes we include the param in the URL(even though we shouldn't)
                          (reduce (fn [acc query]
                                    (let [[k v] (str/split query #"=")]
                                      (assoc acc k v)))
                                  {}
                                  (some-> (java.net.URI. url)
                                          .getRawQuery
                                          (str/split #"&"))))
        url              (cond->> (first (str/split url #"\?")) ;; strip out the query param parts if any
                           (not= (first url) \/)
                           (str "/"))
        content-type     (get-in request-options [:headers "content-type"] "application/json")]
    (m/deep-merge
     {:accept         "json"
      :headers        {"content-type"                        content-type
                       @#'mw.session/metabase-session-header (when credentials
                                                               (if (map? credentials)
                                                                 (authenticate credentials)
                                                                 credentials))}
      :query-string   (build-query-string query-parameters)
      :request-method method
      :uri            (str *url-prefix* url)}
     request-options
     (build-body-params http-body content-type))))

(mu/defn- -mock-client
  ;; Since the params for this function can get a little complicated make sure we validate them
  [{:keys [method expected-status] :as params} :- ClientParamsMap]
  (initialize/initialize-if-needed! :db :web-server)
  (let [method-name (u/upper-case-en (name method))
        request     (build-mock-request params)
        url         (:uri request)
        _           (log/debug method-name (pr-str url) (pr-str request))
        thunk       (fn []
                      (try
                       (handler/app request coerce-mock-response-body (fn raise [e] (throw e)))
                       (catch clojure.lang.ExceptionInfo e
                         (log/debug e method-name url)
                         (ex-data e))
                       (catch Exception e
                         (throw (ex-info (.getMessage e)
                                         {:method  method-name
                                          :url     url
                                          :request request}
                                         e)))))
        ;; Now perform the HTTP request
        {:keys [status body] :as response} (thunk)]
    (log/debug :mock-request method-name url status)
    (check-status-code method-name url body expected-status status)
    (update response :body parse-response)))

(def ^:private http-client-args
  [:catn
   [:credentials      [:? [:or string? map?]]]
   [:method           [:enum :get :put :post :patch :delete]]
   [:expected-status  [:? integer?]]
   [:url              string?]
   [:request-options  [:? [:fn (every-pred map? :request-options)]]]
   [:http-body        [:? [:or map? sequential?]]]
   [:query-parameters [:* [:catn [:k keyword?] [:v any?]]]]])

(def ^:private http-client-args-parser
  (mc/parser http-client-args))

(defn- url-escape
  [url]
  (-> url
      (str/replace #" " "%20")
      (str/replace #"\n" "%0A")))

(defn- parse-http-client-args
  "Parse the list of required and optional `args` into the various separated params that `-client` requires"
  [args]
  (let [parsed (http-client-args-parser args)]
    (when (= parsed :malli.core/invalid)
      (let [explain-data (mc/explain http-client-args args)]
        (throw (ex-info (str "Invalid http-client args: " (mu.humanize/humanize explain-data))
                        explain-data))))
    (cond-> parsed
      ;; escape spaces in url
      (:url parsed)              (update :url url-escape)
      ;; un-nest {:request-options {:request-options <my-options>}} => {:request-options <my-options>}
      (:request-options parsed)  (update :request-options :request-options)
      ;; convert query parameters into a flat map [{:k :a, :v 1} {:k :b, :v 2} {:k :b, :v 3}] => {:a 1, :b [2 3]}
      (:query-parameters parsed) (update :query-parameters (fn [query-params]
                                                             (update-vals (group-by :k query-params)
                                                                          (fn [values]
                                                                            (if (> (count values) 1)
                                                                              (map :v values)
                                                                              (:v (first values))))))))))

(def ^:private response-timeout-ms (u/seconds->ms 45))

(defn client-full-response
  "Identical to `client` except returns the full response map, not just the body of the response.
  Note: this does not make an actual http calls, use `client-real-response` for that.

  See `client` docstring for more."
  {:arglists '([credentials? method expected-status-code? url request-options? http-body-map? & query-parameters])}
  [& args]
  (let [parsed (parse-http-client-args args)]
    (log/trace parsed)
    (u/with-timeout response-timeout-ms
      (-mock-client parsed))))

(defn client-real-response
  "Identical to `real-client` except returns the full HTTP response map, not just the body of the response."
  {:arglists '([credentials? method expected-status-code? url request-options? http-body-map? & query-parameters])}
  [& args]
  (let [parsed (parse-http-client-args args)]
    (log/trace parsed)
    (u/with-timeout response-timeout-ms
      (-client parsed))))

(defn client
  "Perform a mock API call and return the response body (for test puposes).
  To make an actual http call use [[real-client]].

   The first arg after `url` will be passed as a JSON-encoded body if it is a map.
   Other &rest kwargs will be passed as `GET` parameters.

  Examples:

    (client :get 200 \"card/1\")                ; GET  http://localhost:3000/api/card/1, throw exception if status code != 200
    (client :get \"card\" :org 1)               ; GET  http://localhost:3000/api/card?org=1
    (client :post \"card\" {:name \"My Card\"}) ; POST http://localhost:3000/api/card with JSON-encoded body {:name \"My Card\"}

  Args:

   *  `credentials`          Optional map of `:username` and `:password` or Session token of a User who we
                             should perform the request as
   *  `method`               `:get`, `:post`, `:delete`, `:put`, or `:patch`
   *  `expected-status-code` When passed, throw an exception if the response has a different status code.
   *  `endpoint`             URL minus the `<host>/api/` part e.g. `card/1/favorite`. Appended to `*url-prefix*`.
   *  `request-options`      Optional map of options to pass as part of request to `clj-http.client`, e.g. `:headers`.
                             The map must be wrapped in `{:request-options}` e.g. `{:request-options {:headers ...}}`
   *  `http-body-map`        Optional map to send as the JSON-serialized HTTP body of the request
   *  `query-params`         Key-value pairs that will be encoded and added to the URL as query params

  Note: One benefit of [[client]] over [[real-client]] is the call site and API execution are on the same thread,
  so it's possible to run a test inside a transaction and bindings will works."
  {:arglists '([credentials? method expected-status-code? endpoint request-options? http-body-map? & {:as query-params}])}
  [& args]
  (:body (apply client-full-response args)))

(defn real-client
  "Like [[client]] but making an actual http request."
  {:arglists '([credentials? method expected-status-code? endpoint request-options? http-body-map? & {:as query-params}])}
  [& args]
  (:body (apply client-real-response args)))
