(ns metabase.api.macros.defendpoint.tools-manifest
  "Generate a tools manifest (JSON Schema 2020-12) from `defendpoint` endpoints annotated with `:tool` metadata.

  Parallel to [[metabase.api.macros.defendpoint.open-api]] — same endpoint data, different output format.

  The manifest describes MCP-compatible tools for LLM/agent consumers. Each tool has:
  - `name`, `description` — tool identity
  - `endpoint` — HTTP method + path
  - `inputSchema` — merged route + query + body parameters
  - `responseSchema` — from the endpoint's response schema
  - `annotations` — MCP ToolAnnotations (readOnlyHint, destructiveHint, etc.)"
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.json-schema :as mjs]
   [metabase.api.macros :as api.macros]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn- prefer-tool-descriptions
  "Pre-process a malli schema so that `:tool/description` takes precedence over `:description`
  before JSON Schema generation, since `mjs/transform` only reads `:description`."
  [schema]
  (mc/walk
   schema
   (fn [node _path children _options]
     (let [props     (mc/properties node)
           tool-desc (:tool/description props)
           props     (cond-> props
                       tool-desc (-> (assoc :description tool-desc)
                                     (dissoc :tool/description)))]
       (if (or tool-desc (seq children))
         (mc/into-schema (mc/type node) props children (mc/options node))
         node)))))

(def ^:private sanitize-replacements
  {"~1" "_SLASH_"
   "!"  "_BANG_"
   "="  "_EQ_"
   "<"  "_LT_"
   ">"  "_GT_"
   "*"  "_STAR_"
   "+"  "_PLUS_"
   "/"  "_SLASH_"})

(def ^:private sanitize-pattern
  (re-pattern (str/join "|" (map #(java.util.regex.Pattern/quote %) (keys sanitize-replacements)))))

(defn- sanitize-def-name
  "Sanitize a definition name for use in JSON Schema `$defs`."
  [s]
  (str/replace s sanitize-pattern sanitize-replacements))

(defn- sanitize-ref [ref-str]
  (str/replace ref-str #"#/\$defs/(.+)"
               (fn [[_ def-name]]
                 (str "#/$defs/" (sanitize-def-name def-name)))))

(defn- walk-sanitize-refs
  "Recursively walk a JSON Schema structure (maps and vectors) and apply [[sanitize-ref]]
  to every `:$ref` value. This ensures nested `$ref`s inside `oneOf`, `anyOf`, definitions, etc.
  are properly sanitized."
  [schema]
  (cond
    (map? schema)    (into {} (map (fn [[k v]]
                                     (if (= k :$ref)
                                       [k (sanitize-ref v)]
                                       [k (walk-sanitize-refs v)])))
                           schema)
    (vector? schema) (mapv walk-sanitize-refs schema)
    :else            schema))

(defn malli->json-schema
  "Transform a malli schema to JSON Schema, collecting any `$defs` into `definitions-acc`.
  Returns the JSON Schema with `$ref` values sanitized and `:definitions` stripped."
  [definitions-acc malli-schema]
  (let [jss  (mjs/transform (prefer-tool-descriptions malli-schema)
                            {::mjs/definitions-path "#/$defs/"})
        defs (:definitions jss)]
    (when (seq defs)
      (swap! definitions-acc
             into
             (map (fn [[k v]] [(sanitize-def-name k) (walk-sanitize-refs v)]))
             defs))
    (walk-sanitize-refs (dissoc jss :definitions))))

(def ^:private annotation-key-mapping
  {:read-only?   :readOnlyHint
   :destructive? :destructiveHint
   :idempotent?  :idempotentHint
   :open-world?  :openWorldHint})

(defn- method-default-annotations
  "Infer default MCP ToolAnnotations from HTTP method."
  [method]
  (case method
    (:get :head) {:readOnlyHint   true
                  :idempotentHint true}
    :put         {:destructiveHint false
                  :idempotentHint  true}
    :delete      {:destructiveHint true
                  :idempotentHint  true}
    {}))

(defn infer-annotations
  "Build MCP ToolAnnotations from HTTP method defaults merged with explicit `:annotations` from `:tool` metadata."
  [method explicit-annotations]
  (let [defaults (method-default-annotations method)
        explicit (into {}
                       (keep (fn [[k v]]
                               (when-let [mcp-key (annotation-key-mapping k)]
                                 [mcp-key v])))
                       explicit-annotations)]
    (merge defaults explicit)))

(defn- schema->properties-and-required
  "Extract `:properties` and `:required` from a malli schema's JSON Schema.
  Returns nil if the schema is nil or doesn't have `:properties` (e.g., `:or`/`:oneOf`)."
  [defs malli-schema]
  (when malli-schema
    (let [jss (malli->json-schema defs malli-schema)]
      (when (:properties jss)
        (select-keys jss [:properties :required])))))

(defn- merge-input-schemas
  "Merge route, query, and body param schemas into a single inputSchema object.
  Route params are always required. For body schemas that aren't simple maps (e.g. `:or`),
  the full JSON Schema is used directly. If route/query/body share a property name,
  later sources (body > query > route) take precedence."
  [defs form]
  (let [route-parts (schema->properties-and-required defs (get-in form [:params :route :schema]))
        query-parts (schema->properties-and-required defs (get-in form [:params :query :schema]))
        body-schema (get-in form [:params :body :schema])
        body-parts  (schema->properties-and-required defs body-schema)
        ;; If the body schema doesn't yield properties (e.g. :or), use its full JSON Schema
        body-full   (when (and body-schema (nil? body-parts))
                      (malli->json-schema defs body-schema))
        all-props   (merge (:properties route-parts)
                           (:properties query-parts)
                           (:properties body-parts))
        all-req     (into [] (comp cat (distinct))
                          [(:required route-parts)
                           (:required query-parts)
                           (:required body-parts)])]
    (cond
      (and body-full (empty? all-props)) body-full
      (seq all-props)                    (cond-> {:type "object" :properties all-props}
                                           (seq all-req) (assoc :required all-req)))))

(defn- response-schema->json-schema
  "Convert an endpoint's response schema to JSON Schema for the tools manifest."
  [defs response-schema]
  (when response-schema
    (let [resolved (mr/resolve-schema response-schema)
          content  (or (-> resolved mc/properties :openapi/response-schema)
                       response-schema)]
      (malli->json-schema defs content))))

(defn- route-path->endpoint-path
  "Convert Clout-style route path (`:id`) to curly-brace path (`{id}`)."
  [path]
  (str/replace path #":([^/]+)" "{$1}"))

(defn endpoint->tool-definition
  "Convert a single endpoint info + prefix to a tool definition map."
  [defs prefix {:keys [form]}]
  (let [method       (:method form)
        route-path   (get-in form [:route :path])
        tool-md      (get-in form [:metadata :tool])
        tool-name    (:name tool-md)
        _            (assert (string? tool-name) "Tool :name must be a string")
        description  (or (:description tool-md)
                         (:docstr form))
        full-path    (str prefix (route-path->endpoint-path route-path))
        input-schema (merge-input-schemas defs form)
        resp-schema  (response-schema->json-schema defs (:response-schema form))
        annotations  (infer-annotations method (:annotations tool-md))
        task-support (:task-support tool-md)]
    (cond-> {:name        tool-name
             :description description
             :endpoint    {:method (u/upper-case-en (name method))
                           :path   full-path}}
      input-schema      (assoc :inputSchema input-schema)
      resp-schema       (assoc :responseSchema resp-schema)
      (seq annotations) (assoc :annotations annotations)
      task-support      (assoc :execution {:taskSupport (name task-support)}))))

(defn check-tool-uniqueness
  "Throws if `tools` contains duplicate `:name` values. The exception message lists each
  conflicting name and the endpoints that share it."
  [tools]
  (let [dupes (into (sorted-map)
                    (comp (filter (fn [[_ entries]] (< 1 (count entries))))
                          (map (fn [[tool-name entries]] [tool-name (mapv :endpoint entries)])))
                    (group-by :name tools))]
    (when (seq dupes)
      (throw (ex-info (str "Duplicate tool names detected: "
                           (str/join ", " (map (fn [[tool-name endpoints]]
                                                 (str tool-name " -> " (pr-str endpoints)))
                                               dupes)))
                      {:duplicates dupes})))))

(defn generate-tools-manifest
  "Generate a tools manifest from all `:tool`-annotated endpoints.

  `namespace-prefixes` is a map of `{ns-symbol \"/api/agent\"}` — each namespace symbol maps
  to the URL prefix its endpoints are served under."
  [namespace-prefixes]
  (let [defs  (atom (sorted-map))
        tools (into []
                    (mapcat (fn [[ns-sym prefix]]
                              (for [[_k endpoint] (api.macros/ns-routes ns-sym)
                                    :when (get-in endpoint [:form :metadata :tool])]
                                (endpoint->tool-definition defs prefix endpoint))))
                    namespace-prefixes)]
    (check-tool-uniqueness tools)
    (cond-> {:$schema "https://json-schema.org/draft/2020-12/schema"
             :version "1.0.0"
             :tools   (sort-by :name tools)}
      (seq @defs) (assoc :$defs @defs))))
