(ns metabase.api.macros.defendpoint.mcp-tools
  "MCP tool manifest generation from [[metabase.api.macros/defendpoint]] metadata.

  Generates MCP-compatible tool definitions from endpoints annotated with `:tool` metadata,
  converting Malli schemas to JSON Schema and inferring tool names and annotations from
  HTTP method and route."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [malli.core :as mc]
   [malli.json-schema :as mjs]
   [malli.util :as mut]
   [metabase.api.macros :as api.macros]
   [metabase.api.macros.defendpoint.open-api :as open-api]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]))

(defn infer-tool-name
  "Derive an MCP tool name from HTTP method and route path.

  Strips version prefixes, removes param placeholders, converts to snake_case, and joins with `_`.
  GET endpoints get a `get_` prefix; PUT/PATCH get `update_`; DELETE gets `delete_`.
  POST endpoints derive verbs from the path itself."
  [method route-path]
  (let [segments (-> route-path
                     (str/replace #"^/v\d+/" "")
                     (str/split #"/")
                     (->> (remove #(or (str/blank? %) (str/starts-with? % ":")))))]
    (-> (case method
          :get             (str "get_" (str/join "_" segments))
          (:put :patch)    (str "update_" (str/join "_" segments))
          :delete          (str "delete_" (str/join "_" segments))
          (str/join "_" segments))
        (str/replace "-" "_"))))

(def ^:private annotation-key-renames
  {:read-only?   :readOnlyHint
   :idempotent?  :idempotentHint
   :destructive? :destructiveHint
   :open-world?  :openWorldHint})

(defn infer-annotations
  "Map HTTP method to MCP ToolAnnotations, then merge explicit overrides from `:tool` metadata.

  Keyword keys in the overrides (`:read-only?`, `:idempotent?`, `:destructive?`, `:open-world?`)
  are translated to their MCP camelCase equivalents."
  [method tool-metadata]
  (let [defaults  (case method
                    :get    {:readOnlyHint true, :idempotentHint true}
                    :delete {:destructiveHint true}
                    {:readOnlyHint false})
        overrides (when (map? tool-metadata)
                    (:annotations tool-metadata))]
    (merge defaults
           (when overrides
             (set/rename-keys overrides annotation-key-renames)))))

(defn- inline-refs
  "Walk a JSON Schema and inline all `$ref` references using the provided definitions map.
  Produces a self-contained schema with no `$ref` pointers."
  [schema definitions]
  (walk/postwalk
   (fn [node]
     (if-let [ref (:$ref node)]
       (let [ref-name (last (str/split ref #"/"))]
         (if-let [resolved (get definitions ref-name)]
           (inline-refs (merge (dissoc node :$ref) resolved) definitions)
           node))
       node))
   schema))

(defn- prefer-tool-descriptions
  "Walk schema properties and prefer `:tool/description` over `:description`."
  [schema malli-schema]
  (if-not (:properties schema)
    schema
    (let [tool-descs (try
                       (into {}
                             (keep (fn [child]
                                     (when (vector? child)
                                       (when-let [desc (:tool/description (second child))]
                                         [(u/qualified-name (first child)) desc]))))
                             (mc/children (mr/resolve-schema malli-schema)))
                       (catch Exception e
                         (log/warn e "Error extracting :tool/description from schema")
                         nil))]
      (if (seq tool-descs)
        (update schema :properties
                (fn [props]
                  (into {}
                        (map (fn [[k v]]
                               (if-let [desc (get tool-descs k)]
                                 [k (assoc v :description desc)]
                                 [k v])))
                        props)))
        schema))))

(defn- malli->json-schema-inline
  "Transform a Malli schema to a self-contained JSON Schema (no `$ref`).
  Uses `mjs/transform` then inlines all definitions."
  [malli-schema]
  (let [jss         (mjs/transform malli-schema)
        definitions (:definitions jss)
        base        (dissoc jss :definitions)]
    (if definitions
      (inline-refs base definitions)
      base)))

(defn build-input-schema
  "Merge route, query, and body param Malli schemas into a single JSON Schema object.
  Prefers `:tool/description` over `:description` on schema properties."
  [form]
  (let [route-schema (get-in form [:params :route :schema])
        query-schema (get-in form [:params :query :schema])
        body-schema  (get-in form [:params :body :schema])
        schemas      (remove nil? [route-schema query-schema body-schema])]
    (when (seq schemas)
      (let [merged (if (= (count schemas) 1)
                     (first schemas)
                     (reduce mut/merge (first schemas) (rest schemas)))
            jss    (-> (malli->json-schema-inline merged)
                       (open-api/fix-json-schema))]
        (-> jss
            (dissoc :optional)
            (prefer-tool-descriptions merged))))))

(defn build-output-schema
  "Build a JSON Schema for the endpoint response.
  Handles `streaming-response-schema` via `:openapi/response-schema`."
  [form]
  (when-let [schema (:response-schema form)]
    (let [resolved       (mr/resolve-schema schema)
          content-schema (or (some-> resolved mc/properties :openapi/response-schema)
                             schema)]
      (-> (malli->json-schema-inline content-schema)
          (open-api/fix-json-schema)
          (dissoc :optional)))))

(defn- classify-params
  "Classify parameter names into route-params, query-params, and body-params."
  [form]
  (let [route-keys (some-> (get-in form [:params :route :schema])
                           mr/resolve-schema mc/children
                           (->> (map first) set))
        query-keys (some-> (get-in form [:params :query :schema])
                           mr/resolve-schema mc/children
                           (->> (map first) set))]
    {:route-params (sort (mapv u/qualified-name route-keys))
     :query-params (sort (mapv u/qualified-name query-keys))
     :body-params  (boolean (get-in form [:params :body :schema]))}))

(defn- route-path->api-path
  "Convert a defendpoint route path to an API path with `{param}` placeholders."
  [prefix route-path]
  (-> (str prefix route-path)
      (str/replace #":([^/]+)" "{$1}")))

(defn endpoint->tool
  "Build a single MCP tool definition from an endpoint info map and route prefix."
  [endpoint-info prefix]
  (let [form          (:form endpoint-info)
        method        (:method form)
        route-path    (get-in form [:route :path])
        tool-metadata (get-in form [:metadata :tool])
        tool-name     (infer-tool-name method route-path)
        annotations   (infer-annotations method tool-metadata)
        input-schema  (build-input-schema form)
        output-schema (build-output-schema form)
        param-info    (classify-params form)]
    (cond-> {:name         tool-name
             :description  (or (:docstr form) "")
             :annotations  annotations
             :inputSchema  (or input-schema {:type :object})
             :endpoint     {:method       (u/upper-case-en (name method))
                            :path         (route-path->api-path prefix route-path)
                            :route-params (:route-params param-info)
                            :query-params (:query-params param-info)
                            :body-params  (:body-params param-info)}}
      output-schema (assoc :outputSchema output-schema))))

(defn- build-manifest
  "Build the MCP tool manifest for all endpoints with `:tool` metadata in the given namespace.
  This is the uncached implementation; use [[tool-manifest]] for the memoized version."
  [nmspace prefix]
  (let [endpoints (api.macros/ns-routes nmspace)]
    {:tools (->> (vals endpoints)
                 (filter #(get-in % [:form :metadata :tool]))
                 (mapv #(endpoint->tool % prefix)))}))

(def tool-manifest
  "Generate an MCP tool manifest for all endpoints with `:tool` metadata in the given namespace.
  Result is memoized since endpoints are static after namespace loading."
  (memoize build-manifest))
