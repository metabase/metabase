(ns metabase.api.common.openapi
  "Generate OpenAPI schema for defendpoint routes"
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [malli.core :as mc]
   [malli.json-schema :as mjs]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms])
  (:import [clojure.lang PersistentVector]))

(set! *warn-on-reflection* true)

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
  "Change type of params to make it more understandable to Rapidoc."
  [{:keys [schema] :as param}]
  ;; TODO: figure out how to teach rapidoc `[:or [:enum "all"] nat-int?]`
  (cond
    (and (:oneOf schema)
         (= (second (:oneOf schema)) {:type "null"}))
    (let [real-schema (merge (first (:oneOf schema))
                             (select-keys schema [:description :default]))]
      (recur
       (assoc param :required false :schema real-schema)))

    (= (:enum schema) (mc/children ms/BooleanValue))
    (assoc param :schema (-> (dissoc schema :enum) (assoc :type "boolean")))

    (= (:enum schema) (mc/children ms/MaybeBooleanValue))
    (assoc param
           :schema (-> (dissoc schema :enum) (assoc :type "boolean"))
           :required false)

    :else
    param))

(let [file-schema (json-schema-transform ms/File)]
  ;; TODO: unify this with `fix-type` somehow, but `:required` is making this hard
  (defn- fix-schema
    "Change type of request body to make it more understandable to Rapidoc."
    [{:keys [required] :as schema}]
    (let [not-required (atom #{})]
      (-> schema
          (update :properties (fn [props]
                                (into {}
                                      (for [[k v] props]
                                        [k
                                         (cond
                                           (and (:oneOf v)
                                                (= (second (:oneOf v)) {:type "null"}))
                                           (do
                                             (swap! not-required conj k)
                                             (merge (first (:oneOf v))
                                                    (select-keys v [:description :default])))

                                           (= (select-keys v (keys file-schema)) file-schema)
                                           ;; I got this from StackOverflow and docs are not in agreement, but RapiDoc
                                           ;; shows file input, so... :)
                                           (merge {:type "string" :format "binary"}
                                                  (select-keys v [:description :default]))

                                           (= (:enum v) ["true" "false" true false])
                                           (-> (dissoc v :enum) (assoc :type "boolean"))

                                           :else
                                           v)]))))
          (assoc :required (vec (remove @not-required required)))))))

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
                                              ;; {c :count :keys [a b}} ; => [count a b]
                                              (flatten (vals qp))))))
          (symbol? x) (recur (next args)
                             (conj params x)))))))

(defn- compojure-renames
  "Find out everything that's renamed in Compojure routes"
  [args]
  (let [idx (inc (.indexOf ^PersistentVector args :as))]
    (when (pos? idx)
      (let [req-bindings (get args idx)
            renames      (->> (keys req-bindings) ; {{c :count} :query-params} ; => [{c :count}]
                              (filter map?)       ; no stuff like {:keys [a]}
                              (apply merge))]
        (update-keys renames keyword)))))

(defn- schema->params
  "https://spec.openapis.org/oas/latest.html#parameter-object"
  [full-path args schema]
  (let [{:keys [properties required]} (json-schema-transform schema)
        required                      (set required)
        in-path?                      (set (map (comp keyword second) (re-seq #"\{([^}]+)\}" full-path)))
        in-query?                     (set (compojure-query-params args))
        renames                       (compojure-renames args)]
    (for [[k param-schema] properties
          :let             [k (get renames k k)]
          :when            (or (in-path? k) (in-query? k))]
      (fix-type
       (cond-> {:in          (if (in-path? k) :path :query)
                :name        k
                :required    (contains? required k)
                :schema      (dissoc param-schema :description)}
         (:description param-schema) (assoc :description (:description param-schema)))))))

(defn- defendpoint->path-item
  "Generate OpenAPI desc for a single handler

  https://spec.openapis.org/oas/latest.html#path-item-object"
  [tag full-path handler-var]
  (let [{:keys [method] :as data} (meta handler-var)
        params                    (schema->params full-path (:args data) (:schema data))
        non-body-param?           (set (map :name params))
        body-params               (when (not= method :get)
                                    (remove #(non-body-param? (first %)) (rest (:schema data))))
        body-schema               (when (seq body-params)
                                    (fix-schema
                                     (json-schema-transform (into [:map] body-params))))
        ctype                     (if (:multipart (meta handler-var))
                                    "multipart/form-data"
                                    "application/json")]
    ;; summary is the string in the sidebar of rapidoc
    {method (cond-> {:summary     (str (u/upper-case-en (name method)) " " full-path)
                     :description (or (:orig-doc data)
                                      (:doc data))
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
                        (for [{:keys [path tag route]} (collect-routes root)]
                          (try
                            [path (defendpoint->path-item tag path route)]
                            (catch Exception e
                              (throw (ex-info (str "Exception at " path) {} e))))))]
      {:paths      paths
       :components {:schemas @*definitions*}})))

(comment
  ;; See what is the result of generation, could be helpful debugging what's wrong with display in rapidoc
  ;; `resolve` is to appease clj-kondo which will complain for #'
  (defendpoint->path-item nil "/path" (resolve 'metabase-enterprise.serialization.api/POST_export)))
