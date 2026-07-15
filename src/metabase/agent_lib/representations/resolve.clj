(ns metabase.agent-lib.representations.resolve
  "Resolve a parsed (string-keyed, portable) representations query into canonical numeric-ID
  pMBQL.

  Pipeline:

    1. **keywordize** string keys on the representations query. The repair pass operates on
       string-keyed data (LLM-authored markers like `\"lib/type\"`, `\"source-table\"`,
       `\"temporal-unit\"` flow through as strings); lib-level MBQL expects keywords. We walk the
       structure once to keywordize map keys but leave string *values* — clause heads, option
       values like `\"month\"`, etc. — for [[lib.normalize]] to convert.

    2. **resolve portable FKs → numeric IDs** via `metabase.models.serialization.resolve/import-mbql`,
       bound to a metadata-provider-backed resolver. Clause heads like `\"field\"` are converted
       to `:field` keywords by `import-mbql` itself (per the `#{:field \"field\"}` match pattern),
       so by the end of this step the MBQL form has numeric ids and keywordized heads.

    3. **normalize** through `lib.normalize/normalize` against `:metabase.lib.schema/query`. This:
       * adds `:lib/uuid` to every clause;
       * keywordizes known enum values (temporal units, base-types, join strategies);
       * kebab-cases keys where applicable;
       * attaches the metadata-provider at `:lib/metadata` so the result is a \"real\" pMBQL that
         can be handed to `lib.query` / the QP directly.

  The output is a valid MBQL 5 query ready for the query processor.

  The inverse direction — final pMBQL back to portable form — is handled by [[export-query]];
  the result is a Clojure map matching the external (keyword-keyed) shape, ready for JSON
  encoding or for handing back to the LLM as the canonical MBQL 5 representation."
  (:require
   [clojure.walk :as walk]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.schema :as lib.schema]
   [metabase.models.serialization.resolve :as resolve]
   [metabase.models.serialization.resolve.mp :as resolve.mp]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; ============================================================
;;; Step 1 - keywordize map keys
;;; ============================================================

(defn- keywordize-keys*
  "Recursively convert string map keys to keywords. Preserves string *values* (e.g. clause heads,
  temporal-unit strings, enum-valued option values) - those are handled by `import-mbql` /
  `lib.normalize` downstream.

  Special-cases: leaves table-FK and field-FK path vectors alone (vector-of-strings doesn't get\n  recursed into beyond the normal `vector? → mapv` walk, which is a no-op on strings)."
  [x]
  (cond
    (map? x)        (persistent!
                     (reduce-kv (fn [acc k v]
                                  (assoc! acc
                                          (cond-> k (string? k) keyword)
                                          (keywordize-keys* v)))
                                (transient {})
                                x))
    (vector? x)     (mapv keywordize-keys* x)
    (sequential? x) (mapv keywordize-keys* x)
    :else           x))

(defn keywordize-query
  "Turn the portable string-keyed representations form into a keyword-keyed map suitable for
  `import-mbql` / `lib.normalize`."
  [parsed-repr]
  (keywordize-keys* parsed-repr))

;;; ============================================================
;;; Step 2+3 - resolve FKs and normalize
;;; ============================================================

(defn- annotate-field-types
  "Walk a normalized pMBQL query and stamp `:base-type` / `:effective-type` on every
  `[:field opts field-id]` clause whose integer `field-id` is known to `metadata-provider`
  but whose `opts` map is missing `:base-type`.

  `lib.normalize` does not inject type info from the metadata provider — it performs only
  structural normalization. This pass fills the gap so the returned query is fully annotated
  and safe for the QP, `lib/returned-columns`, and downstream chart construction.

  Idempotent: clauses that already carry `:base-type` are left unchanged."
  [pmbql-query metadata-provider]
  (walk/postwalk
   (fn [node]
     (if (and (vector? node)
              (= :field (nth node 0 nil))
              (map? (nth node 1 nil))
              (pos-int? (nth node 2 nil))
              (not (contains? (nth node 1) :base-type)))
       (let [field (lib.metadata.protocols/field metadata-provider (nth node 2))]
         (if (:base-type field)
           (update node 1 (fn [opts]
                            (cond-> (assoc opts :base-type (:base-type field))
                              (:effective-type field)
                              (assoc :effective-type (:effective-type field)))))
           node))
       node))
   pmbql-query))

(defn resolve-query
  "Convert a parsed (string-keyed, portable) representations query into a canonical, numeric-ID,
  `:lib/uuid`-stamped MBQL 5 query attached to `metadata-provider`.

  The optional `content-store` is used for Metabase-content lookups (source cards, metrics,
  etc.). Agent-facing callers should pass a permission-aware store; the 2-arity form keeps the
  default app-DB-backed resolver for non-HTTP/test callers.

  Throws with informative ex-info on missing / ambiguous FK lookups (via the resolver) or on
  lib.schema normalization failures."
  ([metadata-provider parsed-repr]
   (resolve-query metadata-provider parsed-repr resolve.mp/unchecked-app-db-content-store))
  ([metadata-provider parsed-repr content-store]
   (let [kw-form  (keywordize-query parsed-repr)
         resolver (resolve.mp/import-resolver metadata-provider content-store)
         resolved (resolve/import-mbql resolver kw-form)
         with-mp  (assoc resolved :lib/metadata metadata-provider)]
     (-> (lib.normalize/normalize ::lib.schema/query with-mp)
         (annotate-field-types metadata-provider)))))

;;; ============================================================
;;; Export final pMBQL back to portable representations
;;; ============================================================

(defn- keyword->repr-string
  "Stringify a keyword preserving its namespace, e.g. `:lib/type` → `\"lib/type\"`."
  [k]
  (if-let [ns (namespace k)]
    (str ns "/" (name k))
    (name k)))

(defn- portable-repr-form
  "Convert the keyworded portable form returned by serdes export into the LLM-facing
  representations form: string keys, string clause heads / enum values, no internal metadata
  provider handle."
  [x]
  (cond
    (map? x)
    (reduce-kv
     (fn [m k v]
       (if (= k :lib/metadata)
         m
         (assoc m
                (cond-> k (keyword? k) keyword->repr-string)
                (portable-repr-form v))))
     (empty x)
     x)

    (vector? x)     (mapv portable-repr-form x)
    (sequential? x) (mapv portable-repr-form x)
    (keyword? x)    (keyword->repr-string x)
    :else           x))

(defn export-query
  "Convert a final normalized numeric-ID pMBQL query back to portable representations data.

  This is the inverse of [[resolve-query]] for the agent/tool output path: table/field/card IDs
  are exported to portable FK paths / entity_ids, lib's normalized keyworded form is converted
  back to the string-keyed portable representation, and internal `:lib/metadata` is dropped.

  The optional `content-store` is used for Metabase-content lookups (Card / Measure / Segment
  by id) on the export side. Agent-facing callers should pass a permission-aware store —
  typically `metabase.metabot.tools.shared.content-store/default-store` — so that
  entity_ids of referenced cards / measures / segments do not leak through the export to a
  user who can't read them. The 2-arity form keeps the default app-DB-backed unchecked
  resolver for non-HTTP / test callers."
  ([metadata-provider pmbql-query]
   (export-query metadata-provider pmbql-query resolve.mp/unchecked-app-db-content-store))
  ([metadata-provider pmbql-query content-store]
   (let [resolver (resolve.mp/export-resolver metadata-provider content-store)]
     (->> pmbql-query
          (resolve/export-mbql resolver)
          portable-repr-form))))

(defn try-export-query
  "Best-effort wrapper around [[export-query]] that returns `nil` instead of throwing when the
  export pipeline fails or `pmbql-query` is nil/blank. Used in LLM context-building paths where
  an unusual or partially-broken existing `dataset_query` should gracefully drop out of the
  payload rather than break the whole tool response.

  Like [[export-query]], the 3-arity form accepts an explicit `content-store`; agent callers
  pass `metabase.metabot.tools.shared.content-store/default-store` for read-checking."
  ([metadata-provider pmbql-query]
   (try-export-query metadata-provider pmbql-query resolve.mp/unchecked-app-db-content-store))
  ([metadata-provider pmbql-query content-store]
   (when (and metadata-provider (map? pmbql-query) (seq pmbql-query))
     (try
       (export-query metadata-provider pmbql-query content-store)
       (catch Exception e
         (log/warn e "Failed to export pMBQL query to portable representations; omitting from LLM payload")
         nil)))))
