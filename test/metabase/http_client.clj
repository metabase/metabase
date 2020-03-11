(ns metabase.http-client
  "HTTP client for making API calls against the Metabase API. For test/REPL purposes."
  (:require [cheshire.core :as json]
            [clj-http.client :as client]
            [clojure
             [string :as str]
             [test :as t]]
            [clojure.tools.logging :as log]
            [java-time :as java-time]
            [metabase
             [config :as config]
             [util :as u]]
            [metabase.middleware.session :as mw.session]
            [metabase.test.initialize :as initialize]
            [metabase.util
             [date-2 :as u.date]
             [schema :as su]]
            [schema.core :as s]))

;;; build-url

(def ^:dynamic *url-prefix*
  "Prefix to automatically prepend to the URL of calls made with `client`."
  (str "http://localhost:" (config/config-str :mb-jetty-port) "/api/"))

(defn build-url
  "Build an API URL for `localhost` and `MB_JETTY_PORT` with `url-param-kwargs`.

    (build-url \"db/1\" {:x true}) -> \"http://localhost:3000/api/db/1?x=true\""
  [url url-param-kwargs]
  {:pre [(string? url) (u/maybe? map? url-param-kwargs)]}
  (str *url-prefix* url (when (seq url-param-kwargs)
                          (str "?" (str/join \& (for [[k v] url-param-kwargs]
                                                (str (if (keyword? k) (name k) k)
                                                     \=
                                                     (if (keyword? v) (name v) v))))))))


;;; parse-response

(def ^:private auto-deserialize-dates-keys
  #{:created_at :updated_at :last_login :date_joined :started_at :finished_at :last_analyzed})

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
                             (if (java-time/zoned-date-time? parsed)
                               (java-time/offset-date-time parsed)
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

(defn- parse-response
  "Deserialize the JSON response or return as-is if that fails."
  [body]
  (if-not (string? body)
    body
    (try
      (auto-deserialize-dates (json/parse-string body keyword))
      (catch Throwable e
        (when-not (str/blank? body)
          body)))))


;;; authentication

(declare client)

(def ^:private Credentials
  {:username su/NonBlankString, :password su/NonBlankString})

(def ^:private UUIDString
  "Schema for a canonical string representation of a UUID."
  (s/constrained
   su/NonBlankString
   (partial re-matches #"^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$")))

(s/defn authenticate :- UUIDString
  "Authenticate a test user with `username` and `password`, returning their Metabase Session token; or throw an
  Exception if that fails."
  [credentials :- Credentials]
  (initialize/initialize-if-needed! :test-users)
  (try
    (let [response (client :post 200 "session" credentials)]
      (or (:id response)
          (throw (ex-info "Unexpected response" {:response response}))))
    (catch Throwable e
      (println "Failed to authenticate with credentials" credentials e)
      (throw (ex-info "Failed to authenticate with credentials"
                      {:credentials credentials}
                      e)))))


;;; client

(defn build-request-map [credentials http-body]
  (merge
   {:accept       :json
    :headers      {@#'mw.session/metabase-session-header
                   (when credentials
                     (if (map? credentials)
                       (authenticate credentials)
                       credentials))}
    :content-type :json}
   (when (seq http-body)
     {:body (json/generate-string http-body)})))

(defn- check-status-code
  "If an `expected-status-code` was passed to the client, check that the actual status code matches, or throw an
  exception."
  [method-name url body expected-status-code actual-status-code]
  (when (and (= actual-status-code 401)
             (not= expected-status-code 401))
    (let [message (format "%s %s expected a status code of %d, got %d."
                          method-name url expected-status-code actual-status-code)
          body    (try
                    (json/parse-string body keyword)
                    (catch Throwable _
                      body))]
      (throw (ex-info message {:status-code actual-status-code}))))
  ;; all other status codes should be test assertions against the expected status code if one was specified
  (when expected-status-code
    (t/is (= expected-status-code
             actual-status-code)
          (format "%s %s expected a status code of %d, got %d."
                  method-name url expected-status-code actual-status-code))))

(def ^:private method->request-fn
  {:get    client/get
   :post   client/post
   :put    client/put
   :delete client/delete})

(s/defn ^:private -client
    ;; Since the params for this function can get a little complicated make sure we validate them
  [credentials      :- (s/maybe (s/cond-pre UUIDString Credentials))
   method           :- (apply s/enum (keys method->request-fn))
   expected-status  :- (s/maybe su/IntGreaterThanZero)
   url              :- su/NonBlankString
   http-body        :- (s/maybe su/Map)
   url-param-kwargs :- (s/maybe su/Map)
   request-options  :- (s/maybe su/Map)]
  (initialize/initialize-if-needed! :db :web-server)
  (let [request-map                    (merge (build-request-map credentials http-body) request-options)
        request-fn                     (method->request-fn method)
        url                            (build-url url url-param-kwargs)
        method-name                    (str/upper-case (name method))
        ;; Now perform the HTTP request
        {:keys [status body] :as resp} (try (request-fn url request-map)
                                            (catch clojure.lang.ExceptionInfo e
                                              (log/debug method-name url)
                                              (:object (ex-data e))))]
    (log/debug method-name url status)
    (check-status-code method-name url body expected-status status)
    (update resp :body parse-response)))

(defn- parse-http-client-args
  "Parse the list of required and optional `args` into the various separated params that `-client` requires"
  [args]
  (let [[credentials [method & args]]     (u/optional #(or (map? %) (string? %)) args)
        [expected-status [url & args]]    (u/optional integer? args)
        [{:keys [request-options]} args]  (u/optional (every-pred map? :request-options) args {:request-options {}})
        [body [& {:as url-param-kwargs}]] (u/optional map? args)]
    [credentials method expected-status url body url-param-kwargs request-options]))

(def ^:private response-timeout-ms (* 15 1000))

(defn client-full-response
  "Identical to `client` except returns the full HTTP response map, not just the body of the response"
  {:arglists '([credentials? method expected-status-code? url request-options? http-body-map? & url-kwargs])}
  [& args]
  (u/with-timeout response-timeout-ms
    (apply -client (parse-http-client-args args))))

(defn client
  "Perform an API call and return the response (for test purposes).
   The first arg after `url` will be passed as a JSON-encoded body if it is a map.
   Other &rest kwargs will be passed as `GET` parameters.

  Examples:

    (client :get 200 \"card/1\")                ; GET  http://localhost:3000/api/card/1, throw exception is status code != 200
    (client :get \"card\" :org 1)               ; GET  http://localhost:3000/api/card?org=1
    (client :post \"card\" {:name \"My Card\"}) ; POST http://localhost:3000/api/card with JSON-encoded body {:name \"My Card\"}

  Args:

   *  `credentials`          Optional map of `:username` and `:password` or `X-METABASE-SESSION` token of a User who we
                             should perform the request as
   *  `method`               `:get`, `:post`, `:delete`, or `:put`
   *  `expected-status-code` When passed, throw an exception if the response has a different status code.
   *  `url`                  Base URL of the request, which will be appended to `*url-prefix*`. e.g. `card/1/favorite`
   *  `http-body-map`        Optional map to send a the JSON-serialized HTTP body of the request
   *  `url-kwargs`           key-value pairs that will be encoded and added to the URL as GET params"
  {:arglists '([credentials? method expected-status-code? url request-options? http-body-map? & url-kwargs])}
  [& args]
  (:body (apply client-full-response args)))
