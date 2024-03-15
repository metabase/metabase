(ns metabase.api.common.openapi
  "Generate OpenAPI schema for defendpoint routes"
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [malli.json-schema :as mjs]))

(def ^:private ^:dynamic *definitions* nil)

(defn- fix-locations
  "Fixes all {:$ref ....} locations - could be in properties, or in allOf/anyOf with arbitrary nesting."
  [schema]
  (walk/postwalk (fn [x]
                   (cond-> x
                     (:$ref x) (update :$ref str/replace "#/definitions/" "#/components/schemas/")))
                 schema))

(defn- json-schema-transform [malli-schema]
  ;; '/' must be encoded as '~1' in JSON Schema - https://www.rfc-editor.org/rfc/rfc6901
  (let [jss         (mjs/transform malli-schema)
        definitions (update-vals (:definitions jss) fix-locations)]
    (when *definitions*
      (swap! *definitions* merge definitions))
    (-> jss
        (dissoc :definitions)
        (update :properties fix-locations))))

(defn- path->openapi [path]
  (str/replace path #":([^/]+)" "{$1}"))

(defn- collect-routes
  "This is basically tree-seq with post-processing"
  [root]
  (let [first-if-vec #(if (vector? %) (first %) %)
        walk         (fn walk [{:keys [prefix tag]} route]
                       (let [tag  (or (not-empty tag) (some-> (not-empty prefix) (subs 1)))
                             path (str prefix (-> route meta :path first-if-vec))]
                         (cons {:path  (path->openapi path)
                                :tag   tag
                                :route route}
                               (when (-> route meta :routes)
                                 (mapcat (partial walk {:prefix path :tag tag}) (-> route meta :routes))))))]
    (->> (walk {:prefix ""} root)
         (filter #(-> % :route meta :schema)))))

(defn- schema->params [method full-path schema]
  (let [{:keys [properties required]} (json-schema-transform schema)
        required                      (set required)
        in-path?                      (set (map (comp keyword second) (re-seq #"\{([^}]+)\}" full-path)))]
    (for [[k schema] properties
          :when      (or (in-path? k) (= method :get))]
      (cond-> {:in          (if (in-path? k) :path :query)
               :name        k
               :required    (contains? required k)
               :schema      (dissoc schema :description)}
        (:description schema) (assoc :description (:description schema))))))

(defn- defendpoint->openapi
  "Generate OpenAPI desc for a single handler"
  [tag full-path handler-var]
  (let [{:keys [method schema]} (meta handler-var)
        params                  (schema->params method full-path schema)
        non-body-param?         (set (map :name params))
        body                    (when (not= method :get)
                                  (into [:map] (remove #(non-body-param? (first %)) (rest schema))))
        ctype                   (if (:multipart (meta handler-var))
                                  "multipart/form-data"
                                  "application/json")]
    {method (cond-> {:parameters params}
              tag  (assoc :tags [tag])
              body (assoc :requestBody {:content {ctype {:schema (json-schema-transform body)}}}))}))

(defn openapi-object
  "Generate base object for OpenAPI (/paths and /components/schemas)

  https://spec.openapis.org/oas/latest.html#openapi-object"
  [root]
  ;; this is `[["path" {:get x}] ["path" {:post y}]]` => `{"path" {:get x :post y}}`
  (binding [*definitions* (atom {})]
    (let [paths (reduce (fn [acc [k v]]
                          (merge-with into acc {k v}))
                        {}
                        (for [{:keys [path tag route]} (collect-routes root)]
                          [path (defendpoint->openapi tag path route)]))]
      {:paths      paths
       :components {:schemas @*definitions*}})))
