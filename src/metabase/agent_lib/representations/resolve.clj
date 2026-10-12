(ns metabase.agent-lib.representations.resolve
  "Resolve a parsed (string-keyed, portable) representations query into canonical numeric-ID
  MBQL 5.

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
       * attaches the metadata-provider at `:lib/metadata` so the result is a \"real\" MBQL 5 that
         can be handed to `lib.query` / the QP directly.

  The output is a valid MBQL 5 query ready for the query processor.

  The inverse direction — final MBQL 5 back to portable form — is handled by [[export-query]];
  the result is a Clojure map matching the external (keyword-keyed) shape, ready for JSON
  encoding or for handing back to the LLM as the canonical MBQL 5 representation."
  (:require
   [clojure.walk :as walk]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.schema :as lib.schema]
   [metabase.models.serialization.resolve :as resolve]
   [metabase.models.serialization.resolve.mp :as resolve.mp]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.match :as match]))

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
  "Walk a normalized MBQL 5 query and stamp `:base-type` / `:effective-type` on every
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

(defn- annotate-metric-and-measure-ref-types
  "BOT-1901: Stamp `:effective-type` on `:metric` / `:measure` refs missing it, computed
  from the metric's / measure's aggregation definition — mirroring the FE's `lib.ref/ref-method
  :metadata/metric`. Untyped refs poison arithmetic type inference in
  [[metabase.agent-lib.representations.repair/assert-editor-accepts-expressions!]]"
  [pmbql-query]
  (walk/postwalk
   (fn [node]
     (if (and (vector? node)
              (#{:metric :measure} (nth node 0 nil))
              (map? (nth node 1 nil))
              (pos-int? (nth node 2 nil))
              (not (contains? (nth node 1) :effective-type)))
       (let [md (case (nth node 0)
                  :metric  (lib.metadata/metric pmbql-query (nth node 2))
                  :measure (lib.metadata/measure pmbql-query (nth node 2)))
             t  (when md (lib.metadata.calculation/type-of pmbql-query md))]
         (if (and t (isa? t :type/*) (not= t :type/*))
           (update node 1 assoc :effective-type t)
           node))
       node))
   pmbql-query))

(defn- assert-parseable-temporal-literal!
  "Throw an agent-facing error if temporal string `s` is not a real date / datetime / year /
  year-month — i.e. one [[u.date/parse]] can read. The query schema only checks structure with a
  regex, so a value like `\"2024-13-45\"` passes normalization but is not a valid date."
  [s]
  (try
    (u.date/parse s)
    nil
    (catch Exception e
      ;; `s` is untrusted agent input — bound it before it lands in an exception message or ex-data so a
      ;; pathological literal can't flood logs. A real temporal literal is well under this length.
      (let [s' (u/truncate s 64)]
        (throw (ex-info (tru "Invalid temporal literal {0} — use an ISO-8601 date, datetime, year, or year-month."
                             (pr-str s'))
                        {:agent-error? true
                         :status-code  400
                         :error        :invalid-temporal-literal
                         :literal      s'}
                        e))))))

(def ^:private iso-date-shaped-pattern
  "A string that looks like an ISO-8601 date, with or without a time portion."
  #"\d{4}-\d{2}-\d{2}.*")

(defn- operand-types
  "The types describing MBQL clause `x`, as a set — empty or `nil` when nothing here describes it.

    [:field {:base-type :type/Text} 43]                       => #{:type/DateTime} (43 is a datetime)
    [:expression {:base-type      :type/DateTime,
                  :effective-type :type/Integer} \"Ship\"]      => #{:type/DateTime :type/Integer}

  For a resolved `[:field opts <id>]` the metadata provider is authoritative and the answer is one
  type. A type in `opts` is not evidence about the column: [[annotate-field-types]] stamps only a ref
  that has no `:base-type`, so a wrong model-authored stamp survives while the column stays whatever
  the provider says it is. Excusing a literal on that stamp buys one of two bad endings, both
  measured: a non-retryable `:type :qp` from `wrap-value-literals` wherever something upstream buckets
  the ref off the column (every `between`; `=` on a clean `yyyy-MM-dd`), and otherwise a filter that
  compiles, runs, and matches nothing for ever — `= <a timestamp column> \"2024-01-01 batch A\"`
  returns zero rows.

  Every other clause has only its own options, where `:base-type` and `:effective-type` can disagree:
  a bucket stamps an extraction type over a temporal column, a coercion stamps a temporal type over a
  text one. Returning both leaves that choice to the callers, which read the set with opposite
  quantifiers."
  [metadata-provider x]
  (when (and (vector? x) (map? (nth x 1 nil)))
    (let [id (nth x 2 nil)]
      (if (and (= :field (nth x 0)) (pos-int? id))
        ;; `pos-int?` is load-bearing, not decoration: `field` is a `mu/defn` whose input check throws
        ;; on `0` and on a negative id rather than answering `nil` the way an unknown id does.
        (when-let [field (lib.metadata.protocols/field metadata-provider id)]
          (when-let [t (or (:effective-type field) (:base-type field))]
            #{t}))
        (into #{} (keep (nth x 1)) [:effective-type :base-type])))))

(defn- operand-temporality
  "Whether MBQL clause `x` is `:temporal`, `:non-temporal`, or `:unknown` when nothing here types it.

  Three-valued on purpose: the two comparison walks below start from opposite defaults, so \"nothing
  types it\" has to stay distinguishable from \"typed, and not temporal\"."
  [metadata-provider x]
  (let [ts (operand-types metadata-provider x)]
    (cond
      ;; `some`, not `every?`: a coerced column is described by *both* its storage type and its
      ;; coercion result — `#{:type/Text :type/DateTime}` for an ISO-8601 string column — and the
      ;; temporal one is the type the QP compares a literal against.
      (some #(isa? % :type/Temporal) ts) :temporal
      (seq ts)                           :non-temporal
      :else                              :unknown)))

(def ^:private temporal-comparison-heads
  "Comparison heads whose operands can be a temporal ref next to bare temporal string literals.
  `:between` is absent: it has its own walk, with the opposite default. `during` is absent because it
  never arrives — Pass 2.95 rewrites a filter-position `during` into the `=`-on-a-bucketed-ref form
  this set does cover, and Pass 6's
  [[metabase.agent-lib.representations.repair/unencodable-temporal-clause-error!]] rejects the rest."
  #{:= :!= :< :<= :> :>= :in :not-in})

(defn- validate-temporal-literals
  "Validate (without coercing) the temporal string literals the model wrote, so malformed input fails
  fast here — where the agent sees it and can correct — instead of surviving to query execution: the
  literal of every `:absolute-datetime` clause, any bare `between` bound that looks like an ISO date,
  and any such string compared against a temporal operand by one of [[temporal-comparison-heads]] —
  the shape Pass 2.95's bucket hoist makes canonical and Pass 6's message tells the model to write.

  The two bare-literal walks start from opposite defaults, which is the point. A `between` bound is
  checked unless the compared column is *known* non-temporal, because it is checked today and a
  column we cannot type is not a reason to stop: `[\"between\" {} <STATUS> \"2024-01-01 batch A\"
  \"2024-06-01 batch Z\"]` is a legal text range and must pass, but a bound next to an untyped custom
  column must still be checked. The other heads are checked only when some operand is *known*
  temporal and none is known non-temporal, because they are not checked today and
  `[\"=\" {} <STATUS> \"2024-01-01 batch A\"]` is a perfectly good text comparison.

  The actual string → `java.time` coercion is intentionally NOT done here: it happens later in the
  QP's `wrap-value-literals`, where the comparison field's type and the report timezone are
  available. This pass only rejects literals that can't possibly parse. Returns the query unchanged."
  [pmbql-query metadata-provider]
  ;; `match/match-many`, not `lib.walk/walk-clauses`: the latter is a `mu/defn` that validates its
  ;; whole-query argument against `::lib.schema/query`, so under test instrumentation it would throw a
  ;; raw "Invalid input" on an otherwise-malformed query (e.g. an `:offset` in `:expressions`) here,
  ;; pre-empting the friendlier not-runnable gate downstream. We only need to inspect literals, and
  ;; matching a bare `[:absolute-datetime _ s _]` vector suffices — the same shape check the sibling
  ;; `annotate-field-types` pass uses. Separate walks rather than one with several patterns:
  ;; `match-many` does not descend into a form it matched, so a wrapped literal inside a comparison
  ;; has to be reached by a walk that did not match the comparison.
  (match/match-many pmbql-query
    [:absolute-datetime _ (s :guard string?) _]
    (assert-parseable-temporal-literal! s))
  (match/match-many pmbql-query
    [:between _ ref lo hi]
    (when-not (= :non-temporal (operand-temporality metadata-provider ref))
      (doseq [s [lo hi]
              :when (and (string? s) (re-matches iso-date-shaped-pattern s))]
        (assert-parseable-temporal-literal! s))))
  ;; The operand test lives in the *pattern*, not in the body: a head-only pattern matches an inert
  ;; comparison too, and `match-many` would then stop and never see a checkable comparison nested
  ;; inside it. A failing guard leaves the form unmatched, so the walk descends. `match-many` rejects
  ;; a lambda guard, and this one must close over `metadata-provider`, so it is bound to a name first.
  (let [checkable-operands? (fn [args]
                              (let [ts (map #(operand-temporality metadata-provider %) args)]
                                (and (some #{:temporal} ts)
                                     (not-any? #{:non-temporal} ts))))]
    (match/match-many pmbql-query
      [(_ :guard temporal-comparison-heads) _ & (args :guard checkable-operands?)]
      (doseq [s args
              :when (and (string? s) (re-matches iso-date-shaped-pattern s))]
        (assert-parseable-temporal-literal! s))))
  pmbql-query)

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
         (annotate-field-types metadata-provider)
         annotate-metric-and-measure-ref-types
         (validate-temporal-literals metadata-provider)))))

;;; ============================================================
;;; Export final MBQL 5 back to portable representations
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
  "Convert a final normalized numeric-ID MBQL 5 query back to portable representations data.

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

  `content-store` is required: every caller is an LLM context-building path, and falling
  through to the unchecked app-DB store would skip the permission check without saying so.
  Agent callers pass `metabase.metabot.tools.shared.content-store/default-store`."
  [metadata-provider pmbql-query content-store]
  (when (and metadata-provider (map? pmbql-query) (seq pmbql-query))
    (try
      (export-query metadata-provider pmbql-query content-store)
      (catch Exception e
        (log/warnf "Failed to export MBQL 5 query to portable representations; omitting from LLM payload: %s" (ex-message e))
        nil))))
