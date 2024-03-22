(ns metabase.api.common.openapi
  "Generate OpenAPI schema for defendpoint routes"
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [malli.json-schema :as mjs]
   [metabase.util :as u]))

(def ^:private ^:dynamic *definitions* nil)

;;; Helpers

(defn- fix-locations
  "Fixes all {:$ref ....} locations - could be in properties, or in allOf/anyOf with arbitrary nesting."
  [schema]
  (walk/postwalk (fn [x]
                   (cond-> x
                     (:$ref x) (update :$ref str/replace "#/definitions/" "#/components/schemas/")))
                 schema))

(defn- json-schema-transform [malli-schema]
  (let [jss         (mjs/transform malli-schema)
        definitions (update-vals (:definitions jss) fix-locations)]
    (when *definitions*
      (swap! *definitions* merge definitions))
    (-> jss
        (dissoc :definitions)
        (update :properties fix-locations))))

(defn- fix-type
  "Fix type of params to make it more understandable to Rapidoc."
  [{:keys [schema] :as param}]
  ;; TODO: figure out how to teach rapidoc `[:or [:enum "all"] nat-int?]`
  (cond
    (and (:oneOf schema)
         (= (second (:oneOf schema)) {:type "null"}))
    (recur
     (assoc param :required false :schema (first (:oneOf schema))))

    (= (:enum schema) ["true" "false" true false])
    (assoc param :schema {:type "boolean"})

    :else
    param))

(defn- path->openapi [path]
  (str/replace path #":([^/]+)" "{$1}"))

;;; OpenAPI generation

(defn- collect-routes
  "Collect routes with schemas with their full paths."
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

(defn- schema->params
  "https://spec.openapis.org/oas/latest.html#parameter-object"
  [method full-path schema]
  (let [{:keys [properties required]} (json-schema-transform schema)
        required                      (set required)
        in-path?                      (set (map (comp keyword second) (re-seq #"\{([^}]+)\}" full-path)))]
    (for [[k schema] properties
          :when      (or (in-path? k) (= method :get))]
      (fix-type
       (cond-> {:in          (if (in-path? k) :path :query)
                :name        k
                :required    (contains? required k)
                :schema      (dissoc schema :description)}
         (:description schema) (assoc :description (:description schema)))))))

(defn- defendpoint->path-item
  "Generate OpenAPI desc for a single handler

  https://spec.openapis.org/oas/latest.html#path-item-object"
  [tag full-path handler-var]
  (let [{:keys [method] :as data} (meta handler-var)
        params                    (schema->params method full-path (:schema data))
        non-body-param?           (set (map :name params))
        body                      (when (not= method :get)
                                    (into [:map] (remove #(non-body-param? (first %)) (rest (:schema data)))))
        ctype                     (if (:multipart (meta handler-var))
                                    "multipart/form-data"
                                    "application/json")]
    ;; summary is the string in the sidebar of rapidoc
    {method (cond-> {:summary     (str (u/upper-case-en (name method)) " " full-path)
                     :description (or (:orig-doc data)
                                      (:doc data))
                     :parameters params}
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
                          [path (defendpoint->path-item tag path route)]))]
      {:paths      paths
       :components {:schemas @*definitions*}})))

(comment
  ;; See what is the result of generation, could be helpful debugging what's wrong with display in rapidoc
  ;; `resolve` is to appease clj-kondo which will complain for #'
  (defendpoint->path-item nil "/path" (resolve 'metabase.api.collection/GET_:id_items)))
