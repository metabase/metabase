(ns metabase.agent-lib.representations.repair
  "Repair pass for LLM-authored representations queries.

  Works on the **string-keyed, portable** representations form -- i.e. the output of
  `metabase.agent-lib.representations/parse-yaml` *before* it has been handed to the resolver.
  This is where we gently patch up the sort of shape drift that LLMs routinely produce:

    * missing `{}` options on clauses (LLMs forget to emit empty maps);
    * missing `\"lib/type\"` marker on stages and on the top-level query;
    * (structurally prepared, but Phase-2 feature) resolved-UUID generation for aggregation refs.

  **Key invariant: idempotency.** Repair must be a fixed point under repeated application: for
  any repr `q`, `(repair q)` must equal `(repair (repair q))`. This is enforced by property test
  and by construction -- every pass is written as `when-something-is-missing, add it`, never as
  `rewrite what's there`.

  Phase 1 scope: the three basic passes above. More complex repairs -- placeholder UUID expansion
  for `@agg-N` references (Phase 2 step 10), implicit-join `source-field` inference (Phase 1
  step 6) -- live in follow-up passes that will be composed here once implemented.

  The repair pass does **not** do FK resolution (that's the resolver's job) and does **not**
  validate (that's `representations/validate-query`'s job). It runs *between* parse and
  validate-and-resolve -- i.e. we parse the LLM YAML, repair obvious issues, then validate, then
  resolve.

  ## Implicit joins

  In addition to the shape passes above, `repair` also runs an **implicit-join pass** that uses
  the caller's `MetadataProvider` to auto-wire `source-field` options on field clauses that
  reference a table other than the stage's `source-table`. That pass is the only reason `repair`
  takes an `mp` argument — the shape passes themselves don't need it."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase.agent-lib.representations.resolve :as repr.resolve]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.models.serialization.resolve :as resolve]
   [metabase.models.serialization.resolve.mp :as resolve.mp]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; ============================================================
;;; Pass 1 -- ensure every clause vector has an options map at position 2
;;; ============================================================

(defn- non-blank-string? [x]
  (and (string? x) (not= "" x)))

(defn- looks-like-fk-path?
  "An FK path is a vector of strings (possibly with `nil` for schema-less DBs) of length >= 3
  (`[db schema table]`) or >= 4 (`[db schema table col …]`). We use length >= 3 as the cutoff
  here to keep things safe -- shorter vectors of strings are probably not FK paths, they're more
  likely bare clauses like `[\"count\"]` that the LLM forgot to annotate."
  [v]
  (and (>= (count v) 3)
       (every? #(or (string? %) (nil? %)) v)))

(defn- clause-like?
  "Heuristic: a real clause vector (not a map entry, not an FK path) whose head is a non-blank
  operator string. We skip:

    * `map-entry?` values (postwalk descends into map entries; their shape is [k v] and our
      heuristic would otherwise misidentify them as bare clauses);
    * FK-paths of length >= 3 consisting entirely of strings and `nil`s (see
      [[looks-like-fk-path?]])."
  [v]
  (and (vector? v)
       (not (map-entry? v))
       (pos? (count v))
       (non-blank-string? (first v))
       (not (looks-like-fk-path? v))))

(defn- needs-options-map?
  "True if `v` is a clause-like vector whose position 2 is either missing or `nil`.

  IMPORTANT: we do NOT treat a non-nil non-map at position 2 as \"missing options\". That would be
  ambiguous -- position 2 might be a nested clause (`[\"=\", [\"field\", ...], 10]` where the LLM
  forgot the options on `=`), and replacing that nested clause with `{}` would silently drop
  data. Instead we only repair the two unambiguous cases:

    * clause too short (no position 2 at all): `[\"count\"]` -> `[\"count\" {}]`;
    * explicit nil at position 2: `[\"count\", nil]` -> `[\"count\" {}]`.

  For a clause like `[\"=\", [\"field\", ...], 10]` where the options slot holds another clause,
  we **insert** `{}` before the existing element (see [[insert-options-map]])."
  [v]
  (and (clause-like? v)
       (or (< (count v) 2)
           (nil? (nth v 1))
           ;; position 2 is present but not a map -- means the LLM skipped the options slot
           ;; entirely and the arg at position 1 is actually a term (nested clause or FK-path
           ;; vector or a scalar). In that case we need to insert, not replace.
           (not (map? (nth v 1))))))

(defn- insert-options-map
  "Given a clause-like vector missing its options map at position 2, produce a vector with `{}`
  there. Three cases:

    * `[op]` -> `[op {}]`
    * `[op nil …args]` -> `[op {} …args]`  (replace the nil placeholder)
    * `[op <non-nil-non-map> …args]` -> `[op {} <non-nil-non-map> …args]`  (insert, don't replace)"
  [v]
  (cond
    (< (count v) 2)           (conj v {})
    (nil? (nth v 1))          (assoc v 1 {})
    (not (map? (nth v 1)))    (into [(first v) {}] (subvec v 1))
    :else                     v))

(defn- ensure-clause-options*
  [form]
  (walk/postwalk
   (fn [node]
     (if (and (vector? node) (not (map-entry? node)) (needs-options-map? node))
       (insert-options-map node)
       node))
   form))

;;; ============================================================
;;; Pass 1.5 -- normalize `expressions:` shape (map -> sequential; stamp `lib/expression-name`)
;;;
;;; MBQL 5 requires `:expressions` to be a `[:sequential ...]` where each entry is an
;;; expression clause carrying `:lib/expression-name` in its options map. LLMs naturally
;;; want to write a map-shape `expressions: {Name: [op, {}, ...]}` (with the expression
;;; name as the map key), which is far more readable. We accept both shapes here and
;;; normalise to the canonical sequential form, stamping `lib/expression-name` into each
;;; clause's options from the map key.
;;;
;;; If the author already wrote the sequential form, we leave the expression-name alone
;;; (authoritative in options). If both a map key AND `lib/expression-name` exist and
;;; disagree, the options-map wins (we don't overwrite authored metadata).
;;; ============================================================

(defn- expression-clause?
  "An expression definition clause: a vector whose position-1 element is a map (options).
  Anything else — a literal value, a non-vector, an empty vector — we leave alone and let
  schema validation complain."
  [x]
  (and (vector? x)
       (>= (count x) 2)
       (map? (nth x 1))))

(defn- stamp-expression-name
  "If the clause doesn't already have `\"lib/expression-name\"` in its options, stamp the
  given name. Otherwise leave the clause alone."
  [clause expr-name]
  (let [opts (nth clause 1)]
    (if (contains? opts "lib/expression-name")
      clause
      (assoc clause 1 (assoc opts "lib/expression-name" expr-name)))))

(defn- normalize-stage-expressions
  [stage]
  (let [exprs (get stage "expressions")]
    (cond
      ;; Map-shape: {Name clause, ...} -> [clause-with-name ...]
      (map? exprs)
      (assoc stage "expressions"
             (into []
                   (keep (fn [[expr-name clause]]
                           (when (expression-clause? clause)
                             (stamp-expression-name clause expr-name))))
                   exprs))

      ;; Sequential: leave as-is (name lives in each clause's options; schema enforces).
      (sequential? exprs)
      stage

      ;; Missing or something we don't understand: leave alone.
      :else
      stage)))

(defn- normalize-expressions-shape*
  "Walk the query and, for every map that has an `\"expressions\"` key, convert a map-shape
  expressions block into the canonical sequential shape with `lib/expression-name` stamped
  from the map key. Idempotent: sequential input passes through unchanged."
  [form]
  (walk/postwalk
   (fn [node]
     (if (and (map? node) (contains? node "expressions"))
       (normalize-stage-expressions node)
       node))
   form))

;;; ============================================================
;;; Pass 2 -- fill in missing `lib/type` markers
;;; ============================================================

(defn- top-level-query-map?
  [m]
  (and (map? m)
       (contains? m "database")
       (contains? m "stages")))

(defn- stage-like-map?
  "A map that looks like an MBQL stage: has `\"source-table\"`, `\"source-card\"`, or any of the
  stage-body keys (`filters`, `aggregation`, `breakout`, `order-by`, `fields`, `joins`,
  `expressions`, `limit`). Not a top-level query."
  [m]
  (and (map? m)
       (not (top-level-query-map? m))
       (boolean
        (some #(contains? m %)
              ["source-table" "source-card" "filters" "aggregation"
               "breakout" "order-by" "fields" "joins" "expressions" "limit"]))))

(defn- infer-query-lib-type [m]
  (if (and (top-level-query-map? m) (not (contains? m "lib/type")))
    (assoc m "lib/type" "mbql/query")
    m))

(defn- infer-stage-lib-type [m]
  (if (and (stage-like-map? m) (not (contains? m "lib/type")))
    (assoc m "lib/type" "mbql.stage/mbql")
    m))

(defn- ensure-lib-types* [form]
  (walk/postwalk
   (fn [node]
     (if (map? node)
       (-> node infer-query-lib-type infer-stage-lib-type)
       node))
   form))

;;; ============================================================
;;; Pass 2.7 -- rewrite inline aggregation expressions in `order-by` to aggregation refs
;;;
;;; Background: when the user asks for something like "top categories by total revenue", the
;;; LLM tends to write `order-by` by re-stating the aggregation expression inline:
;;;
;;;   aggregation: [[sum, {}, [field, {}, [..., TOTAL]]]]
;;;   order-by:    [[desc, {}, [sum, {}, [field, {}, [..., TOTAL]]]]]   # <-- inline copy
;;;
;;; In MBQL 5 / legacy MBQL the `order-by` direction must wrap an aggregation **reference**,
;;; not the aggregation expression itself. The `lib.normalize` step accepts the inline form
;;; structurally, but `lib/->legacy-MBQL` produces a query that fails legacy-schema validation
;;; the moment something downstream re-loads it (e.g. when the chart is opened, the QP
;;; round-trips through legacy MBQL and explodes with `Invalid output: {:query {:order-by ...}}`).
;;;
;;; This pass detects the pattern, structurally matches each `order-by` inner clause against
;;; the stage's `aggregation` list (ignoring options-map differences), and:
;;;   * stamps a UUID into the matching aggregation's options (if it doesn't already have one);
;;;   * replaces the inline `order-by` aggregation with `["aggregation" {} "<that-uuid>"]`.
;;;
;;; This does NOT introduce general placeholder-UUID handling (Phase 2 step 10 — `@agg-N`
;;; references); we only resolve the very specific "order-by re-states the aggregation inline"
;;; mistake. If the LLM writes a `["aggregation" {} "..."]` ref directly, we leave it alone.
;;; ============================================================

(defn- strip-clause-options
  "Recursively remove the options map (slot at position 1) from every clause-like vector in
  `form`. Used as a structural-equality key so we can match an inline `order-by` aggregation
  against the stage's `aggregation` entry without being thrown off by `lib/uuid` differences
  or unrelated option keys.

  Walks via `postwalk` and uses the same `clause-like?` predicate as the options-insertion
  pass, so map-entries, FK-paths, and non-clause vectors are left alone."
  [form]
  (walk/postwalk
   (fn [node]
     (if (and (vector? node)
              (not (map-entry? node))
              (clause-like? node)
              (>= (count node) 2)
              (map? (nth node 1)))
       (into [(first node)] (subvec node 2))
       node))
   form))

(defn- ensure-aggregation-uuid
  "Return a tuple `[stamped-aggregation uuid]`. If the aggregation already has a `lib/uuid` in
  its options, reuse it; otherwise generate one and assoc it in. Always returns the UUID for
  use in the corresponding aggregation reference."
  [aggregation]
  (let [opts (when (and (vector? aggregation) (>= (count aggregation) 2) (map? (nth aggregation 1)))
               (nth aggregation 1))
        existing (get opts "lib/uuid")
        uuid     (or existing (str (random-uuid)))]
    (if existing
      [aggregation uuid]
      [(assoc aggregation 1 (assoc (or opts {}) "lib/uuid" uuid)) uuid])))

(defn- aggregation-ref-clause?
  "True if `clause` is already an `[\"aggregation\" {opts} \"<uuid>\"]` reference. We never
  rewrite these."
  [clause]
  (and (vector? clause)
       (>= (count clause) 3)
       (= "aggregation" (first clause))))

(defn- order-by-direction-clause?
  "True if `clause` is `[\"asc\" {} <inner>]` or `[\"desc\" {} <inner>]`."
  [clause]
  (and (vector? clause)
       (>= (count clause) 3)
       (contains? #{"asc" "desc"} (first clause))))

(defn- rewrite-order-by-inline-aggs-in-stage
  "Apply the inline-agg-in-`order-by` rewrite to a single string-keyed stage map. Returns the
  updated stage. No-op when the stage has no `order-by` or no `aggregation`."
  [stage]
  (let [aggs    (get stage "aggregation")
        ord     (get stage "order-by")]
    (if-not (and (vector? aggs) (seq aggs) (vector? ord) (seq ord))
      stage
      ;; Build a structural-key → index lookup over the aggregations once.
      (let [agg-key->idx (into {}
                               (map-indexed (fn [i a] [(strip-clause-options a) i]))
                               aggs)
            ;; Mutable-style accumulators: walk order-by, simultaneously collecting any
            ;; aggregations that need a UUID stamped in.
            *aggs* (atom aggs)
            new-ord
            (mapv
             (fn [direction-clause]
               (if-not (order-by-direction-clause? direction-clause)
                 direction-clause
                 (let [inner (nth direction-clause 2)]
                   (cond
                     ;; Already an aggregation ref — leave it alone.
                     (aggregation-ref-clause? inner)
                     direction-clause

                     ;; Inline aggregation that matches one of the stage's aggregations.
                     (and (vector? inner)
                          (contains? agg-key->idx (strip-clause-options inner)))
                     (let [idx (get agg-key->idx (strip-clause-options inner))
                           [stamped uuid] (ensure-aggregation-uuid (nth @*aggs* idx))]
                       (swap! *aggs* assoc idx stamped)
                       (assoc direction-clause 2 ["aggregation" {} uuid]))

                     :else
                     direction-clause))))
             ord)]
        (assoc stage "aggregation" @*aggs* "order-by" new-ord)))))

(defn- rewrite-order-by-inline-aggs*
  "Top-level pass for inline-aggregation-in-order-by repair. Walks every stage in the query
  (not just `stages[0]`) since the same mistake can appear in multi-stage queries."
  [query]
  (if-not (and (map? query) (vector? (get query "stages")))
    query
    (update query "stages" #(mapv rewrite-order-by-inline-aggs-in-stage %))))

;;; ============================================================
;;; Pass 2.8 -- resolve integer-index aggregation references to UUID form
;;;
;;; LLM-authored queries commonly use a 0-based integer index to refer to an aggregation
;;; from the same stage: `[aggregation, {}, 0]` means "the first aggregation in this stage".
;;; This mirrors legacy MBQL 4 prior art (`[:aggregation 0]`, see `legacy_mbql/schema.cljc`)
;;; and is far easier for the model to produce than a UUID-based ref.
;;;
;;; MBQL 5's canonical form is `[aggregation, {lib/uuid, base-type, effective-type, …},
;;; "<uuid-string>"]` where the string in slot 2 is the `:lib/uuid` of the target
;;; aggregation clause in the same stage. This pass walks each stage, builds an
;;; index→uuid map over the stage's `aggregation:` vector (stamping a UUID on each agg
;;; clause that lacks one), then rewrites every `[aggregation, opts, <int>]` clause to the
;;; canonical form with `base-type`/`effective-type` inferred from the aggregation head.
;;;
;;; Same-stage refs only. Cross-stage aggregation references (a stage-N+1 `:aggregation`
;;; ref pointing at a stage-N aggregation) are **out of scope** for this pass — pMBQL
;;; actually forbids that shape; the correct downstream form is a cross-stage field ref by
;;; the aggregation's column name, which Pass 4 handles once the column name is known.
;;; An out-of-range or no-aggregations stage raises an `:agent-error?` ex-info with a
;;; helpful message listing the available indices/heads.
;;; ============================================================

(defn- integer-index-agg-ref?
  "True if `clause` is `[\"aggregation\", <opts>, <non-negative-int>]`."
  [clause]
  (and (vector? clause)
       (= 3 (count clause))
       (= "aggregation" (nth clause 0))
       (map? (nth clause 1))
       (let [idx (nth clause 2)]
         (and (integer? idx) (not (neg? idx))))))

(defn- inner-clause-field-base-type
  "Best-effort inner-field type extraction for `sum`/`min`/`max` etc. Looks for a nested
  `[\"field\" {\"base-type\" T, …} …]` clause; returns nil if none found."
  [agg-clause]
  (when (and (vector? agg-clause) (>= (count agg-clause) 3))
    (let [inner (nth agg-clause 2)]
      (when (and (vector? inner)
                 (>= (count inner) 2)
                 (= "field" (nth inner 0))
                 (map? (nth inner 1)))
        (get (nth inner 1) "base-type")))))

(defn- infer-agg-base-type
  "Return the string base-type for an aggregation clause. Small, intentionally inexact
  lookup table keyed by clause head — this is a shape pass, not a resolver. Return values
  are the string forms expected in the portable repair output.

  Heads whose output type tracks an inner field (`sum`, `min`, `max`, etc) try to pull the
  inner field's authored `base-type`; fall through to `type/*` if unknown."
  [agg-clause]
  (let [head (when (and (vector? agg-clause) (>= (count agg-clause) 1))
               (nth agg-clause 0))]
    (case head
      ("count" "distinct" "cum-count" "count-where") "type/BigInteger"
      ("avg" "median" "stddev" "var" "share")        "type/Float"
      ("sum" "sum-where" "cum-sum" "min" "max")
      (or (inner-clause-field-base-type agg-clause) "type/Float")
      "type/*")))

(defn- ensure-aggregation-uuids
  "Walk the stage's aggregation vector, stamping `lib/uuid` into each clause's options map
  when missing. Returns `[stamped-aggs index->uuid]` where `index->uuid` is a vector aligned
  with the aggregation vector."
  [aggs]
  (reduce
   (fn [[acc-aggs acc-uuids] agg]
     (let [[stamped uuid] (ensure-aggregation-uuid agg)]
       [(conj acc-aggs stamped) (conj acc-uuids uuid)]))
   [[] []]
   aggs))

(defn- agg-heads-summary
  "Return a short human-readable summary like `[sum at 0, count at 1]` for error messages."
  [aggs]
  (str "["
       (str/join ", "
                 (map-indexed (fn [i a]
                                (let [head (when (and (vector? a) (>= (count a) 1))
                                             (nth a 0))]
                                  (str head " at " i)))
                              aggs))
       "]"))

(defn- rewrite-integer-agg-refs-in-tree
  "Postwalk `tree` replacing every integer-index aggregation ref with its canonical
  UUID-keyed form. Uses `index->uuid` / `index->type` (both vectors aligned with the
  stage's aggregation vector) for the rewrite. Throws agent-error ex-info on out-of-range.

  Does NOT descend into the stage's own `aggregation:` vector; that's handled by the
  caller (we don't want to rewrite a stray integer that legitimately means \"the number 0\"
  inside an aggregation's args)."
  [tree index->uuid index->type aggs-for-error]
  (walk/postwalk
   (fn [node]
     (if (integer-index-agg-ref? node)
       (let [[_ opts idx] node]
         (if-let [uuid (get index->uuid idx)]
           (let [inferred-type (get index->type idx)
                 new-opts      (cond-> opts
                                 (and inferred-type (not (contains? opts "base-type")))
                                 (assoc "base-type" inferred-type)
                                 (and inferred-type (not (contains? opts "effective-type")))
                                 (assoc "effective-type" inferred-type))]
             ["aggregation" new-opts uuid])
           (throw (ex-info (tru "Aggregation index {0} out of range; stage has {1} aggregation(s): {2}"
                                idx (count index->uuid) (agg-heads-summary aggs-for-error))
                           {:agent-error? true
                            :error        :aggregation-ref-out-of-range
                            :index        idx
                            :available    (count index->uuid)
                            :heads        (mapv (fn [a] (when (vector? a) (first a))) aggs-for-error)}))))
       node))
   tree))

(defn- stage-has-integer-agg-ref?
  "Does `stage` contain any `[aggregation, {}, <int>]` clause anywhere? Used to decide
  whether to complain about a missing `aggregation:` vector (if there are no integer refs
  and no `aggregation:` block, it's a perfectly valid stage)."
  [stage]
  (let [found? (atom false)]
    (walk/postwalk
     (fn [n]
       (when (integer-index-agg-ref? n) (reset! found? true))
       n)
     (dissoc stage "aggregation"))
    @found?))

(defn- resolve-integer-agg-refs-in-stage
  "Resolve all integer-index aggregation refs in a single stage to canonical UUID form.
  No-op when the stage has neither `aggregation:` nor any integer-indexed refs."
  [stage]
  (let [aggs (get stage "aggregation")]
    (cond
      ;; No integer refs anywhere in the stage — nothing to do.
      (not (stage-has-integer-agg-ref? stage))
      stage

      ;; Integer ref(s) present but stage has no aggregation vector — agent-error.
      (not (and (vector? aggs) (seq aggs)))
      (throw (ex-info (tru "Found an integer-indexed aggregation reference but this stage has no `aggregation:` clause")
                      {:agent-error? true
                       :error        :aggregation-ref-no-aggregations}))

      :else
      (let [[stamped-aggs index->uuid] (ensure-aggregation-uuids aggs)
            index->type                (mapv infer-agg-base-type stamped-aggs)
            ;; Walk everything EXCEPT the `aggregation:` vector itself. We replace that
            ;; vector with a sentinel during the walk and restore it after. (Simpler than
            ;; implementing a custom non-descending walker.)
            stage-wo-aggs              (assoc stage "aggregation" ::placeholder)
            rewritten                  (rewrite-integer-agg-refs-in-tree
                                        stage-wo-aggs index->uuid index->type stamped-aggs)]
        (assoc rewritten "aggregation" stamped-aggs)))))

(defn- resolve-aggregation-ref-indexes*
  "Top-level pass: resolve 0-based integer `[aggregation, {}, <idx>]` references to the
  canonical MBQL 5 `[aggregation, {lib/uuid, base-type, effective-type}, \"<uuid>\"]`
  shape. See block comment above."
  [query]
  (if-not (and (map? query) (vector? (get query "stages")))
    query
    (let [stages (get query "stages")]
      (log/debugf "[repr-repair] resolve-aggregation-ref-indexes*: %d stage(s)" (count stages))
      (assoc query "stages" (mapv resolve-integer-agg-refs-in-stage stages)))))

;;; ============================================================
;;; Pass 3 -- auto-wire `source-field` for implicit joins
;;;
;;; When a field clause references a field on a table *other* than the stage's
;;; `source-table`, and there is exactly one foreign key from the source table to that target
;;; table, fill in the `source-field` option with the portable FK of the FK column. The QP
;;; interprets this as an implicit join (the same machinery users get from the notebook UI).
;;;
;;; The pass walks stage[0] only, skips descent into the `\"joins\"` subtree (field clauses
;;; inside a join live in a join context), and is a no-op on clauses that already carry
;;; `source-field` or `join-alias`.
;;; ============================================================

(defn- field-clause?
  "A repaired field clause of shape `[\"field\" <opts-map> <portable-fk-vector>]`. We require the
  opts map to be a real map and the portable FK to be a vector of >= 4 elements (DB, SCHEMA,
  TABLE, FIELD, …)."
  [v]
  (and (vector? v)
       (not (map-entry? v))
       (>= (count v) 3)
       (= "field" (nth v 0))
       (map? (nth v 1))
       (let [fk (nth v 2)]
         (and (vector? fk) (>= (count fk) 4)))))

(defn- try-resolve-source-table-id
  "Resolve the stage's `source-table` portable FK to a numeric id. Returns nil on any failure
  (unknown DB, unknown table, nil source-table, wrong shape, etc.) — implicit-join repair is
  best-effort and should never mask an error that the downstream validate/resolve passes will
  surface with a better message."
  [import-resolver source-table-fk]
  (try
    (when (and import-resolver (vector? source-table-fk) (= 3 (count source-table-fk)))
      (resolve/import-table-fk import-resolver source-table-fk))
    (catch Exception _ nil)))

(defn- try-resolve-field-target-table-id
  "Resolve the target-table-id of a portable field FK, by looking up the field and following its
  `:table-id`. Walks JSON-unfolded parent chains via the resolver's `import-field-fk`. Returns
  nil on failure."
  [mp import-resolver field-fk]
  (try
    (when-let [fid (resolve/import-field-fk import-resolver field-fk)]
      (:table-id (lib.metadata.protocols/field mp fid)))
    (catch Exception _ nil)))

(defn- export-source-field-portable
  "Convert a numeric FK column id into its portable `[db schema table field …]` path, via the
  MP-backed export resolver. Returns nil on failure."
  [export-resolver source-field-id]
  (try
    (resolve/export-field-fk export-resolver source-field-id)
    (catch Exception _ nil)))

(defn- display-source-table [mp source-table-id]
  (try
    (let [t (lib.metadata.protocols/table mp source-table-id)]
      (or (:name t) (str source-table-id)))
    (catch Exception _ (str source-table-id))))

(defn- display-portable [fk]
  (pr-str fk))

(defn- maybe-fill-source-field
  "Given a field-clause vector (already known to be a field clause), the stage's source-table-id,
  and the precomputed outbound-FK map, return either the original clause or a clause with
  `\"source-field\"` populated. Throws `:no-fk-path` or `:ambiguous-fk` on hard errors."
  [clause mp import-resolver export-resolver source-table-id outbound-fks-by-target]
  (let [opts (nth clause 1)
        fk   (nth clause 2)]
    (cond
      ;; already has source-field or join-alias: leave it alone.
      (contains? opts "source-field")
      clause

      (contains? opts "join-alias")
      clause

      :else
      (let [target-table-id (try-resolve-field-target-table-id mp import-resolver fk)]
        (cond
          ;; Couldn't resolve target table: skip (validate/resolve will surface the real error).
          (nil? target-table-id)
          clause

          ;; Field is on the source table itself: nothing to do.
          (= target-table-id source-table-id)
          clause

          :else
          (let [candidates (get outbound-fks-by-target target-table-id)]
            (case (count candidates)
              0 (let [src-name (display-source-table mp source-table-id)
                      tbl-name (nth fk 2)]
                  (throw (ex-info (tru "Field {0} is on table {1} but there is no foreign key from the source table {2} to {3}. Either add an explicit joins: entry, or use a field from the source table."
                                       (display-portable fk)
                                       (pr-str tbl-name)
                                       (pr-str src-name)
                                       (pr-str tbl-name))
                                  {:status-code  400
                                   :error        :no-fk-path
                                   :agent-error? true
                                   :field        fk
                                   :source-table source-table-id
                                   :target-table target-table-id})))
              1 (let [{:keys [source-field-id]} (first candidates)
                      src-fk (export-source-field-portable export-resolver source-field-id)]
                  (if src-fk
                    (assoc clause 1 (assoc opts "source-field" src-fk))
                    clause))
              (let [src-name      (display-source-table mp source-table-id)
                    candidate-fks (mapv (fn [{:keys [source-field-id]}]
                                          (export-source-field-portable export-resolver source-field-id))
                                        candidates)]
                (throw (ex-info (tru "Field {0} can be reached from {1} via {2} foreign keys. Specify :source-field explicitly in the clause options. Candidates: {3}"
                                     (display-portable fk)
                                     (pr-str src-name)
                                     (count candidates)
                                     (str/join ", " (map display-portable candidate-fks)))
                                {:status-code  400
                                 :error        :ambiguous-fk
                                 :agent-error? true
                                 :field        fk
                                 :source-table source-table-id
                                 :target-table target-table-id
                                 :candidates   candidate-fks}))))))))))

(defn- resolve-implicit-joins-in-stage
  "Apply implicit-join repair to a single stage map (string-keyed). Returns an updated stage.

  Skips descent into the `\"joins\"` subtree by plucking it out before the postwalk and
  restoring it afterwards — field clauses inside explicit joins are expected to carry a
  `join-alias` already."
  [stage mp import-resolver export-resolver]
  (let [source-table-fk (get stage "source-table")
        source-table-id (try-resolve-source-table-id import-resolver source-table-fk)]
    (if-not source-table-id
      ;; Can't resolve source-table: skip the pass and let validate/resolve surface the error.
      stage
      (let [outbound  (resolve.mp/outbound-fks-from-table mp source-table-id)
            by-target (group-by :target-table-id outbound)
            joins     (get stage "joins")
            stage'    (cond-> stage (contains? stage "joins") (dissoc "joins"))
            walked    (walk/postwalk
                       (fn [node]
                         (if (field-clause? node)
                           (maybe-fill-source-field node mp import-resolver export-resolver
                                                    source-table-id by-target)
                           node))
                       stage')]
        (cond-> walked
          (contains? stage "joins") (assoc "joins" joins))))))

(defn- resolve-implicit-joins*
  "Top-level implicit-join pass. Only `stages[0]` participates: implicit-join `source-field`
  inference is a relationship from a stage's `source-table` to a sibling table via a single FK,
  and only the first stage of a query has a `source-table` of its own. Stages 1+ feed off the
  previous stage's output, where field references are by string name (handled by
  [[infer-cross-stage-field-types*]] further down)."
  [query mp]
  (if-not (and mp (map? query) (vector? (get query "stages")) (seq (get query "stages")))
    query
    (let [import-resolver (resolve.mp/import-resolver mp)
          export-resolver (resolve.mp/export-resolver mp)]
      (update-in query ["stages" 0] resolve-implicit-joins-in-stage
                 mp import-resolver export-resolver))))

;;; ============================================================
;;; Pass 4 -- infer base-type / effective-type on cross-stage field references
;;;
;;; A cross-stage field reference looks like `["field" {opts} "<column-name>"]` where the
;;; third element is a **string** (the column's name in the previous stage's output) rather
;;; than a portable FK vector. The lib-schema for `:mbql.clause/field` requires the options
;;; map to carry `:base-type` whenever the id-or-name argument is a string \u2014 and LLMs
;;; routinely forget this, even though they're great at picking the right column name.
;;;
;;; Strategy:
;;;   * Walk stages left-to-right.
;;;   * Before processing stage `i` (i ≥ 1), build a mini-query consisting of stages[0..i-1]
;;;     and resolve it. Call `lib/returned-columns` on the result; index by `:name`.
;;;   * Walk stage[i] (skipping descent into `joins` subtrees \u2014 those have their own
;;;     resolution context). For every `["field" opts <string>]` clause:
;;;       - If `opts` already has `"base-type"`, leave it alone (idempotent).
;;;       - If the name is unknown to the previous stage, leave it alone (the resolver will
;;;         report the real error with a better message).
;;;       - Otherwise, stamp `"base-type"` (and `"effective-type"` when present) into the
;;;         options map.
;;;   * If the prefix can't be resolved (bad source-table, etc.), skip the rest of the pass
;;;     \u2014 again, the resolver will surface the structural problem.
;;;
;;; The mini-resolve is potentially O(N) over stages, but in practice N ≤ a handful, the MP
;;; is cached, and we only do this for queries that actually have multiple stages.
;;; ============================================================

(defn- string-cross-stage-field-clause?
  "`[\"field\" <opts-map> <string>]` \u2014 a cross-stage column reference by name. We require
  the opts map to be a real map and the third element to be a non-blank string. Anything else
  (FK vector, missing slot, non-map opts) is left to [[field-clause?]] / the resolver."
  [v]
  (and (vector? v)
       (not (map-entry? v))
       (= 3 (count v))
       (= "field" (nth v 0))
       (map? (nth v 1))
       (non-blank-string? (nth v 2))))

(defn- types-from-column
  "Pull `\"base-type\"` (and optionally `\"effective-type\"`) off a `lib/returned-columns`
  metadata map, in the string-keyed form that matches the rest of the repair pipeline.
  Returns `nil` if the column has no `:base-type` we can use."
  [col]
  (when-let [bt (:base-type col)]
    (let [bt-str (if (keyword? bt) (subs (str bt) 1) (str bt))]
      (cond-> {"base-type" bt-str}
        (:effective-type col)
        (assoc "effective-type" (let [et (:effective-type col)]
                                  (if (keyword? et) (subs (str et) 1) (str et))))))))

(defn- mini-resolved-columns-by-name
  "Resolve `stages[0..idx-1]` as a self-contained query, run it through `lib/query`, and return
  a `{column-name → {\"base-type\" ..., \"effective-type\" ...}}` map for the columns the
  prefix returns.

  Returns `nil` (logged at debug) if anything in the resolve / lib/query path throws. The
  enclosing pass treats `nil` as 'skip this stage's repairs and let downstream surface the real
  error'."
  [mp query stage-idx]
  (try
    (let [prefix-stages (subvec (get query "stages") 0 stage-idx)
          prefix-query  (assoc query "stages" prefix-stages)
          resolved      (repr.resolve/resolve-query mp prefix-query)
          lib-q         (lib/query mp resolved)
          cols          (lib/returned-columns lib-q)]
      (into {}
            (keep (fn [col]
                    (when-let [types (types-from-column col)]
                      [(:name col) types])))
            cols))
    (catch Exception e
      (log/debugf e "[repr-repair] mini-resolve of stages[0..%d] failed; skipping cross-stage type inference for stage %d"
                  (dec stage-idx) stage-idx)
      nil)))

(defn- maybe-fill-cross-stage-types
  "Given a cross-stage field clause and a name→types map, return the clause with `base-type`
  / `effective-type` filled in (when missing and known)."
  [clause name->types]
  (let [opts (nth clause 1)
        col-name (nth clause 2)]
    (if (contains? opts "base-type")
      clause
      (if-let [types (get name->types col-name)]
        (assoc clause 1 (merge opts types))
        clause))))

(defn- infer-cross-stage-field-types-in-stage
  "Walk one stage and stamp inferred types into every string-named field reference that lacks
  `\"base-type\"`. Skips descent into `\"joins\"` subtrees \u2014 join stages have their own
  resolution context (the join's own `stages`) and shouldn't reach into their parent stage's
  previous-stage columns."
  [stage name->types]
  (let [joins  (get stage "joins")
        stage' (cond-> stage (contains? stage "joins") (dissoc "joins"))
        walked (walk/postwalk
                (fn [node]
                  (if (string-cross-stage-field-clause? node)
                    (maybe-fill-cross-stage-types node name->types)
                    node))
                stage')]
    (cond-> walked
      (contains? stage "joins") (assoc "joins" joins))))

(defn- mini-resolved-columns-for-source-card
  "Resolve a single-stage query consisting only of `{:source-card <entity-id>}` (plus the
  outer `mbql/query` wrapper and the warehouse database name), then return the
  `lib/returned-columns` output as a `name → types` map in the same shape as
  [[mini-resolved-columns-by-name]]. Used by [[infer-source-card-field-types*]] to stamp
  `base-type` onto `[field, {}, \"<col>\"]` clauses in a stage whose source is a saved
  question / model.

  Returns `nil` if anything in the resolve path throws — the resolver will surface the real
  error on the main pipeline. Logged at debug."
  [mp query stage-idx]
  (let [stage (get-in query ["stages" stage-idx])]
    (when-let [source-card (get stage "source-card")]
      (try
        (let [bare-stage {"lib/type"    "mbql.stage/mbql"
                          "source-card" source-card}
              bare-query {"lib/type" "mbql/query"
                          "database" (get query "database")
                          "stages"   [bare-stage]}
              resolved   (repr.resolve/resolve-query mp bare-query)
              lib-q      (lib/query mp resolved)
              cols       (lib/returned-columns lib-q)]
          (into {}
                (keep (fn [col]
                        (when-let [types (types-from-column col)]
                          [(:name col) types])))
                cols))
        (catch Exception e
          (log/debugf e "[repr-repair] source-card resolve of stage %d failed; skipping field-type inference"
                      stage-idx)
          nil)))))

(defn- infer-source-card-field-types*
  "Stamp `base-type` / `effective-type` onto `[field, opts, \"<col>\"]` clauses in any stage
  whose source is a `source-card:` entity. Uses the card's resolved `returned-columns` as the
  type oracle.

  Idempotent and silently no-ops when `mp` is nil, the query shape is off, the card can't be
  resolved, or the column name isn't one the card produces (resolver will report the real
  error downstream)."
  [query mp]
  (if-not (and mp (map? query) (vector? (get query "stages")))
    query
    (let [n (count (get query "stages"))]
      (loop [i 0
             q query]
        (if (>= i n)
          q
          (let [stage (get-in q ["stages" i])
                q'    (if (and (map? stage) (get stage "source-card"))
                        (if-let [name->types (mini-resolved-columns-for-source-card mp q i)]
                          (update-in q ["stages" i] infer-cross-stage-field-types-in-stage name->types)
                          q)
                        q)]
            (recur (inc i) q')))))))

(defn- infer-cross-stage-field-types*
  "Top-level cross-stage field-type inference pass. No-op when the query has fewer than two
  stages or `mp` is nil."
  [query mp]
  (if-not (and mp
               (map? query)
               (vector? (get query "stages"))
               (>= (count (get query "stages")) 2))
    query
    (let [n (count (get query "stages"))]
      (loop [i 1
             q query]
        (if (>= i n)
          q
          (let [name->types (mini-resolved-columns-by-name mp q i)
                q'          (if name->types
                              (update-in q ["stages" i] infer-cross-stage-field-types-in-stage name->types)
                              q)]
            (recur (inc i) q')))))))

;;; ============================================================
;;; Top-level entry point
;;; ============================================================

(defn- normalize-shape*
  "Pure-shape passes that don't require a metadata provider."
  [parsed]
  (-> parsed
      ensure-clause-options*
      normalize-expressions-shape*
      ensure-lib-types*))

(defn repair
  "Run the repair pipeline on a parsed (string-keyed, portable) representations query.

  Passes:
    1. ensure every clause vector has an options map at position 2;
    1.5. normalise `expressions:` shape — accept map form `{Name: clause, …}` or the
       canonical sequential form, always output sequential with `lib/expression-name`
       stamped into each clause's options from the map key when missing;
    2. fill in missing `\"lib/type\"` markers on the query and stages;
    3. rewrite inline aggregation expressions in `order-by` to aggregation references when
       they match an aggregation in the same stage's `aggregation:` list (synthesising the
       referenced aggregation's `lib/uuid` if needed);
    3.5. resolve 0-based integer aggregation references (`[aggregation, {}, <int>]`) in a
       stage to the canonical UUID-keyed MBQL 5 form, stamping `lib/uuid` on the target
       aggregation clause and `base-type`/`effective-type` on the ref's options;
    4. auto-wire `source-field` on field clauses that reference a foreign table via a single
       unambiguous FK on the source table (implicit-join resolution);
    5. infer `base-type` / `effective-type` on cross-stage field references
       (`[\"field\" {} \"<column-name>\"]` in a non-first stage), by mini-resolving the
       prefix of stages and reading the returned columns' metadata.
    5.5. infer `base-type` / `effective-type` on field references in a stage whose source is
       a saved question / model (`source-card:`), using the card's resolved returned columns.

  Pass 4, Pass 5, and Pass 5.5 require `mp` (a `MetadataProvider`); they are best-effort
  no-ops when `mp` can't resolve the relevant pieces (so the subsequent validate/resolve
  stages can surface the real error with their own, better messages). Hard FK errors from
  Pass 4 (`:no-fk-path`, `:ambiguous-fk`) are raised as `:agent-error?` ex-info so the tool
  wrapper can relay them to the LLM. Pass 5 and Pass 5.5 never throw on their own \u2014 if a
  prefix / source-card can't be resolved, they just leave the affected clauses alone and let
  the schema validator complain.

  Note: the database-name normalisation pass (\"Pass 2.5\") that previously lived here was
  removed in `repr-plan.md` step 13. Database identity is now derived from the YAML's
  `database:` field directly (see [[metabase.metabot.tools.construct/resolve-database-id-from-yaml]]),
  which makes the MP guaranteed-consistent with the YAML by construction.

  Guaranteed to be **idempotent**: `(= (repair mp q) (repair mp (repair mp q)))`. Pass 3
  satisfies idempotency by stamping a deterministic-once UUID into the matching aggregation
  (subsequent runs reuse it) and by leaving existing `[\"aggregation\" {} \"<uuid>\"]` refs
  alone. Pass 5 is idempotent because it skips any cross-stage clause whose options already
  contain `\"base-type\"`."
  [mp parsed]
  (-> parsed
      normalize-shape*
      rewrite-order-by-inline-aggs*
      resolve-aggregation-ref-indexes*
      (resolve-implicit-joins* mp)
      (infer-cross-stage-field-types* mp)
      (infer-source-card-field-types* mp)))
