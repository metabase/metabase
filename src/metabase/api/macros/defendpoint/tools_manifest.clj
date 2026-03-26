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
   [malli.util :as mut]
   [metabase.api.macros :as api.macros]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn- inline-malli-refs
  "Walk a malli schema, replacing all registered-schema refs with their dereferenced content.
   This ensures `mjs/transform` never sees refs and thus never generates `$ref` or `$defs`.
   Malli's `::mc/walked-refs` tracking prevents infinite recursion on cyclic schemas —
   when a cycle is detected, the walker receives the raw ref name (a string) instead of a
   walked schema, and we fall back to `:any`."
  [schema]
  (mc/walk
   schema
   (fn [node _path children _options]
     (if (mc/-ref-schema? node)
       (let [child (first children)]
         (if (mc/schema? child)
           child
           (mc/schema :any)))
       (mc/into-schema (mc/type node) (mc/properties node) children (mc/options node))))
   {::mc/walk-refs true ::mc/walk-schema-refs true}))

(defn- maybe-optional-keys
  "Apply `mut/optional-keys` if the schema is map-like (has entries after deref).
   Non-map schemas (e.g. `:enum`, `:string`) are returned unchanged."
  [schema]
  (if (mc/-entry-schema? (mc/deref-all schema))
    (mut/optional-keys schema)
    schema))

(defn- flatten-root-schema
  "Iteratively simplify the root of a malli schema until it is a `:map`.
   Only the outermost composite schemas are flattened — nested `anyOf`/`allOf` are preserved
   since LLM clients handle them fine within properties.

   - `:and`   → `:merge` then deref (flattens the `[:map ...] [:map {:encode/...}]` pattern)
   - `:or`    → `:union` with all entries optional, then deref (merges branches, no required)
   - `:multi` → same as `:or` but extracts schemas from `[dispatch-key props schema]` triples

   Returns the schema unchanged if it is already a `:map` or cannot be simplified."
  [schema]
  (loop [s schema
         fuel 10]
    (if (or (= :map (mc/type s)) (zero? fuel))
      s
      (recur
       (case (mc/type s)
         :and
         (mc/deref (mc/into-schema :merge (mc/properties s) (mc/children s) (mc/options s)))

         :or
         (mc/deref (mc/into-schema :union (mc/properties s)
                                   (mapv (comp maybe-optional-keys flatten-root-schema)
                                         (mc/children s))
                                   (mc/options s)))

         :multi
         (mc/deref (mc/into-schema :union (dissoc (mc/properties s) :dispatch)
                                   (mapv (fn [[_k _props schema]]
                                           (maybe-optional-keys (flatten-root-schema schema)))
                                         (mc/children s))
                                   (mc/options s)))

         ;; For any other type (e.g. :schema wrapper), try deref
         (mc/deref s))
       (dec fuel)))))

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

(defn malli->json-schema
  "Transform a malli schema to JSON Schema with all refs inlined (no `$ref` or `$defs`).
   Inlines registered-schema refs, flattens root-level composite schemas (`:or`, `:and`,
   `:multi`) into a single `:map`, applies tool-description preferences, then transforms
   to JSON Schema. Nested `anyOf`/`allOf` within properties are preserved."
  [malli-schema]
  (let [prepared (-> malli-schema inline-malli-refs flatten-root-schema prefer-tool-descriptions)]
    (mjs/transform prepared)))

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
  [malli-schema]
  (when malli-schema
    (let [jss (malli->json-schema malli-schema)]
      (when (:properties jss)
        (select-keys jss [:properties :required])))))

(defn- merge-input-schemas
  "Merge route, query, and body param schemas into a single inputSchema object.
  Route params are always required. For body schemas that aren't simple maps (e.g. `:or`),
  the full JSON Schema is used directly. If route/query/body share a property name,
  later sources (body > query > route) take precedence."
  [form]
  (let [route-parts (schema->properties-and-required (get-in form [:params :route :schema]))
        query-parts (schema->properties-and-required (get-in form [:params :query :schema]))
        body-schema (get-in form [:params :body :schema])
        body-parts  (schema->properties-and-required body-schema)
        ;; If the body schema doesn't yield properties (e.g. :or), use its full JSON Schema
        body-full   (when (and body-schema (nil? body-parts))
                      (malli->json-schema body-schema))
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
  [response-schema]
  (when response-schema
    (let [resolved (mr/resolve-schema response-schema)
          content  (or (-> resolved mc/properties :openapi/response-schema)
                       response-schema)]
      (malli->json-schema content))))

(defn- route-path->endpoint-path
  "Convert Clout-style route path (`:id`) to curly-brace path (`{id}`)."
  [path]
  (str/replace path #":([^/]+)" "{$1}"))

(defn endpoint->tool-definition
  "Convert a single endpoint info + prefix to a tool definition map."
  [prefix {:keys [form]}]
  (let [method       (:method form)
        route-path   (get-in form [:route :path])
        tool-md      (get-in form [:metadata :tool])
        tool-name    (:name tool-md)
        _            (assert (string? tool-name) "Tool :name must be a string")
        description  (or (:description tool-md)
                         (:docstr form))
        full-path    (str prefix (route-path->endpoint-path route-path))
        input-schema (merge-input-schemas form)
        resp-schema  (response-schema->json-schema (:response-schema form))
        annotations  (infer-annotations method (:annotations tool-md))
        task-support (:task-support tool-md)
        scope        (get-in form [:metadata :scope])]
    (cond-> {:name        tool-name
             :description description
             :endpoint    {:method (u/upper-case-en (name method))
                           :path   full-path}}
      input-schema      (assoc :inputSchema input-schema)
      resp-schema       (assoc :responseSchema resp-schema)
      (seq annotations) (assoc :annotations annotations)
      task-support      (assoc :execution {:taskSupport (name task-support)})
      (string? scope)   (assoc :scope scope))))

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
  to the URL prefix its endpoints are served under.

  All malli registered-schema refs are inlined before JSON Schema generation, so tool schemas
  never contain `$ref` or `$defs`. Root-level `anyOf` (from malli `:or` body schemas) is
  flattened into a single merged object for LLM client compatibility."
  [namespace-prefixes]
  (let [tools (into []
                    (mapcat (fn [[ns-sym prefix]]
                              (for [[_k endpoint] (api.macros/ns-routes ns-sym)
                                    :when (get-in endpoint [:form :metadata :tool])]
                                (endpoint->tool-definition prefix endpoint))))
                    namespace-prefixes)]
    (check-tool-uniqueness tools)
    {:$schema "https://json-schema.org/draft/2020-12/schema"
     :version "1.0.0"
     :tools   (sort-by :name tools)}))
