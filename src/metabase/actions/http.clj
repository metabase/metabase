(ns metabase.actions.http
  "The request of an HTTP action: its templates filled in with parameter values, and sent."
  (:require
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.actions.schema :as actions.schema]
   [metabase.actions.settings :as actions.settings]
   [metabase.lib.core :as lib]
   [metabase.util :as u]
   [metabase.util.http :as u.http]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [ring.util.codec :as codec]))

(set! *warn-on-reflection* true)

(def ^:private timeout-ms 10000)

(mr/def ::request
  "The clj-http request of an HTTP action."
  [:map {:closed true}
   [:method       [:enum :get :post :put :patch :delete]]
   [:url          :string]
   [:query-params {:optional true} [:map-of :string :string]]
   [:headers      {:optional true} [:map-of :string :string]]
   [:accept       {:optional true} [:= :json]]
   [:content-type {:optional true} [:= :json]]
   [:body         {:optional true} :string]])

(defn- parse-template
  "The tokens of `template`, string fragments between placeholders and optional blocks; throws a 400 when it can't be
  parsed."
  [template]
  (try
    (lib/parse-parameters template false)
    (catch Exception e
      (throw (ex-info (tru "Invalid template {0}: {1}" (pr-str template) (ex-message e)) {:status-code 400} e)))))

(defn- template-names
  "The names of the placeholders among `tokens`, those in optional blocks included."
  [tokens]
  (mapcat #(cond
             (lib/parsed-param? %)          [(:k %)]
             (lib/parsed-optional-param? %) (template-names (:args %)))
          tokens))

(defn- action-templates
  "Every template of the HTTP `action`: its URL, its query parameter and header values, and the strings in its body."
  [{:keys [url query_params headers body]}]
  (concat [url]
          (vals query_params)
          (vals headers)
          (filter string? (tree-seq coll? #(if (map? %) (vals %) %) body))))

(defn- value->string
  "`value` as it goes in a string, a list of values joined with commas."
  [value]
  (if (sequential? value)
    (str/join "," value)
    (str value)))

(defn- render-tokens
  "`tokens` as a string, each placeholder replaced with its value passed through `encode`, and an optional block left out
  when it misses a value; throws a 400 when a value outside one is missing."
  [tokens values encode]
  (letfn [(render [tokens]
            (reduce (fn [acc token]
                      (cond
                        (string? token)
                        (update acc :s str token)

                        (lib/parsed-param? token)
                        (if-some [value (get values (:k token))]
                          (update acc :s str (encode (value->string value)))
                          (update acc :missing conj (:k token)))

                        (lib/parsed-optional-param? token)
                        (let [{:keys [s missing]} (render (:args token))]
                          (cond-> acc (empty? missing) (update :s str s)))))
                    {:s "" :missing []}
                    tokens))]
    (let [{:keys [s missing]} (render tokens)]
      (when (seq missing)
        (throw (ex-info (tru "Missing values for {0}." (str/join ", " (distinct missing))) {:status-code 400})))
      s)))

(defn- render-value
  "The value of `template`: the value of its only placeholder as it is, or `::missing` without one, else the filled-in
  string."
  [template values]
  (let [[token :as tokens] (parse-template template)]
    (if (and (= 1 (count tokens)) (lib/parsed-param? token))
      (let [value (get values (:k token))]
        (if (some? value) value ::missing))
      (render-tokens tokens values identity))))

(defn- render-strings
  "The map of `templates` filled in as strings, without the keys whose only placeholder misses a value."
  [templates values]
  (into {}
        (keep (fn [[k template]]
                (let [value (render-value template values)]
                  (when-not (= ::missing value)
                    [k (value->string value)]))))
        templates))

(defn- render-body
  "The JSON `body` with each string filled in, without the map entries whose only placeholder misses a value."
  [body values]
  (letfn [(render [x]
            (cond
              (string? x)     (render-value x values)
              (map? x)        (into {}
                                    (keep (fn [[k v]]
                                            (let [v (render v)]
                                              (when-not (= ::missing v) [k v]))))
                                    x)
              (sequential? x) (mapv #(let [v (render %)] (when-not (= ::missing v) v)) x)
              :else           x))]
    (render body)))

(mu/defn check-http-action
  "Throws a 400 when `action` is an HTTP action without a method or URL, or with a placeholder that names none of its
  parameters' slugs."
  [{:keys [parameters method url], :as action} :- ::actions.schema/action.executable]
  (when (= :http (keyword (:type action)))
    (when-not (and method url)
      (throw (ex-info (tru "An HTTP action needs a method and a URL.") {:status-code 400})))
    (let [slugs   (into #{} (keep :slug) parameters)
          unknown (into (sorted-set)
                        (comp (mapcat (comp template-names parse-template))
                              (remove slugs))
                        (action-templates action))]
      (when (seq unknown)
        (throw (ex-info (tru "No parameter has the slug {0}." (str/join ", " unknown)) {:status-code 400}))))))

(mu/defn request :- ::request
  "The clj-http request of the HTTP `action` with `values`, a map of parameter slug to value."
  [{:keys [method url query_params headers body]} :- ::actions.schema/action.executable
   values                                         :- [:map-of :string ::actions.schema/execute-parameter-value]]
  (cond-> {:method       (keyword (u/lower-case-en method))
           :url          (render-tokens (parse-template url) values codec/url-encode)
           :query-params (render-strings query_params values)
           :headers      (render-strings headers values)
           :accept       :json}
    body (assoc :content-type :json
                :body         (json/encode (render-body body values)))))

(defn- check-url
  "Throws a 400 unless `url` is an HTTP or HTTPS URL whose host `policy` allows."
  [policy url]
  (let [url (try
              (io/as-url url)
              (catch Exception e
                (throw (ex-info (tru "Invalid URL: {0}" (ex-message e)) {:status-code 400} e))))]
    (when-not (#{"http" "https"} (.getProtocol ^java.net.URL url))
      (throw (ex-info (tru "The URL must start with http:// or https://.") {:status-code 400})))
    (when-not (u.http/host-allowed-for-network-policy? policy url)
      (throw (ex-info (tru "The URL''s host is not allowed.") {:status-code 400})))))

(defn- response-body
  "The body of the clj-http `response`, decoded when it is JSON."
  [response]
  (let [body (:body response)]
    (if (some-> (u.http/response-content-type response) (str/ends-with? "json"))
      (try
        (json/decode body)
        (catch Exception _ body))
      body)))

(defn- request-error
  "A 502 for a request that got `message`, with the status and body of the `response` it got, if any."
  [message response]
  (ex-info message
           (cond-> {:status-code 502
                    :error-code  "http-action-request-failed"}
             response (assoc :response-status (:status response)
                             :response-body   (response-body response)
                             :response/keys   #{:response-status :response-body}))))

(mu/defn send! :- [:map {:closed true}
                   [:response-status :int]
                   [:response-body   :any]]
  "Sends the clj-http `req` and returns its response status and body; throws a 502 when it fails or is not 2xx."
  [req :- ::request]
  (let [policy (actions.settings/http-action-allowed-networks)]
    (check-url policy (:url req))
    (let [response (try
                     (http/request (cond-> (assoc req
                                                  :as                 :string
                                                  :throw-exceptions   false
                                                  :redirect-strategy  :none
                                                  :socket-timeout     timeout-ms
                                                  :connection-timeout timeout-ms)
                                     (not= policy :allow-all)
                                     (assoc :dns-resolver (u.http/network-policy-dns-resolver policy))))
                     (catch Exception e
                       (throw (request-error (tru "The request failed: {0}" (ex-message e)) nil))))]
      (when-not (<= 200 (:status response) 299)
        (throw (request-error (tru "The request failed with status {0}." (:status response)) response)))
      {:response-status (:status response)
       :response-body   (response-body response)})))
