(ns metabase.http-client
  "HTTP client for making API calls against the Metabase API. For test/REPL purposes."
  (:require [clojure.tools.logging :as log]
            [cheshire.core :as json]
            [clj-http.client :as client]
            [metabase.config :as config]
            [metabase.util :as u]))

(declare authenticate
         auto-deserialize-dates
         build-url
         -client)

;; ## API CLIENT

(def ^:dynamic *url-prefix*
  "Prefix to automatically prepend to the URL of calls made with `client`."
  (str "http://localhost:" (config/config-str :mb-jetty-port) "/api/"))

(defn
  client
  "Perform an API call and return the response (for test purposes).
   The first arg after URL will be passed as a JSON-encoded body if it is a map.
   Other &rest kwargs will be passed as `GET` parameters.

  Examples:

    (client :get 200 \"card/1\")                ; GET  http://localhost:3000/api/card/1, throw exception is status code != 200
    (client :get \"card\" :org 1)               ; GET  http://localhost:3000/api/card?org=1
    (client :post \"card\" {:name \"My Card\"}) ; POST http://localhost:3000/api/card with JSON-encoded body {:name \"My Card\"}

  Args:

   *  CREDENTIALS           Optional map of `:email` and `:password` or `X-METABASE-SESSION` token of a User who we should perform the request as
   *  METHOD                `:get`, `:post`, `:delete`, or `:put`
   *  EXPECTED-STATUS-CODE  When passed, throw an exception if the response has a different status code.
   *  URL                   Base URL of the request, which will be appended to `*url-prefix*`. e.g. `card/1/favorite`
   *  HTTP-BODY-MAP         Optional map to send a the JSON-serialized HTTP body of the request
   *  URL-KWARGS            key-value pairs that will be encoded and added to the URL as GET params"
  {:arglists '([credentials? method expected-status-code? url http-body-map? & url-kwargs])}
  [& args]
  (let [[credentials [method & args]] (u/optional #(or (map? %)
                                                       (string? %)) args)
        [expected-status [url & args]] (u/optional integer? args)
        [body [& {:as url-param-kwargs}]] (u/optional map? args)]
    (-client credentials method expected-status url body url-param-kwargs)))


;; ## INTERNAL FUNCTIONS

(defn- -client [credentials method expected-status url http-body url-param-kwargs]
  ;; Since the params for this function can get a little complicated make sure we validate them
  {:pre [(or (nil? credentials)
             (map? credentials)
             (string? credentials))
         (contains? #{:get :post :put :delete} method)
         (or (nil? expected-status)
             (integer? expected-status))
         (string? url)
         (or (nil? http-body)
             (map? http-body))
         (or (nil? url-param-kwargs)
             (map? url-param-kwargs))]}

  (let [request-map (cond-> {:accept  :json
                             :headers {"X-METABASE-SESSION" (when credentials (if (map? credentials) (authenticate credentials)
                                                                                  credentials))}}
                      (seq http-body) (assoc
                                       :content-type :json
                                       :body         (json/generate-string http-body)))
        request-fn  (case method
                      :get    client/get
                      :post   client/post
                      :put    client/put
                      :delete client/delete)
        url         (build-url url url-param-kwargs)
        method-name (.toUpperCase ^String (name method))

        ;; Now perform the HTTP request
        {:keys [status body]} (try (request-fn url request-map)
                                   (catch clojure.lang.ExceptionInfo e
                                     (log/debug method-name url)
                                     (:object (ex-data e))))]

    ;; -check the status code if EXPECTED-STATUS was passed
    (log/debug method-name url status)
    (when expected-status
      (when-not (= status expected-status)
        (let [message (format "%s %s expected a status code of %d, got %d." method-name url expected-status status)
              body    (try (-> (json/parse-string body)
                               clojure.walk/keywordize-keys)
                           (catch Exception _ body))]
          (log/error (u/pprint-to-str 'red body))
          (throw (ex-info message {:status-code status})))))

    ;; Deserialize the JSON response or return as-is if that fails
    (try (-> body
             json/parse-string
             clojure.walk/keywordize-keys
             auto-deserialize-dates)
         (catch Exception _
           (if (clojure.string/blank? body) nil
               body)))))

(defn authenticate [{:keys [email password] :as credentials}]
  {:pre [(string? email)
         (string? password)]}
  (try
    (-> (client :post 200 "session" credentials)
        :id)
    (catch Exception e
      (log/error "Failed to authenticate with email:" email "and password:" password ". Does user exist?"))))

(defn- build-url [url url-param-kwargs]
  {:pre [(string? url)
         (or (nil? url-param-kwargs)
             (map? url-param-kwargs))]}
  (str *url-prefix* url (when-not (empty? url-param-kwargs)
                          (str "?" (->> url-param-kwargs
                                        (map (fn [[k v]]
                                               [(if (keyword? k) (name k) k)
                                                (if (keyword? v) (name v) v)]))
                                        (map (partial interpose "="))
                                        (map (partial apply str))
                                        (interpose "&")
                                        (apply str))))))


;; ## AUTO-DESERIALIZATION

(def ^:private ^:const auto-deserialize-dates-keys
  #{:created_at :updated_at :last_login :date_joined :started_at :finished_at})

(defn- auto-deserialize-dates
  "Automatically recurse over RESPONSE and look for keys that are known to correspond to dates.
   Parse their values and convert to `java.sql.Timestamps`."
  [response]
  (cond (sequential? response) (map auto-deserialize-dates response)
        (map? response) (->> response
                             (map (fn [[k v]]
                                    {k (cond
                                         (contains? auto-deserialize-dates-keys k) (u/->Timestamp v)
                                         (coll? v) (auto-deserialize-dates v)
                                         :else v)}))
                             (into {}))
        :else response))
