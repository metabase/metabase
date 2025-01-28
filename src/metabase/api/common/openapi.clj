(ns metabase.api.common.openapi
  "Generate OpenAPI schema for defendpoint routes"
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.json-schema :as mjs]
   [medley.core :as m]
   [metabase.api.macros :as api.macros]
   [metabase.config :as config]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

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
            (when-let [ns-symb (:api/defendpoint-2-namespace (meta handler))]
              (collect-defendpoint-2-routes context ns-symb)))]
    (->> (walk {:prefix ""} root)
         (filter #(or
                   (-> % :route meta :schema) ; defendpoint 1 handler
                   (:defendpoint-2-definition %))))))

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

(mu/defn- multipart-schema [form :- ::api.macros/parsed-args]
  (when-let [request-schema (get-in form [:params :request :schema])]
    (let [schema (-> request-schema mr/resolve-schema mc/schema)]
      (when (= (mc/type schema) :map)
        (some (fn [[k _opts schema]]
                (when (= k :multipart-params)
                  schema))
              (mc/children schema))))))

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
        ctype                     (if (get-in form [:metadata :multipart])
                                    "multipart/form-data"
                                    "application/json")
        body-schema               (some-> (if (= ctype "multipart/form-data")
                                            (multipart-schema form)
                                            (get-in form [:params :body :schema]))
                                          mjs-collect-definitions
                                          fix-json-schema)]
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
                        (for [{:keys [path tag defendpoint-2-definition]} (collect-routes root)]
                          (try
                            [path (defendpoint-2->path-item tag path defendpoint-2-definition)]
                            (catch Exception e
                              (throw (ex-info (str "Exception at " path) {} e))))))]
      {:openapi    "3.1.0"
       :info       {:title   "Metabase API"
                    :version (:tag config/mb-version-info)}
       :paths      paths
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
