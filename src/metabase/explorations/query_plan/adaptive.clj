(ns metabase.explorations.query-plan.adaptive
  "The adaptive (greedy best-first) exploration query planner.

  A decision policy that *augments* the mechanical matrix walk: it emits the full
  depth-1 selected matrix (so the mechanical guarantee — select N dims, see N
  charts — always holds) and layers gain-gated drilled survivors on top, found by
  measuring candidate splits eagerly in-loop and descending into the
  differentiating ones. It implements the `QueryPlanner` protocol, so the
  orchestrator's transcript / failure / terminal scaffolding and the
  `insert-plan-rows!` materialization are reused unchanged; it is the first
  planner to run QP queries inside `plan!`."
  (:require
   [clojure.string :as str]
   [metabase.explorations.query-plan.mbql :as qp.mbql]
   [metabase.explorations.query-plan.mechanical :as qp.mechanical]
   [metabase.explorations.query-plan.planner :as planner]
   [metabase.interestingness.core :as interestingness]
   [metabase.lib.core :as lib]
   [metabase.query-processor.core :as qp]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Candidate categorical dimensions
;;; ---------------------------------------------------------------------------

(defn candidate-categorical-dims
  "Categorical dimensions the loop may split `metric-ctx`'s subject metric on:
  the metric's applicable dims (already resolved against the Card via
  `qp.context` `applicability`) that have **no default bucket**
  (`default-bucket-for-dim` = nil — i.e. not temporal, not binnable-numeric).
  No cardinality cap — head-concentrated high-cardinality categoricals are
  exactly the splits we want; the long tail is handled by the split-gain scorer
  and min-support, not by exclusion.

  Returns a vector of `{:dimension-id :target :dim}`."
  [metric-ctx]
  (into []
        (keep (fn [[dim-id {:keys [target dim]}]]
                (when (nil? (qp.mbql/default-bucket-for-dim dim))
                  {:dimension-id dim-id :target target :dim dim})))
        (:applicability metric-ctx)))

;;; ---------------------------------------------------------------------------
;;; Centralized, tunable configuration
;;;
;;; One map of plain constants — algorithm knobs, not per-instance operational
;;; settings. Grown per slice; tuned once on saasy (Issue 8) and then frozen.
;;; ---------------------------------------------------------------------------

(def config
  "Tunable parameters of the adaptive search (grown per slice).

  - `:min-split-gain` — the `split-gain` floor justifying a descent, tuned for
    the per-df effect-size scale (`sqrt(ε²/(k−1))`, ~Cramér's V): real effects
    sit above it, flat / noise / over-granular splits below. Screens flat / noise
    splits; min-support is the real terminator. Does not suppress surfacing.
  - `:min-support-floor/-rate/-fraction` — descent-eligibility floor
    `max(floor, ceil(fraction · parent-support))`; the absolute floor is raised
    for `:rate` metrics (a proportion needs a real denominator). Support weighting
    in `split-gain`, not the floor, does the ranking — the floor is a hard gate
    that keeps the search out of cells too small to measure.
  - `:k-child-values` — children descended into per split (top-k by deviation).
  - `:saturation-epsilon` — the loop does not descend into a `:rate` child cell
    whose proportion sits within this of a `[0,1]` extreme (no residual variation
    left to explain — any further split inside it is noise).
  - `:max-depth` — depth backstop (a placeholder hard cap until the governed
    best-first search lands).
  - `:leakage-null-fraction` / `:leakage-saturation-epsilon` — the
    [[leakage-artifact?]] candidate-eligibility guard. A `:rate` split is dropped
    when a single `nil`/blank bucket holds ≥ `:leakage-null-fraction` of the support
    *and* every non-null bucket is within `:leakage-saturation-epsilon` of the same
    `[0,1]` extreme — the signature of a dimension populated only *because* the
    outcome occurred."
  {:min-split-gain             0.01
   :min-support-floor          50
   :min-support-floor-rate     200
   :min-support-fraction       0.01
   :k-child-values             2
   :saturation-epsilon         0.02
   :max-depth                  5
   :leakage-null-fraction      0.9
   :leakage-saturation-epsilon 0.02})

(def min-split-gain
  "The `split-gain` floor (see `config`). A var so call sites / tests read it
  directly; the source of truth is `config`."
  (:min-split-gain config))

;;; ---------------------------------------------------------------------------
;;; Descent governance — value selection by deviation, min-support gating
;;; ---------------------------------------------------------------------------

(defn min-support-threshold
  "The descent-eligibility floor for a node with `parent-support` rows:
  `max(absolute-floor, ceil(fraction × parent-support))`. The absolute floor is
  raised for `:rate` metrics (`:min-support-floor-rate`), which need a real
  denominator before a proportion is trustworthy; `metric-kind` defaults to
  `:additive`."
  ([parent-support] (min-support-threshold parent-support :additive))
  ([parent-support metric-kind]
   (max (if (= metric-kind :rate)
          (:min-support-floor-rate config)
          (:min-support-floor config))
        (long (Math/ceil (* (:min-support-fraction config) (double (or parent-support 0))))))))

(defn- saturated?
  "A `:rate` cell sitting within `:saturation-epsilon` of a `[0,1]` extreme (≈0 or
  ≈1): the slice has no residual variation left to explain, so descending into it
  only splits noise. Additive metrics have no intrinsic extreme and are never
  saturated."
  [metric metric-kind]
  (and (= metric-kind :rate)
       (number? metric)
       (let [eps (:saturation-epsilon config)
             m   (double metric)]
         (or (<= m eps) (>= m (- 1.0 eps))))))

(defn select-child-values
  "Top-`k` child values to descend into, by **absolute deviation** of each child's
  metric from the mean of the (min-support-eligible) children — both tails, since
  a strongly-below child deviates as much as a strongly-above one. Cells below the
  min-support threshold (raised for `:rate` metrics, see `min-support-threshold`;
  `metric-kind` defaults to `:additive`), with a non-numeric metric, or — for rate
  metrics — already saturated at a `[0,1]` extreme (no residual variation to drill,
  see [[saturated?]]) are dropped first. Ties break by stringified value, so
  selection is deterministic. Returns raw cell values (the breakout group values,
  ready for equality/`is-null` inversion)."
  ([cells k] (select-child-values cells k :additive))
  ([cells k metric-kind]
   (let [parent-support (reduce + 0 (keep :count cells))
         threshold      (min-support-threshold parent-support metric-kind)
         eligible       (filterv (fn [{:keys [count metric]}]
                                   (and count (>= count threshold) (number? metric)
                                        (not (saturated? metric metric-kind))))
                                 cells)]
     (if (empty? eligible)
       []
       (let [mean (/ (reduce + 0.0 (map :metric eligible)) (clojure.core/count eligible))]
         (->> eligible
              (sort-by (juxt #(- (Math/abs (double (- (:metric %) mean))))
                             #(str (:value %))))
              (take k)
              (mapv :value)))))))

;;; ---------------------------------------------------------------------------
;;; Metric classification — rate vs additive, sniffed from the aggregation
;;; ---------------------------------------------------------------------------

(defn- aggregation-ops
  "The set of operator keywords appearing anywhere in `aggregations` (a seq of lib
  aggregation clauses), e.g. `#{:* :/ :count-where := :field}`."
  [aggregations]
  (into #{}
        (comp (mapcat #(tree-seq vector? seq %))
              (keep #(when (vector? %) (first %))))
        aggregations))

(defn metric-kind
  "Whether the metric measures a **rate** — a proportion whose aggregation is a
  `:share` or a ratio `:/` (e.g. `count-where`/`count`) — or an **additive**
  scalar (sum/count/avg). Sniffed from the aggregation shape; `:additive` is the
  default when no rate operator is present (also the safe fallback for an
  undetectable / absent aggregation). Drives `split-gain`'s normalization: rates
  get φ²/Cramér's V, everything else the scale-invariant weighted variance."
  [aggregations]
  (if (some #{:share :/} (aggregation-ops aggregations))
    :rate
    :additive))

(defn rate-scale
  "The constant a rate proportion is multiplied by in `aggregations` (e.g. a ×100
  percentage wrapper, `[:* [:/ …] 100]`), so measurement cells can be de-scaled
  back to `[0,1]` proportions before φ². `1.0` for a bare share / ratio.
  Heuristic: the product of the literal multiplicands of any `:*` in the
  aggregation (a mis-scaled rate is caught by `split-gain`'s [0,1] guard)."
  [aggregations]
  (transduce (comp (mapcat #(tree-seq vector? seq %))
                   (filter #(and (vector? %) (= :* (first %))))
                   (mapcat (fn [clause] (filter number? (drop 2 clause)))))
             * 1.0 aggregations))

(defn- metric-aggregations
  "The metric Card's top-level aggregation clauses (lib clause vectors), or nil
  when the metric-ctx carries no card / the query can't be built (test fixtures)."
  [metric-ctx]
  (try
    (when-let [card (:card metric-ctx)]
      (lib/aggregations (lib/query (:mp metric-ctx) (:dataset_query card))))
    (catch Throwable _ nil)))

(defn- field-ids
  "All integer field ids referenced anywhere in `clauses` (a seq of clause
  vectors) — walks nested `[:field {opts} id]` refs. The tag is matched as both
  the keyword `:field` (normalized lib clauses, e.g. a metric's aggregation) and
  the string `\"field\"` (a thread-group's JSON-snapshotted dimension target, whose
  tag deserializes as a string). Nominal (string-id) refs are ignored."
  [clauses]
  (into #{}
        (comp (mapcat #(tree-seq vector? seq %))
              (filter #(and (vector? %) (#{:field "field"} (first %))))
              (map peek)
              (filter integer?))
        clauses))

(defn- definitional-dim?
  "True when `candidate`'s target field is one the metric's own aggregation is
  defined on — e.g. the `category` field behind a `share(category = 'detractor')`
  rate. Splitting a metric by the very field that defines it is a tautology (every
  bucket lands at a `[0,1]` extreme by construction), so the loop drops it from
  descent candidacy, the same way it never re-splits a filter-path axis.
  `agg-field-ids` is `(field-ids (metric-aggregations metric-ctx))`."
  [agg-field-ids {:keys [target]}]
  (boolean (some agg-field-ids (field-ids [target]))))

;;; ---------------------------------------------------------------------------
;;; Split gain — continuous, support-weighted, bias-corrected, per-df effect size
;;; ---------------------------------------------------------------------------

(defn- norm-weighted-variance
  "Rate-free fallback effect size: `SS_between / (N·m̄²)` — scale-invariant, but
  divides by the grand mean so it blows up as `m̄ → 0`. `0.0` when the grand mean
  is ~0 (the degenerate guard). Used only when no within-group variance was
  measured (so η² can't be formed) and the metric isn't a clean rate."
  [ss-between n mean]
  (let [denom (* n mean mean)]
    (if (pos? denom) (/ ss-between denom) 0.0)))

(defn- epsilon-squared
  "Bias-corrected variance-explained effect size (ε²): η² = `SS_between/SS_total`
  with the between-group variance a *null* split would produce by chance —
  `(k−1)·MS_within`, `MS_within = SS_within/(N−k)` — subtracted off. Raw η² grows
  with the group count `k` even under pure noise (`E[η²] ≈ (k−1)/N`), so without
  this correction a high-cardinality dimension out-ranks a genuinely-differentiating
  low-cardinality one purely on degrees of freedom. Clamped at 0 (a slightly-negative
  correction *is* 'no effect'); falls back to uncorrected η² when within-df is
  unavailable (`N ≤ k`, e.g. all single-row groups)."
  [ss-between ss-within n k]
  (let [ss-total (+ ss-between ss-within)]
    (if (pos? ss-total)
      (let [df-within (- (double n) k)]
        (if (pos? df-within)
          (max 0.0 (/ (- ss-between (* (dec k) (/ ss-within df-within))) ss-total))
          (/ ss-between ss-total)))
      0.0)))

(defn- per-df-effect-size
  "Variance-explained **per between-group degree of freedom**, as a correlation-like
  effect size: `sqrt(η² / (k−1))` (Cramér's-V's shape). The `/(k−1)` makes a
  **coarse** dimension (Region, k=4) outrank a **granular** one (Country, k=19) that
  merely nests the same signal across more groups — so the frontier prefers
  interpretable, robust splits over high-cardinality overfitting. Bias-correction
  (ε²) alone is not enough: it zeroes *noise*, but a high-cardinality dim with a
  real-but-diffuse signal still edges out the coarse dim without this per-df penalty.
  `0.0` for `k ≤ 1`."
  [eta2 k]
  (if (> k 1) (Math/sqrt (/ (max 0.0 eta2) (double (dec k)))) 0.0))

(defn split-gain
  "Continuous, support-weighted effect size of a split, computed directly from its
  measurement `cells` (`{:value :metric :count}`, optionally `:variance` and
  `:group-mean`). Quantifies how much the breakout dimension *differentiates* the
  metric — the loop's descend/selection criterion.

  Support-weighted between-group variation around the grand mean `m̄ = Σnᵢmᵢ / Σnᵢ`,
  `SS_between = Σ nᵢ (mᵢ − m̄)²`, turned into a scale-invariant effect size and
  normalized per between-group degree of freedom — `gain = sqrt(ε²/(k−1))`. The
  variance-explained term ε² (bias-corrected η²) is computed three ways, in order:

  - **measured variance** (cells carry `:variance` = per-group population variance
    σ²ᵢ) → ε² from `SS_within = Σ nᵢ σ²ᵢ`. The between term uses each cell's group
    **mean**: `:group-mean` when present (a `sum` cell value is a group *total*),
    else `:metric` (`avg`/rate cells already are means).
  - `:rate` **fast-path** (no `:variance`) — within-variance is analytic,
    `SS_within = N·m̄(1−m̄) − SS_between`, feeding the same ε². If `m̄` isn't a
    proportion (`m̄(1−m̄) ≤ 0`), falls through to the rate-free form below.
  - otherwise — rate-free [[norm-weighted-variance]] `SS_between / (N·m̄²)`.

  `0.0` for a degenerate split (`k ≤ 1`, no support, or zero grand mean). Pure —
  unit-testable with hand-built cells."
  [cells metric-kind]
  (let [cells (filterv (fn [{:keys [metric count]}]
                         (and (number? metric) (number? count) (pos? count)))
                       cells)
        k     (clojure.core/count cells)]
    (if (<= k 1)
      0.0
      (let [supports   (mapv (comp double :count) cells)
            means      (mapv (fn [{:keys [group-mean metric]}]
                               (double (if (number? group-mean) group-mean metric)))
                             cells)
            n          (reduce + 0.0 supports)
            mean       (/ (reduce + 0.0 (map * supports means)) n)
            ss-between (reduce + 0.0 (map (fn [ni mi] (* ni (let [d (- mi mean)] (* d d))))
                                          supports means))]
        (per-df-effect-size
         (cond
           ;; Measured within-group variance → bias-corrected η² (ε²).
           (some (comp number? :variance) cells)
           (let [ss-within (reduce + 0.0 (map (fn [ni {:keys [variance]}]
                                                (* ni (if (number? variance) (double variance) 0.0)))
                                              supports cells))]
             (epsilon-squared ss-between ss-within n k))

           ;; Rate fast-path: ε² with the within-variance solved analytically.
           (= metric-kind :rate)
           (let [bernoulli (* n mean (- 1.0 mean))]
             (if (pos? bernoulli)
               (epsilon-squared ss-between (max 0.0 (- bernoulli ss-between)) n k)
               (norm-weighted-variance ss-between n mean)))

           :else
           (norm-weighted-variance ss-between n mean))
         k)))))

(defn select-split
  "Pick the winning split from `measured` candidates — each a map with at least
  `:gain` (the support-weighted split gain) and `:prior` (the no-query split
  prior). Highest `:gain` wins; ties break by `:prior` (desc) then `:dimension-id`
  (asc), so the choice is fully deterministic and an all-flat candidate set still
  yields a stable winner. Returns nil for an empty set."
  [measured]
  (first (sort-by (juxt (comp - double :gain)
                        (comp - double :prior)
                        :dimension-id)
                  measured)))

(defn- descend-gain
  "Split gain restricted to a chosen split's **non-saturated** cells — the
  differentiation that survives once cells with no residual variation
  ([[saturated?]]) are removed. The loop descends a node only when this clears
  `min-split-gain`, so a split is **not** drilled just because one unsaturated cell
  happens to remain: the surviving cells must *themselves* form a real split. NPS
  detractor rate by `comment_topic` — every topic 100%/0% detractor except a lone
  near-baseline `pricing` — collapses to ~0 here (one cell, no spread), so the loop
  surfaces the depth-1 chart but does not tunnel into it; `{A:0.7 B:0.1 C:1.0(sat)}`
  keeps a strong `{A,B}` split and is descended. Additive metrics have no saturated
  cells, so this equals the full split gain."
  [cells metric-kind]
  (split-gain (into [] (remove #(saturated? (:metric %) metric-kind)) cells) metric-kind))

;;; ---------------------------------------------------------------------------
;;; Candidate eligibility — leakage / artifact split exclusion
;;; ---------------------------------------------------------------------------

(defn- null-bucket?
  "A breakout group value standing for **absent / unknown** — `nil` or a blank
  string (an outer-join miss or an empty account attribute)."
  [v]
  (or (nil? v) (and (string? v) (str/blank? v))))

(defn leakage-artifact?
  "True when a split's measurement `cells` look like a **leakage / outcome
  artifact** rather than a real effect — a dimension that predicts the metric only
  because its value is populated *by* the outcome (e.g. an account attribute
  recorded once a signup completes, so 'region present ⟹ 100% complete'). `gain`
  ranks such a split highest — the 100%-vs-baseline gap is genuinely large — so it
  must be excluded from candidacy *before* ranking, not down-weighted after. Two
  conditions must hold **together**, so a genuinely rare-but-real minority segment
  is not excluded:

  - **null-bucket dominance** — a single `nil`/blank bucket holds at least
    `:leakage-null-fraction` of the support, and
  - **outcome-saturated non-null** — every non-null bucket sits within
    `:leakage-saturation-epsilon` of the *same* `[0,1]` extreme (all ≈ 1.0 or all
    ≈ 0.0). A real minority segment lands at an intermediate rate (0.92, 0.40) and
    so survives.

  Scoped to `:rate` metrics, where 'saturated' is well-defined as the proportion's
  extreme; additive metrics have no intrinsic max/min to saturate against and are
  left untouched — a seam for declared provenance. Operates on the **de-scaled**
  cells `split-gain` consumes."
  [cells metric-kind]
  (and (= metric-kind :rate)
       (let [cells (filterv (fn [{:keys [metric count]}]
                              (and (number? metric) (number? count) (pos? count)))
                            cells)
             total (reduce + 0.0 (map :count cells))
             {nulls true non-nulls false} (group-by (comp boolean null-bucket? :value) cells)
             eps   (:leakage-saturation-epsilon config)]
         (boolean
          (and (pos? total)
               (seq nulls)
               (seq non-nulls)
               (>= (/ (reduce + 0.0 (map :count nulls)) total)
                   (:leakage-null-fraction config))
               (or (every? #(>= (double (:metric %)) (- 1.0 eps)) non-nulls)
                   (every? #(<= (double (:metric %)) eps) non-nulls)))))))

;;; ---------------------------------------------------------------------------
;;; Measurement (impure) — run the breakout eagerly, collect support-weighted cells
;;; ---------------------------------------------------------------------------

(defn- col-indices
  "From a QP result's `:cols`, the breakout column index and the aggregation
  column indices (in order). The metric is a single aggregation, then the loop's
  added `count` (support), then — for sum/avg-of-a-field metrics — the within-group
  variance aggregations: `[metric count var]` for an `avg` metric, or
  `[metric count avg var]` for a `sum` metric (the extra `avg` recovers the group
  mean a total can't express)."
  [cols]
  {:dim-idx (first (keep-indexed (fn [i c] (when (= :breakout (:source c)) i)) cols))
   :agg-idxs (vec (keep-indexed (fn [i c] (when (= :aggregation (:source c)) i)) cols))})

(defn- metric-variance-aggregations
  "Aggregations to append to a sum/avg metric's measurement so `split-gain` can form
  η² from real within-group variance: a population `var` (`VAR_POP`) of the metric's
  field for `SS_within`, and — for a `sum` metric, whose cell value is a group
  *total* rather than a group mean — an `avg` of the same field to recover the true
  per-row group mean for `SS_between`. Returns `{:aggs [...] :mean? bool}` (the aggs
  are appended *after* the loop's `count`, so `:mean?` says whether an `avg` precedes
  the `var`), or `nil` for `count` (no per-row field), rates (within-variance is
  analytic), and multi-arg / expression aggregations (which then fall back to the
  rate-free form). The column is resolved fresh from `query` so the new aggs get
  distinct `:lib/uuid`s."
  [query]
  (when-let [agg (first (lib/aggregations query))]
    (when (and (#{:sum :avg} (first agg)) (= 3 (clojure.core/count agg)))
      (when-let [col (lib/find-matching-column (nth agg 2) (lib/visible-columns query))]
        (if (= :sum (first agg))
          {:aggs [(lib/avg col) (lib/var col)] :mean? true}
          {:aggs [(lib/var col)]               :mean? false})))))

(defn- measure-split*
  "Run `metric × dim` under `filter-path` eagerly through the QP, with an extra
  `count` aggregation for support and — for sum/avg metrics — a per-group `var`
  (and, for sum metrics, an `avg`) for within-group variance. Returns
  `{:cells [...]}` where each cell is
  `{:value <raw breakout value> :metric <metric agg> :count <rows>}`, plus
  `:variance <population variance>` when the var aggregation is present and
  `:group-mean <avg>` for sum metrics — exactly what `split-gain` consumes.
  Returns `{:cells []}` on any failure."
  [mp card target dim filter-path]
  (try
    (let [base     (-> (qp.mbql/build-snapshot-mbql mp (:dataset_query card) target dim)
                       (qp.mbql/apply-filter-path filter-path))
          {var-aggs :aggs mean? :mean?} (metric-variance-aggregations base)
          q        (reduce lib/aggregate (lib/aggregate base (lib/count)) var-aggs)
          result   (qp/process-query
                    (qp/userland-query-with-default-constraints q {:context :exploration}))
          cols     (get-in result [:data :cols])
          rows     (get-in result [:data :rows])
          {:keys [dim-idx agg-idxs]} (col-indices cols)
          metric-idx (nth agg-idxs 0 nil)
          count-idx  (nth agg-idxs 1 nil)
          mean-idx   (when mean? (nth agg-idxs 2 nil))
          var-idx    (nth agg-idxs (if mean? 3 2) nil)
          cells    (when (and dim-idx metric-idx count-idx)
                     (mapv (fn [r] (cond-> {:value  (nth r dim-idx nil)
                                            :metric (nth r metric-idx nil)
                                            :count  (nth r count-idx nil)}
                                     mean-idx (assoc :group-mean (nth r mean-idx nil))
                                     var-idx  (assoc :variance   (nth r var-idx nil))))
                           rows))]
      {:cells (or cells [])})
    (catch Throwable e
      (log/warnf e "Adaptive loop: measurement failed for dim %s" (:dimension_id dim))
      {:cells []})))

(defn- real-measure-split
  "Production measurement: measure `candidate`'s split on `metric-ctx`'s metric
  under `filter-path`."
  [metric-ctx filter-path {:keys [target dim]}]
  (measure-split* (:mp metric-ctx) (:card metric-ctx) target dim filter-path))

(def ^:dynamic *measure-split*
  "Seam: `(fn [metric-ctx filter-path candidate] -> {:cells [...]})`. Rebound in
  tests so the orchestration / descent can be exercised with canned measurement
  cells, without running the QP."
  real-measure-split)

;;; ---------------------------------------------------------------------------
;;; Survivor emission (rich rendering via the construction catalog)
;;; ---------------------------------------------------------------------------

(defn- emit-survivor
  "Emit a survivor for `(metric-ctx, dim)` at `filter-path` as plan items via the
  shared `items-for-pair` construction catalog (rich variant set — `default` /
  `top-n-other` / temporal patterns / `time-facet` / transforms where eligible),
  stamped with `group-id` and the accumulating filter path. The path is stored as
  `{:dimension_id :value}` pairs in `:params` — the runner resolves each
  dimension_id's target from the metric's mappings and applies it (so the
  persisted query carries its filters)."
  [group-id metric-ctx dim filter-path]
  (let [stored-path (mapv (fn [{:keys [dimension-id value]}]
                            {:dimension_id dimension-id :value value})
                          filter-path)]
    (mapv #(-> %
               (assoc :group_id group-id)
               (update :params assoc :filter_path stored-path))
          (qp.mechanical/items-for-pair metric-ctx dim))))

;;; ---------------------------------------------------------------------------
;;; Per-metric planning + descent
;;; ---------------------------------------------------------------------------

(defn- descale-cells
  "Divide each cell's `:metric` (and measured `:group-mean`) by `scale` (a no-op at
  `scale = 1.0`), turning a ×100 percentage rate back into a `[0,1]` proportion so
  `split-gain`'s φ² is valid. A `:variance` is divided by `scale²` to stay in the
  de-scaled units (variance scales with the square). Deviation-based child selection
  is scale-invariant, so this is safe to apply to all downstream cell uses."
  [cells scale]
  (if (== scale 1.0)
    cells
    (mapv (fn [c] (cond-> c
                    (number? (:metric c))     (update :metric     #(/ (double %) scale))
                    (number? (:group-mean c)) (update :group-mean #(/ (double %) scale))
                    (number? (:variance c))   (update :variance   #(/ (double %) (* scale scale)))))
          cells)))

(defn- applicable-dims
  "All of `metric-ctx`'s applicable dims as `{:dimension-id :target :dim}`."
  [metric-ctx]
  (into [] (map (fn [[dim-id {:keys [target dim]}]]
                  {:dimension-id dim-id :target target :dim dim}))
        (:applicability metric-ctx)))

(defn- fallback-dim
  "When a metric has no candidate categorical dim, guarantee output by surfacing
  its best available applicable dim — preferring a temporal one (→ metric over
  time). Returns a `{:dimension-id :target :dim}` candidate or nil when the
  metric has no applicable dim at all (then it can't be charted by breakout, and
  is skipped, as the mechanical planner also does)."
  [metric-ctx]
  (let [dims (applicable-dims metric-ctx)]
    (or (first (filter #(qp.mbql/dim-type-isa? (:dim %) :type/Temporal) dims))
        (first dims))))

(defn- remaining-candidates
  "Candidate categorical dims for `metric-ctx` not already consumed by the
  `filter-path` (you cannot re-split on a dim you have already filtered) and not a
  definitional axis of the metric (you cannot meaningfully split a metric by the
  field that defines it — see [[definitional-dim?]])."
  [metric-ctx filter-path]
  (let [used     (set (map :dimension-id filter-path))
        agg-fids (field-ids (metric-aggregations metric-ctx))]
    (into []
          (remove (fn [c] (or (used (:dimension-id c))
                              (definitional-dim? agg-fids c))))
          (candidate-categorical-dims metric-ctx))))

(defn- measure-node
  "Build and measure the node `(metric-ctx, filter-path)` at `depth`: measure each
  candidate split (or the single `forced` one), pick the best by **split-gain**,
  and fall back to a guaranteed split when nothing categorical is measurable. Rate
  cells are de-scaled to proportions once per node (the metric's kind/scale are
  constant across its candidates). Returns `{:node {...} :cost <executions>}`
  (cost = candidates measured) or nil when the metric can't be charted at all."
  [group-id metric-ctx filter-path depth forced]
  (let [aggs       (metric-aggregations metric-ctx)
        kind       (metric-kind aggs)
        scale      (rate-scale aggs)
        measure    (fn [c]
                     (let [cells (descale-cells (:cells (*measure-split* metric-ctx filter-path c)) scale)]
                       (assoc c :gain (split-gain cells kind) :cells cells
                              :prior (interestingness/dimension-interestingness (:dim c)))))
        candidates (if forced [forced] (remaining-candidates metric-ctx filter-path))
        measured   (mapv measure candidates)
        ;; Drop leakage / outcome artifacts before ranking — but never the forced
        ;; anchor dim (user-selected, kept by definition).
        eligible   (if forced
                     measured
                     (remove #(leakage-artifact? (:cells %) kind) measured))
        chosen     (cond forced        (first measured)
                         (seq eligible) (select-split eligible)
                         :else          nil)
        [chosen extra-cost]
        ;; Fall back to a guaranteed split only when there were no categorical
        ;; candidates at all (so the metric still surfaces something).
        (cond chosen        [chosen 0]
              (seq measured) [nil 0]
              :else          (when-let [fb (fallback-dim metric-ctx)]
                               [(measure fb) 1]))]
    (when chosen
      {:node {:group-id     group-id
              :metric-ctx   metric-ctx
              :filter-path  filter-path
              :depth        depth
              :chosen       chosen
              :gain         (double (:gain chosen))
              :descend-gain (double (descend-gain (:cells chosen) kind))}
       :cost (+ (count measured) extra-cost)})))

(defn- child-nodes
  "Measure the child nodes of `node` — one per selected child value (top-k by
  deviation), each extending the filter path with `dim = value`. Returns the
  vector of measured child node maps."
  [node]
  (let [{:keys [group-id metric-ctx filter-path depth chosen]} node
        kind   (metric-kind (metric-aggregations metric-ctx))
        values (select-child-values (:cells chosen) (:k-child-values config) kind)]
    (into []
          (keep (fn [value]
                  (let [child-path (conj (vec filter-path)
                                         {:dimension-id (:dimension-id chosen)
                                          :target       (:target chosen)
                                          :value        value})]
                    (:node (measure-node group-id metric-ctx child-path (inc depth) nil)))))
          values)))

(defn- expand
  "Drilled survivors at and below `node`'s children. A node is descended only when
  its **non-saturated** split still differentiates (`:descend-gain` ≥ the floor) and
  depth allows; each child is surfaced as a drilled survivor and recursively
  expanded. The root (depth 0, empty path) is itself never emitted here — the
  depth-1 matrix owns it; only its drilled children become survivors. Hard depth
  cap is a placeholder for the governed best-first search (Issue 7)."
  [node]
  (let [{:keys [min-split-gain max-depth]} config]
    (if (and (>= (:descend-gain node) min-split-gain)
             (< (:depth node) max-depth))
      (into []
            (mapcat (fn [child]
                      (into (emit-survivor (:group-id child) (:metric-ctx child)
                                           (:dim (:chosen child)) (:filter-path child))
                            (expand child))))
            (child-nodes node))
      [])))

(defn- descend-group
  "Drilled (depth > 1) survivors for one group: seed a root node per metric (free
  first split) and expand it. Roots are expand-only; only their drilled children
  surface here."
  [group]
  (into []
        (mapcat (fn [metric-ctx]
                  (when-let [{:keys [node]} (measure-node (:group-id group) metric-ctx [] 0 nil)]
                    (expand node))))
        (:metrics group)))

;;; ---------------------------------------------------------------------------
;;; Planner
;;; ---------------------------------------------------------------------------

(defn- plan-group
  "Plan one group: the **full depth-1 matrix** (every applicable selected pair,
  surfaced unconditionally via the shared `group-matrix-items`) **plus** the
  gain-gated descent, which contributes only the drilled (depth > 1) survivors the
  matrix can't express. Adaptive thus emits a strict superset of the mechanical
  planner's output."
  [group]
  (into (qp.mechanical/group-matrix-items group)
        (descend-group group)))

(defn- run-plan!
  [{:keys [metric-dim-ctx]}]
  (let [groups (:groups metric-dim-ctx)
        items  (vec (mapcat plan-group groups))]
    (if (empty? items)
      {:outcome    :skip-not-applicable
       :transcript {:strategy "adaptive" :reason "no survivors" :n-groups (count groups)}}
      {:outcome    :ok
       :plan       items
       :transcript {:strategy "adaptive" :n-items (count items) :n-groups (count groups)}})))

(defrecord AdaptivePlanner []
  planner/QueryPlanner
  (planner-name [_] :adaptive)
  (plan!        [_ ctx] (run-plan! ctx)))

(def planner
  "Singleton `AdaptivePlanner`. Referenced by `pick-planner!` when the
  `explorations-query-planner` setting is `:adaptive`."
  (->AdaptivePlanner))
