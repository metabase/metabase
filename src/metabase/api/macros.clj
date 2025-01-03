(ns metabase.api.macros
  "NEW macro for defining REST API endpoints. See
  [Cam's tech design doc](https://www.notion.so/metabase/defendpoint-2-0-16169354c901806ca10cf45be6d91891) for
  motivation behind it."
  (:require
   [clojure.core.specs.alpha]
   [clojure.spec.alpha :as s]
   [clout.core :as clout]
   [compojure.core :as compojure]
   [flatland.ordered.map :as ordered-map]
   [malli.core :as mc]
   [malli.error :as me]
   [malli.transform :as mtx]
   [metabase.api.common.internal]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(s/def ::defendpoint.route.regex
  (some-fn symbol?
           string?
           #(instance? java.util.regex.Pattern %)
           ;; I guess it would be possible to have something like (re-pattern whatever...) here
           seq?))

(s/def ::defendpoint.route.key-regex-pair
  (s/cat :key   keyword?
         :regex ::defendpoint.route.regex))

(s/def ::defendpoint.route
  ;; TODO -- make the string stricter
  (s/or
   :path   string?
   ;; a vector like ["whatever/:export-format" :export-format some-regex]
   :vector (s/and
            vector?
            (s/spec (s/cat :path    string?
                           :regexes (s/+ ::defendpoint.route.key-regex-pair))))))

(defn- parse-route [[route-type route]]
  (case route-type
    :path   (merge
             {:path route}
             ;; not clear whether auto-parse is desirable or not =(
             (when-let [regexes (not-empty (into {}
                                                 (map metabase.api.common.internal/route-param-regex)
                                                 (metabase.api.common.internal/route-arg-keywords route)))]
               {:regexes regexes}))
    :vector (update route :regexes #(into {} (map (juxt :key :regex)) %))))

(s/def ::defendpoint.schema-specifier
  (s/?
   (s/cat
    :horn   #{:-}
    :schema any?)))

(s/def ::defendpoint.params.param
  (s/cat
   :binding (s/nonconforming :clojure.core.specs.alpha/binding-form)
   :schema  ::defendpoint.schema-specifier))

(s/def ::defendpoint.params
  (s/and
   vector?
   (s/spec
    (s/cat
     :route (s/? ::defendpoint.params.param)
     :query (s/? ::defendpoint.params.param)
     :body  (s/? ::defendpoint.params.param)))))

(defn- parse-params [params]
  (reduce
   (fn [params k]
     (cond-> params
       (get-in params [k :schema]) (update-in [k :schema] :schema)))
   params
   [:route :query :body]))

(s/def ::defendpoint
  (s/cat
   :method        #{:get :post :update :delete}
   :route         ::defendpoint.route
   :result-schema ::defendpoint.schema-specifier
   :docstr        (s/? string?)
   :metadata      (s/? map?)
   :params        ::defendpoint.params
   :body          (s/* any?)))

(defn- parse-defendpoint-args [args]
  (let [conformed (s/conform ::defendpoint args)]
    (cond-> conformed
      true                       (update :route parse-route)
      true                       (update :params parse-params)
      (:result-schema conformed) (update :result-schema :schema))))

(defn- defendpoint-unique-key
  "Unique key for a given endpoint, based on method + route"
  {:style/indent [:form]}
  [{:keys [method route]}]
  [method (:path route)])

(def ^:private decode-transformer
  (mtx/transformer
   metabase.api.common.internal/defendpoint-transformer
   {:name :api}))

(def ^:private encode-transformer
  (mtx/transformer
   (mtx/default-value-transformer)
   {:name :api}))

(defn- decoder [schema]
  (mr/cached ::decoder schema #(mc/decoder schema decode-transformer)))

(defn- encoder [schema]
  (mr/cached ::encoder schema #(mc/encoder schema encode-transformer)))

(defn- validate-and-encode-response [schema form]
  (when-not (mr/validate schema form)
    (throw (ex-info (format "Invalid response")
                    {:status-code 400
                     :error       (-> schema
                                      (mr/explain form)
                                      me/with-spell-checking
                                      (me/humanize {:wrap mu/humanize-include-value}))})))
  ((encoder schema) form))

(defn- params-binding [args params-type]
  (get-in args [:params params-type :binding] '_))

(defn decode-and-validate-params
  "Impl for [[defendpoint]]."
  [params-type schema form]
  (let [decoded ((decoder schema) form)]
    (when-not (mr/validate schema decoded)
      (throw (ex-info (format "Invalid request %s" (case params-type
                                                     :route "route parameters"
                                                     :query "query parameters"
                                                     :body  "body"))
                      {:status-code 400
                       :api/debug   {:params-type params-type
                                     :schema      (mc/form schema)
                                     :form        form
                                     :decoded     decoded}
                       :error       (-> schema
                                        (mr/explain decoded)
                                        me/with-spell-checking
                                        (me/humanize {:wrap mu/humanize-include-value}))})))
    decoded))

(defn- decode-and-validate-params-form [args params-type form]
  (if-let [schema (get-in args [:params params-type :schema])]
    `(decode-and-validate-params ~params-type ~schema ~form)
    form))

(defn defendpoint-response
  "1. Validate response against schema
   2. Coerce response using schema
   3. Wrap response as needed"
  {:style/indent [:form]}
  ([response]
   (metabase.api.common.internal/wrap-response-if-needed response))
  ([response schema]
   (defendpoint-response (validate-and-encode-response schema response))))

(defmacro defendpoint-core-fn
  "Impl for [[defendpoint]]. Generate the core function wrapper for an endpoint. You can get this to play with from the
  REPL or tests with [[ns-route-fns]]. `f` has the form

  (f
   ([])
   ([route-params])
   ([route-params query-params])
   ([route-params query-params body-params])"
  {:style/indent [:form]}
  [{:keys [body result-schema], :as args}]
  (let [route-params (gensym "route-params-")
        query-params (gensym "query-params-")
        body-params  (gensym "body-params-")]
    `(fn f#
       ([]
        (f# nil nil nil))
       ([~route-params]
        (f# ~route-params nil nil))
       ([~route-params ~query-params]
        (f# ~route-params ~query-params nil))
       ([~route-params ~query-params ~body-params]
        (let [~(params-binding args :route) ~(decode-and-validate-params-form args :route route-params)
              ~(params-binding args :query) ~(decode-and-validate-params-form args :query query-params)
              ~(params-binding args :body)  ~(decode-and-validate-params-form args :body  body-params)]
          (defendpoint-response
            (do ~@body)
            ~@(when result-schema [result-schema])))))))

(defn- defendpoint-params
  "Fetch parameters of a certain type (`:route`, `:query`, or `:body`) from a `request`."
  {:style/indent [:form]}
  [request params-type]
  (case params-type
    :route (:route-params request)
    :query (some-> (:query-params request) (update-keys keyword))
    :body  (:body request)))

(defn- default-raise
  "Default `raise` function for defendpoint handler functions."
  [e]
  (throw e))

(defn defendpoint-base-handler
  "Generate the a Ring handler (excluding the Clout/Compojure method/route matching stuff) for parsed [[defendpoint]]
  `args`."
  {:style/indent [:form]}
  [core-fn]
  (fn f
    ([request]
     (f request identity default-raise))
    ([request respond raise]
     (try
       (let [route-params (defendpoint-params request :route)
             query-params (defendpoint-params request :query)
             body-params  (defendpoint-params request :body)]
         (respond (core-fn route-params query-params body-params)))
       (catch Throwable e
         (raise e))))))

(defmacro defendpoint-route-handler
  "Generate the Clout/Compojure route (handler) given parsed [[defendpoint]] `args`."
  {:style/indent [:form]}
  [{:keys [method route], :as _args} base-handler]
  `(compojure/make-route
    ~method
    (clout/route-compile ~(:path route) ~(:regexes route))
    ~base-handler))

(defn defendpoint-dox
  "Generate documentation for an API endpoint based on parsed `args`. This is used to generate the documentation in
  `docs/api`."
  {:style/indent [:form]}
  [_args])

(defn defendpoint-openapi-spec
  "Generate OpenAPI specs for an API endpoint based on parsed `args`."
  {:style/indent [:form]}
  [_args])

(defn reset-ns-routes!
  "For REPL convenience: remove all endpoints associated with a namespace from its metadata."
  ([]
   (reset-ns-routes! *ns*))
  ([nmspace]
   (alter-meta! (the-ns nmspace) dissoc :api/endpoints)))

(defn ns-routes
  "Get the REST API endpoint handlers and forms in a namespace from its metadata."
  ([]
   (ns-routes *ns*))
  ([nmspace]
   (-> nmspace the-ns meta :api/endpoints)))

(defn ns-route-fns
  "Get the REST API endpoint functions in a namespace from its metadata.

    (metabase.api.macros/ns-route-fns 'metabase.api.timeline)

    ;; => {[:post \"/\"] #function[metabase.api.timeline/eval146368/f--146308--auto----146372]}

    (get (metabase.api.macros/ns-route-fns 'metabase.api.timeline) [:post \"/\"])
    ;; => #function[metabase.api.timeline/eval146368/f--146308--auto----146372]

    (let [f (get (metabase.api.macros/ns-route-fns 'metabase.api.timeline) [:post \"/\"])]
      (f {:id \"100\"}))
    ;; => Execution error (ExceptionInfo) You do not have curate permissions for this Collection."
  ([]
   (ns-route-fns *ns*))
  ([nmspace]
   (update-vals (ns-routes nmspace) :f)))

(defn- defendpoint-build-ns-handler [endpoints]
  (->> endpoints
       vals
       (map :handler)
       (apply compojure/routes)))

(defn update-ns-endpoints!
  "Update the information about and handler stored in namespace metadata for the endpoints defined by [[defendpoint]]."
  [nmspace k info]
  (alter-meta!
   (the-ns nmspace)
   (fn [metadata]
     (letfn [(update-api-endpoints [api-endpoints]
               ;; use an ordered map to preserve the order the endpoints were defined
               (assoc (or api-endpoints (ordered-map/ordered-map)) k info))
             (update-info [metadata]
               (update metadata :api/endpoints update-api-endpoints))
             (rebuild-handler [metadata]
               (assoc metadata :api/handler (defendpoint-build-ns-handler (:api/endpoints metadata))))]
       (-> metadata update-info rebuild-handler)))))

(defmacro defendpoint
  "NEW macro for defining REST API endpoints. See
  [Cam's tech design doc](https://www.notion.so/metabase/defendpoint-2-0-16169354c901806ca10cf45be6d91891) for
  motivation behind it."
  {:added "0.53.0"}
  [& args]
  (let [parsed (parse-defendpoint-args args)]
    `(let [core-fn#       (defendpoint-core-fn ~parsed)
           base-handler#  (defendpoint-base-handler core-fn#)
           route-handler# (defendpoint-route-handler ~parsed base-handler#)]
       (update-ns-endpoints! *ns* ~(defendpoint-unique-key parsed) {:f            core-fn#
                                                                    :base-handler base-handler#
                                                                    :handler      route-handler#
                                                                    :form         '~parsed}))))

(s/fdef defendpoint
  :args ::defendpoint
  :ret  any?)
