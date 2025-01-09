(ns metabase.api.common.openapi
  "Generate OpenAPI schema for defendpoint routes"
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [malli.json-schema :as mjs]
   [medley.core :as m]
   [metabase.api.macros :as api.macros]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms])
  (:import
   (clojure.lang PersistentVector)))

(set! *warn-on-reflection* true)

(def ^:private ^:dynamic *definitions* nil)

;;; Helpers

(defn- mjs-collect-definitions
  "We transform json-schema in a few different places, but we need to collect all defitions in a single one."
  [malli-schema]
  (let [jss         (mjs/transform malli-schema {::mjs/definitions-path "#/components/schemas/"})]
    (when *definitions*
      (swap! *definitions* merge (:definitions jss)))
    (dissoc jss :definitions)))

(defn- merge-required [schema]
  (let [optional? (set (keep (fn [[k v]] (when (:optional v) k))
                             (:properties schema)))]
    (-> schema
        (m/update-existing :required #(vec (remove optional? %)))
        (m/update-existing :properties #(update-vals % (fn [v] (dissoc v :optional)))))))

(def ^:private file-schema (mjs/transform ms/File))

(mu/defn- fix-json-schema :- [:map
                              [:description {:optional true} [:maybe string?]]]
  "Clean-up JSON schema to make it more understandable for OpenAPI tools.

  Returns a new schema WITH an indicator if it's *NOT* required.

  NOTE: maybe instead of fixing it up later we should re-work Malli's json-schema transformation into a way we want it
  to be?"
  [schema]
  (let [schema (m/update-existing schema :description str)]
    (cond
      ;; we're using `[:maybe ...]` a lot, and it generates `{:oneOf [... {:type "null"}]}`
      ;; it needs to be cleaned up to be presented in OpenAPI viewers
      (and (:oneOf schema)
           (= (second (:oneOf schema)) {:type "null"}))
      (recur (merge (first (:oneOf schema))
                    (when-let [description (:description schema)]
                      {:description (str description)})
                    (select-keys schema [:default])
                    {:optional true}))

      ;; this happens when we use `[:and ... [:fn ...]]`, the `:fn` schema gets converted into an empty object
      (:allOf schema)
      (cond
        (= {} (first (:allOf schema)))  (recur (merge (second (:allOf schema))
                                                      (select-keys schema [:description :default])))
        (= {} (second (:allOf schema))) (recur (merge (first (:allOf schema))
                                                      (select-keys schema [:description :default])))
        :else                           (update schema :allOf (partial mapv fix-json-schema)))

      (= (select-keys schema (keys file-schema)) file-schema)
      ;; I got this from StackOverflow and docs are not in agreement, but RapiDoc
      ;; shows file input, so... :)
      (merge {:type "string" :format "binary"}
             (select-keys schema [:description :default]))

      (:properties schema)
      (merge-required
       (update schema :properties #(update-vals % fix-json-schema)))

      (= (:type schema) "array")
      (update schema :items fix-json-schema)

      :else
      schema)))

(defn- path->openapi [path]
  (str/replace path #":([^/]+)" "{$1}"))

;;; OpenAPI generation

(defn- first-if-vec [x]
  (if (vector? x) (first x) x))

(defn- collect-defendpoint-1-routes [walk {:keys [prefix tag]} handler-var]
  (let [tag  (or (not-empty tag) (some-> (not-empty prefix) (subs 1)))
        path (str prefix (-> handler-var meta :path first-if-vec))]
    (cons {:path  (path->openapi path)
           :tag   tag
           :route handler-var}
          (when-let [routes (-> handler-var meta :routes not-empty)]
            (mapcat (partial walk {:prefix path :tag tag})
                    routes)))))

(defn- collect-defendpoint-2-routes [{:keys [prefix tag]} ns-symb]
  (for [route (vals (-> ns-symb the-ns meta :api/endpoints))]
    {:path                     (path->openapi (str prefix (get-in route [:form :route :path])))
     :tag                      (or (not-empty tag) (some-> (not-empty prefix) (subs 1)))
     :defendpoint-2-definition (:form route)}))

(mu/defn- collect-routes :- [:sequential
                             [:or
                              ;; defendpoint 1 handler var
                              [:map
                               [:path string?]
                               [:route (ms/InstanceOfClass clojure.lang.Var)]]
                              ;; defendpoint 2 parsed args
                              [:map
                               [:path string?]
                               [:defendpoint-2-definition ::api.macros/parsed-args]]]]
  "Collect routes with schemas with their full paths."
  [root]
  (letfn [(walk [context handler]
            (concat
             (when-let [ns-symb (:api/defendpoint-2-namespace (meta handler))]
               (collect-defendpoint-2-routes context ns-symb))
             (collect-defendpoint-1-routes walk context handler)))]
    (->> (walk {:prefix ""} root)
         (filter #(or
                   (-> % :route meta :schema) ; defendpoint 1 handler
                   (:defendpoint-2-definition %))))))

(defn- compojure-query-params
  "This function is not trying to parse whole compojure syntax, just get the names of query parameters out"
  [args]
  (loop [args args
         params []]
    (if (empty? args)
      (map keyword params)
      (let [[x y] args]
        (cond
          ;; we don't care about rest binding
          (= '& x)    (recur (nnext args) params)
          ;; and about coercion too
          (= :<< x)   (recur (nnext args) params)
          (= :as x)   (recur (nnext args)
                             (into params (when (map? y)
                                            (let [qp (:query-params (set/map-invert y))]
                                              (when (map? qp)
                                                ;; {c :count :keys [a b}} ; => [count a b]
                                                (flatten (vals qp)))))))
          (symbol? x) (recur (next args)
                             (conj params x)))))))

(defn- compojure-renames
  "Find out everything that's renamed in Compojure routes"
  [args]
  (let [idx          (inc (.indexOf ^PersistentVector args :as))
        req-bindings (get args idx)]
    (when (and (pos? idx)
               (map? req-bindings))
      (let [renames (->> (keys req-bindings) ; {{c :count} :query-params} ; => [{c :count}]
                         (filter map?)       ; no stuff like {:keys [a]}
                         (apply merge))]
        (update-keys renames keyword)))))

(defn- schema->params*
  [schema in-fn renames]
  (let [{:keys [properties required]} (mjs-collect-definitions schema)
        required                      (set required)]
    (for [[k param-schema] properties
          :let             [k (get renames k k)]
          :when            (in-fn k)
          :let             [schema    (fix-json-schema param-schema)
                            ;; if schema does not indicate it's optional, it's not :)
                            optional? (:optional schema)]]
      (cond-> {:in          (in-fn k)
               :name        k
               :required    (and (contains? required k) (not optional?))
               :schema      (dissoc schema :optional :description)}
        (:description schema) (assoc :description (str (:description schema)))))))

(defn- schema->params
  "https://spec.openapis.org/oas/latest.html#parameter-object"
  [full-path args schema]
  (let [in-path?  (set (map (comp keyword second) (re-seq #"\{([^}]+)\}" full-path)))
        in-query? (set (compojure-query-params args))
        in-fn     (fn [k]
                    (cond
                      (in-path? k)  :path
                      (in-query? k) :query))
        renames   (some-> args compojure-renames)]
    (schema->params* schema in-fn renames)))

(mu/defn- defendpoint->path-item
  "Generate OpenAPI desc for a single legacy `defendpoint` handler

  https://spec.openapis.org/oas/latest.html#path-item-object"
  [tag
   full-path   :- string?
   handler-var :- (ms/InstanceOfClass clojure.lang.Var)]
  (let [{:keys [method] :as data} (meta handler-var)
        params                    (schema->params full-path (:args data) (:schema data))
        non-body-param?           (set (map :name params))
        body-params               (when (not= method :get)
                                    (remove #(non-body-param? (first %)) (rest (:schema data))))
        body-schema               (when (seq body-params)
                                    (fix-json-schema
                                     (mjs-collect-definitions (into [:map] body-params))))
        ctype                     (if (:multipart (meta handler-var))
                                    "multipart/form-data"
                                    "application/json")]
    ;; summary is the string in the sidebar of Scalar
    {method (cond-> {:summary     (str (u/upper-case-en (name method)) " " full-path)
                     :description (some-> (or (:orig-doc data)
                                              (:doc data))
                                          str)
                     :parameters params}
              tag         (assoc :tags [tag])
              body-schema (assoc :requestBody {:content {ctype {:schema body-schema}}}))}))

(mu/defn- defendpoint-2->path-item
  "Generate OpenAPI desc for `defendpoint` 2.0 ([[metabase.api.macros/defendpoint]]) handler.

  https://spec.openapis.org/oas/latest.html#path-item-object"
  [tag
   full-path :- string?
   form      :- ::api.macros/parsed-args]
  (let [method                    (:method form)
        route-params              (when-let [schema (get-in form [:params :route :schema])]
                                    (schema->params* schema (constantly :path) nil))
        query-params              (when-let [schema (get-in form [:params :query :schema])]
                                    (schema->params* schema (constantly :query) nil))
        params                    (concat
                                   (for [param route-params]
                                     (assoc param :in :path))
                                   query-params)
        body-schema               (some-> (get-in form [:params :body :schema])
                                          mjs-collect-definitions
                                          fix-json-schema)
        ;; multipart is not yet implemented for defendpoint 2 but this is a placeholder until it is I guess
        ctype                     (if (get-in form [:metadata :multipart])
                                    "multipart/form-data"
                                    "application/json")]
    ;; summary is the string in the sidebar of Scalar
    {method (cond-> {:summary     (str (u/upper-case-en (name method)) " " full-path)
                     :description (some-> (:docstr form) str)
                     :parameters params}
              tag         (assoc :tags [tag])
              body-schema (assoc :requestBody {:content {ctype {:schema body-schema}}}))}))

(defn openapi-object
  "Generate base object for OpenAPI (/paths and /components/schemas)

  https://spec.openapis.org/oas/latest.html#openapi-object"
  [root]
  ;; this is `[["path" {:get x}] ["path" {:post y}]]` => `{"path" {:get x :post y}}`
  (binding [*definitions* (atom {})]
    (let [paths (reduce (fn [acc [k v]]
                          (merge-with into acc {k v}))
                        {}
                        (for [{:keys [path tag route defendpoint-2-definition]} (collect-routes root)]
                          (try
                            [path (if defendpoint-2-definition
                                    (defendpoint-2->path-item tag path defendpoint-2-definition)
                                    (defendpoint->path-item tag path route))]
                            (catch Exception e
                              (throw (ex-info (str "Exception at " path) {} e))))))]
      {:paths      paths
       :components {:schemas (update-vals @*definitions* fix-json-schema)}})))

(comment
  ;; See what is the result of generation, could be helpful debugging what's wrong with display in rapidoc
  ;; `resolve` is to appease clj-kondo which will complain for #'
  (defendpoint->path-item nil "/path" (resolve 'metabase-enterprise.serialization.api/POST_export))

  (collect-routes (requiring-resolve 'metabase.api.timeline/routes))

  (openapi-object (requiring-resolve 'metabase.api.timeline/routes))

  (get-in (openapi-object (requiring-resolve 'metabase.api.routes/routes)) [:paths "/timeline/"])

  (openapi-object (resolve 'metabase.api.pulse/routes))

  (->> (openapi-object (resolve 'metabase.api.routes/routes))
       :paths
       (map #(second (str/split (key %) #"/")))
       set))
