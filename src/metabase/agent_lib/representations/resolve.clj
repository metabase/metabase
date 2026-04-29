(ns metabase.agent-lib.representations.resolve
  "Resolve a parsed (string-keyed, portable) representations query into canonical numeric-ID
  pMBQL.

  Pipeline:

    1. **keywordize** string keys on the representations query. LLM writes \"lib/type\",
       \"source-table\", \"temporal-unit\" as YAML strings; lib-level MBQL expects keywords. We walk
       the whole structure once to keywordize map keys (but leave string *values* - including
       option values like \"month\" and clause heads like \"field\" / \"count\" - for
       [[lib.normalize]] to convert).\n
    2. **resolve portable FKs \u2192 numeric IDs** via `metabase.models.serialization.resolve/import-mbql`,\n       bound to a metadata-provider-backed resolver. Clause heads like `\"field\"` get converted to\n       `:field` keywords by `import-mbql` itself (per the `#{:field \"field\"}` match pattern) -\n       so by the end of this step the MBQL form has numeric ids and keywordized heads.\n\n    3. **normalize** through `lib.normalize/normalize` against `:metabase.lib.schema/query`. This:\n       * adds `:lib/uuid` to every clause;\n       * keywordizes known enum values (temporal units, base-types, join strategies);\n       * kebab-cases keys where applicable;\n       * attaches the metadata-provider at `:lib/metadata` so the result is a \"real\" pMBQL that\n         can be handed to `lib.query` / the QP directly.\n\n  The output is a valid MBQL 5 query ready for the query processor."
  (:require
   [metabase.agent-lib.representations :as repr]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.schema :as lib.schema]
   [metabase.models.serialization.resolve :as resolve]
   [metabase.models.serialization.resolve.mp :as resolve.mp]))

(set! *warn-on-reflection* true)

;;; ============================================================
;;; Step 1 - keywordize map keys
;;; ============================================================

(defn- keywordize-keys*
  "Recursively convert string map keys to keywords. Preserves string *values* (e.g. clause heads,
  temporal-unit strings, enum-valued option values) - those are handled by `import-mbql` /
  `lib.normalize` downstream.

  Special-cases: leaves table-FK and field-FK path vectors alone (vector-of-strings doesn't get\n  recursed into beyond the normal `vector? \u2192 mapv` walk, which is a no-op on strings)."
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

(defn resolve-query
  "Convert a parsed (string-keyed, portable) representations query into a canonical, numeric-ID,
  `:lib/uuid`-stamped MBQL 5 query attached to `metadata-provider`.

  The optional `content-store` is used for Metabase-content lookups (source cards, metrics,
  etc.). Agent-facing callers should pass a permission-aware store; the 2-arity form keeps the
  default app-DB-backed resolver for non-HTTP/test callers.

  Throws with informative ex-info on missing / ambiguous FK lookups (via the resolver) or on
  lib.schema normalization failures."
  ([metadata-provider parsed-repr]
   (resolve-query metadata-provider parsed-repr resolve.mp/app-db-content-store))
  ([metadata-provider parsed-repr content-store]
   (let [kw-form  (keywordize-query parsed-repr)
         resolver (resolve.mp/import-resolver metadata-provider content-store)
         resolved (resolve/import-mbql resolver kw-form)
         with-mp  (assoc resolved :lib/metadata metadata-provider)]
     (lib.normalize/normalize ::lib.schema/query with-mp))))

;;; ============================================================
;;; Export final pMBQL back to portable representations
;;; ============================================================

(defn- keyword->repr-string
  "String form used by the YAML representations format for keywords."
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
  back to the string-keyed YAML representation, and internal `:lib/metadata` is dropped."
  [metadata-provider pmbql-query]
  (let [resolver (resolve.mp/export-resolver metadata-provider)]
    (->> pmbql-query
         (resolve/export-mbql resolver)
         portable-repr-form)))

(defn parse-validate-resolve
  "Convenience end-to-end: take a YAML string and a metadata-provider, return a fully-resolved
  MBQL 5 query.

  Pipeline: [[repr/parse-and-validate]] \u2192 [[resolve-query]]."
  [metadata-provider ^String yaml-string]
  (->> yaml-string
       repr/parse-and-validate
       (resolve-query metadata-provider)))
