(ns metabase.api.macros.defendpoint.tools-manifest
  "Malli -> JSON Schema (2020-12) conversion for MCP tool manifests.

  Parallel to [[metabase.api.macros.defendpoint.open-api]] — same schemas, different output format.
  Produces the `inputSchema`/`outputSchema` an MCP tool publishes: all registered-schema refs are
  inlined (no `$ref`/`$defs`), root-level composites are flattened to a single object, and the
  strict transform marks every property required-and-nullable for OpenAI strict-tool clients."
  (:require
   [malli.core :as mc]
   [malli.json-schema :as mjs]
   [malli.util :as mut]
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

(defn strict-tool-input-schema
  "Make an MCP inputSchema compatible with stricter LLM clients.

  MCP allows normal JSON Schema optional object properties.
  OpenAI's strict tool schema validation is narrower: every object property must be listed in `:required`.
  The Malli source already models nullability via `[:maybe ...]` (see [[assert-optional-fields-nullable!]]),
  so this only needs to widen `:required` and close the object — property types are left alone."
  [schema]
  (letfn [(strict-schema [schema]
            (let [schema (cond-> schema
                           (:properties schema) (update :properties update-vals strict-schema)
                           (:items schema)      (update :items strict-schema)
                           (:oneOf schema)      (update :oneOf #(mapv strict-schema %))
                           (:anyOf schema)      (update :anyOf #(mapv strict-schema %))
                           (:allOf schema)      (update :allOf #(mapv strict-schema %)))]
              (if (and (= "object" (:type schema)) (seq (:properties schema)))
                (assoc schema
                       :required (vec (keys (:properties schema)))
                       :additionalProperties false)
                schema)))]
    (strict-schema schema)))

(defn- nullable-malli?
  "True when `schema` accepts `nil` (e.g. `[:maybe X]`, `:any`, `:nil`)."
  [schema]
  (try (mr/validate schema nil) (catch Throwable _ false)))

(defn assert-optional-fields-nullable!
  "Throw if any optional field reachable from `malli-schema` rejects an explicit null.
   The strict-tool transform forces every property into `:required` (it does not widen property types),
   so the only way for a strict MCP client to express \"no value\" is by sending null. If the Malli source
   marks a field `:optional true` without `[:maybe ...]`, the published JSON Schema is required-and-non-
   nullable — the `:optional` marker has no observable effect and the contract drifts from what the
   schema says. The fix is at the schema definition: pair `:optional true` with `[:maybe ...]`."
  [malli-schema tool-name]
  (when malli-schema
    (mc/walk
     (mr/resolve-schema malli-schema)
     (fn [schema _path children _opts]
       (when (= :map (mc/type schema))
         (doseq [[k props value-schema] children
                 :when (and (true? (:optional props))
                            (not (nullable-malli? value-schema)))]
           (throw (ex-info (str "Tool " tool-name " input has optional non-nullable field "
                                (pr-str k) ". Mark it `[:maybe ...]` so the published JSON "
                                "Schema is nullable; otherwise `:optional` has no observable effect "
                                "under the strict-tool transform.")
                           {:tool tool-name :field k}))))
       schema))))
