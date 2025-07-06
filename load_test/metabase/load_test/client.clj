(ns metabase.load-test.client
  "provides an http client pointed at the ephemeral nginx load balancer"
  (:require
   [clojure.edn :as edn]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.load-test.system :as lt.system]
   [metabase.server.middleware.session :as mw.session]
   [metabase.test-runner.assert-exprs :as test-runner.assert-exprs]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.humanize :as mu.humanize]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [org.httpkit.client :as http]
   [peridot.multipart]
   [ring.util.codec :as codec])
  (:import
   (java.io ByteArrayInputStream)))

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
         (-> lt.system/*system* :web/nginx :container-info :mapped-ports (get 80))
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
      {:body (ByteArrayInputStream. (.getBytes (json/encode http-body) "UTF-8"))}

      (= "multipart/form-data" content-type)
      (peridot.multipart/build http-body)

      (= "application/x-www-form-urlencoded" content-type)
      {:body (ByteArrayInputStream. (.getBytes ^String (codec/form-encode http-body) "UTF-8"))}

      :else
      (throw (ex-info "If you want this content-type to work, improve me"
                      {:content-type content-type})))))

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
  (try
    (let [response (client :post 200 "session" credentials)]
      (or (:id response)
          (throw (ex-info "Unexpected response" {:response response}))))
    (catch Throwable e
      (log/errorf e "Failed to authenticate with credentials %s" credentials)
      (throw (ex-info "Failed to authenticate with credentials"
                      {:credentials credentials}
                      e)))))

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
      (json/decode body parse-response-key)
      (catch Throwable e
        ;; if this actually looked like some sort of JSON response and we failed to parse it, log it so we can debug it
        ;; more easily in the REPL.
        (when (or (str/starts-with? body "{")
                  (str/starts-with? body "["))
          (log/warnf e "Error parsing string response as JSON: %s\nResponse:\n%s" (ex-message e) body))
        (when-not (str/blank? body)
          body)))))

;;; client

(defn build-request-map
  "Build the request map we ultimately pass to [[clj-http.client]]. Add user credential headers, specify JSON encoding,
  and encode body as JSON."
  [credentials http-body request-options]
  (let [content-type (or (get-in request-options [:headers "content-type"]) "application/json")]
    (m/deep-merge
     {:accept        :json
      :headers       {"content-type" content-type
                      "host" (-> lt.system/*system* :web/metabase :virtual-host)
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
  [{:keys [credentials method url http-body query-parameters request-options]} :- ClientParamsMap]
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
        {:keys [status] :as response} @(thunk)]
    (u/prog1 (update response :body parse-response)
      (log/debug :http-request method-name url status))))

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
      (let [explain-data (mr/explain http-client-args args)]
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

(defn client
  "Identical to `real-client` except returns the full HTTP response map, not just the body of the response."
  {:arglists '([credentials? method expected-status-code? url request-options? http-body-map? & query-parameters])}
  [& args]
  (let [parsed (parse-http-client-args args)]
    (log/trace parsed)
    (u/with-timeout response-timeout-ms
      (-client parsed))))
