(ns metabase.http-client
  "HTTP client for making API calls against the Metabase API. For test/REPL purposes."
  (:require [cheshire.core :as json]
            [clj-http.client :as client]
            [clojure.string :as s]
            [clojure.tools.logging :as log]
            [metabase
             [config :as config]
             [util :as u]]
            [metabase.util.date :as du]))

;;; build-url

(def ^:dynamic *url-prefix*
  "Prefix to automatically prepend to the URL of calls made with `client`."
  (str "http://localhost:" (config/config-str :mb-jetty-port) "/api/"))

(defn build-url
  "Build an API URL for `localhost` and `MB_JETTY_PORT` with URL-PARAM-KWARGS.

     (build-url \"db/1\" {:x true}) -> \"http://localhost:3000/api/db/1?x=true\""
  [url url-param-kwargs]
  {:pre [(string? url) (u/maybe? map? url-param-kwargs)]}
  (str *url-prefix* url (when (seq url-param-kwargs)
                          (str "?" (s/join \& (for [[k v] url-param-kwargs]
                                                (str (if (keyword? k) (name k) k)
                                                     \=
                                                     (if (keyword? v) (name v) v))))))))


;;; parse-response

(def ^:private ^:const auto-deserialize-dates-keys
  #{:created_at :updated_at :last_login :date_joined :started_at :finished_at :last_analyzed})

(defn- auto-deserialize-dates
  "Automatically recurse over RESPONSE and look for keys that are known to correspond to dates.
   Parse their values and convert to `java.sql.Timestamps`."
  [response]
  (cond (sequential? response) (map auto-deserialize-dates response)
        (map? response) (->> response
                             (map (fn [[k v]]
                                    {k (cond
                                         ;; Our tests only run in UTC, parsing timestamp strings as UTC
                                         (contains? auto-deserialize-dates-keys k) (du/->Timestamp v du/utc)
                                         (coll? v) (auto-deserialize-dates v)
                                         :else v)}))
                             (into {}))
        :else response))

(defn- parse-response
  "Deserialize the JSON response or return as-is if that fails."
  [body]
  (if-not (string? body)
    body
    (try
      (auto-deserialize-dates (json/parse-string body keyword))
      (catch Throwable _
        (when-not (s/blank? body)
          body)))))


;;; authentication

(declare client)

(defn authenticate
  "Authenticate a test user with USERNAME and PASSWORD, returning their Metabase Session token;
   or throw an Exception if that fails."
  [{:keys [username password], :as credentials}]
  {:pre [(string? username) (string? password)]}
  (try
    (:id (client :post 200 "session" credentials))
    (catch Throwable e
      (log/error "Failed to authenticate with username:" username "and password:" password ":" (.getMessage e)))))


;;; client

(defn- build-request-map [credentials http-body]
  (cond-> {:accept  :json
           :headers {"X-METABASE-SESSION" (when credentials
                                            (if (map? credentials)
                                              (authenticate credentials)
                                              credentials))}}
    (seq http-body) (assoc
                      :content-type :json
                      :body         (json/generate-string http-body))))

(defn- check-status-code
  "If an EXPECTED-STATUS-CODE was passed to the client, check that the actual status code matches, or throw an exception."
  [method-name url body expected-status-code actual-status-code]
  (when expected-status-code
    (when (not= actual-status-code expected-status-code)
      (let [message (format "%s %s expected a status code of %d, got %d." method-name url expected-status-code actual-status-code)
            body    (try
                      (json/parse-string body keyword)
                      (catch Throwable _
                        body))]
        (log/error (u/pprint-to-str 'red body))
        (throw (ex-info message {:status-code actual-status-code}))))))

(def ^:private method->request-fn
  {:get    client/get
   :post   client/post
   :put    client/put
   :delete client/delete})

(defn- -client [credentials method expected-status url http-body url-param-kwargs request-options]
  ;; Since the params for this function can get a little complicated make sure we validate them
  {:pre [(or (u/maybe? map? credentials)
             (string? credentials))
         (contains? #{:get :post :put :delete} method)
         (u/maybe? integer? expected-status)
         (string? url)
         (u/maybe? map? http-body)
         (u/maybe? map? url-param-kwargs)]}
  (let [request-map (merge (build-request-map credentials http-body) request-options)
        request-fn  (method->request-fn method)
        url         (build-url url url-param-kwargs)
        method-name (s/upper-case (name method))
        ;; Now perform the HTTP request
        {:keys [status body]} (try (request-fn url request-map)
                                   (catch clojure.lang.ExceptionInfo e
                                     (log/debug method-name url)
                                     (:object (ex-data e))))]
    (log/debug method-name url status)
    (check-status-code method-name url body expected-status status)
    (parse-response body)))


(defn client
  "Perform an API call and return the response (for test purposes).
   The first arg after URL will be passed as a JSON-encoded body if it is a map.
   Other &rest kwargs will be passed as `GET` parameters.

  Examples:

    (client :get 200 \"card/1\")                ; GET  http://localhost:3000/api/card/1, throw exception is status code != 200
    (client :get \"card\" :org 1)               ; GET  http://localhost:3000/api/card?org=1
    (client :post \"card\" {:name \"My Card\"}) ; POST http://localhost:3000/api/card with JSON-encoded body {:name \"My Card\"}

  Args:

   *  CREDENTIALS           Optional map of `:username` and `:password` or `X-METABASE-SESSION` token of a User who we should perform the request as
   *  METHOD                `:get`, `:post`, `:delete`, or `:put`
   *  EXPECTED-STATUS-CODE  When passed, throw an exception if the response has a different status code.
   *  URL                   Base URL of the request, which will be appended to `*url-prefix*`. e.g. `card/1/favorite`
   *  HTTP-BODY-MAP         Optional map to send a the JSON-serialized HTTP body of the request
   *  URL-KWARGS            key-value pairs that will be encoded and added to the URL as GET params"
  {:arglists '([credentials? method expected-status-code? url request-options? http-body-map? & url-kwargs])}
  [& args]
  (let [[credentials [method & args]]     (u/optional #(or (map? %) (string? %)) args)
        [expected-status [url & args]]    (u/optional integer? args)
        [{:keys [request-options]} args]  (u/optional #(and (map? %) (:request-options %)) args {:request-options {}})
        [body [& {:as url-param-kwargs}]] (u/optional map? args)]
    (-client credentials method expected-status url body url-param-kwargs request-options)))
