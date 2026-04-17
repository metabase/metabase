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

(defn- collect-root-maps
  "Walk the root of a malli schema tree using a worklist, collecting leaf `:map` schemas.
   Composite nodes (`:and`, `:or`, `:multi`) are expanded and their children enqueued.
   Other non-map nodes (e.g. `:schema` wrappers) are deref'd and re-enqueued.

   Returns a vector of `{:schema <map-schema> :optional? <bool>}` where `:optional?` is true
   when the schema was reached through an `:or` or `:multi` branch (meaning all its keys
   should become optional in the merged result).

   Tracks already-deref'd schemas to detect cycles — composite types (`:and`, `:or`, `:multi`)
   and `:map` always terminate, so only the deref fallback path needs cycle detection.

   Only the outermost composite schemas are consumed — nested `anyOf`/`allOf` within `:map`
   properties are preserved since LLM clients handle them fine."
  [schema]
  (loop [worklist [{:schema schema :optional? false}]
         results  []
         seen     #{}]
    (if (empty? worklist)
      results
      (let [{:keys [schema optional?]} (first worklist)
            remaining                   (subvec worklist 1)]
        (case (mc/type schema)
          :map
          (recur remaining (conj results {:schema schema :optional? optional?}) seen)

          :and
          (recur (into remaining
                       (mapv (fn [child] {:schema child :optional? optional?})
                             (mc/children schema)))
                 results seen)

          :or
          (recur (into remaining
                       (mapv (fn [child] {:schema child :optional? true})
                             (mc/children schema)))
                 results seen)

          :multi
          (recur (into remaining
                       (mapv (fn [[_k _props child]] {:schema child :optional? true})
                             (mc/children schema)))
                 results seen)

          ;; For other types (e.g. :schema wrapper), try deref and re-enqueue.
          ;; Track by identity to detect cycles (e.g. recursive schema refs).
          (let [derefed (mc/deref schema)]
            (cond
              ;; Cycle detected: emit an empty :map as a safe fallback (-> {"type":"object"}).
              ;; In practice inline-malli-refs already breaks cycles via :any, so this is a safety net.
              (contains? seen schema)
              (recur remaining
                     (conj results {:schema (mc/schema [:map]) :optional? optional?})
                     seen)

              ;; Deref made progress: re-enqueue the dereferenced schema.
              (not (identical? derefed schema))
              (recur (conj remaining {:schema derefed :optional? optional?})
                     results (conj seen schema))

              ;; Can't simplify (non-map leaf like :enum): keep as-is.
              :else
              (recur remaining (conj results {:schema schema :optional? optional?}) seen))))))))

(defn- flatten-root-schema
  "Flatten the root of a malli schema into a single `:map` for MCP inputSchema compatibility.
   Only the outermost composite schemas (`:and`, `:or`, `:multi`) are consumed — nested
   `anyOf`/`allOf` within `:map` properties are preserved.

   Collects all leaf `:map` schemas from the root composite tree, marks keys as optional
   when reached through `:or`/`:multi` branches, then merges everything into one `:map`.

   Returns the schema unchanged if it is already a `:map` or cannot be simplified."
  [schema]
  (let [leaves (collect-root-maps schema)]
    (case (count leaves)
      0 schema
      1 (let [{:keys [schema optional?]} (first leaves)]
          (cond-> schema
            (and optional? (mc/-entry-schema? (mc/deref-all schema))) mut/optional-keys))
      ;; Multiple leaves: merge via :union with optional-keys where needed
      (mc/deref
       (mc/into-schema :union nil
                       (mapv (fn [{:keys [schema optional?]}]
                               (cond-> schema
                                 (and optional? (mc/-entry-schema? (mc/deref-all schema)))
                                 mut/optional-keys))
                             leaves)
                       (mc/options schema))))))

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
  (let [method        (:method form)
        route-path    (get-in form [:route :path])
        tool-md       (get-in form [:metadata :tool])
        tool-name     (:name tool-md)
        _             (assert (string? tool-name) "Tool :name must be a string")
        description   (or (:description tool-md)
                          (:docstr form))
        full-path     (str prefix (route-path->endpoint-path route-path))
        input-schema  (merge-input-schemas form)
        resp-schema   (response-schema->json-schema (:response-schema form))
        annotations   (infer-annotations method (:annotations tool-md))
        task-support  (:task-support tool-md)
        scope         (get-in form [:metadata :scope])
        body-schema   (get-in form [:params :body :schema])
        ;; Opt-out for tools that want raw schema errors to reach the client unchanged —
        ;; e.g. tools whose argument coercion would mask useful validation feedback.
        strict-input? (:strict-input-shape? tool-md)]
    (cond-> {:name        tool-name
             :description description
             :endpoint    {:method (u/upper-case-en (name method))
                           :path   full-path}}
      input-schema      (assoc :inputSchema input-schema)
      resp-schema       (assoc :responseSchema resp-schema)
      (seq annotations) (assoc :annotations annotations)
      task-support      (assoc :execution {:taskSupport (name task-support)})
      (string? scope)   (assoc :scope scope)
      body-schema       (assoc :body-schema body-schema)
      strict-input?     (assoc :strict-input-shape? true))))

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
