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
;;; Anchors — a group is anchored on a metric or a dimension
;;; ---------------------------------------------------------------------------

(defn anchor-type
  "Whether `group` (a `metric-and-dim-context` group entry) is anchored on its
  metric or its dimension, read from the persisted `:type`."
  [{:keys [type]}]
  (case type
    "dimension" :dimension
    "metric"    :metric
    (throw (ex-info "Exploration group has no recognized anchor :type"
                    {:type type}))))

;;; ---------------------------------------------------------------------------
;;; Candidate categorical dimensions
;;; ---------------------------------------------------------------------------

(defn candidate-categorical-dims
  "Categorical dimensions the loop may split `metric-ctx`'s subject metric on:
  the metric's applicable dims (already resolved against the Card via
  `qp.context` `applicability`) that are categorical — neither temporal nor
  numeric (`qp.mbql/categorical-dim?`). No cardinality cap — head-concentrated
  high-cardinality categoricals are exactly the splits we want; the long tail is
  handled by the split-gain scorer and min-support, not by exclusion.

  Returns a vector of `{:dimension-id :target :dim}`."
  [metric-ctx]
  (into []
        (keep (fn [[dim-id {:keys [target dim]}]]
                (when (qp.mbql/categorical-dim? dim)
                  {:dimension-id dim-id :target target :dim dim})))
        (:applicability metric-ctx)))

;;; ---------------------------------------------------------------------------
;;; Centralized, tunable configuration
;;;
;;; One map of plain constants — algorithm knobs, not per-instance operational
;;; settings (tuned on real datasets, then frozen); not `defsetting`s.
;;; ---------------------------------------------------------------------------

(def config
  "Tunable parameters of the adaptive search.

  - `:min-split-gain` — the `split-gain` floor justifying a descent, tuned for
    the per-df effect-size scale (`sqrt(ε²/(k−1))`, ~Cramér's V): real effects
    sit above it, flat / noise / over-granular splits below. Screens flat / noise
    splits; min-support is the real terminator. Does not suppress surfacing.
  - `:min-support-floor/-rate/-fraction` — descent-eligibility floor
    `max(floor, ceil(fraction · parent-support))`; the absolute floor is raised
    for **proportion** splits (a proportion needs a real denominator). Support
    weighting in `split-gain`, not the floor, does the ranking — the floor is a
    hard gate that keeps the search out of cells too small to measure.
  - `:k-child-values` — children descended into per split (top-k by deviation).
  - `:saturation-epsilon` — the loop does not descend into a **proportion** child
    cell whose value sits within this of a `[0,1]` extreme (no residual variation
    left to explain — any further split inside it is noise).
  - `:budget-alpha/min/max` — per-anchor measurement-execution budget is
    `clamp(alpha · seed-breadth, min, max)`, where seed-breadth is the candidate
    dims (metric anchor) or metrics (dimension anchor). A *backstop*, not the
    search shaper — `min-support` is the real terminator.
  - `:branch-gamma` — a single depth-1 branch may spend at most `⌈gamma·budget⌉`
    (anti-tunneling); loose enough that an interesting branch out-spends a boring
    one, bounded enough that none consumes the whole budget.
  - `:max-depth` — depth backstop.
  - `:leakage-null-fraction` / `:leakage-saturation-epsilon` — the
    [[leakage-artifact?]] candidate-eligibility guard. A **proportion** split is
    dropped when a single `nil`/blank bucket holds ≥ `:leakage-null-fraction` of the support
    *and* every non-null bucket is within `:leakage-saturation-epsilon` of the same
    `[0,1]` extreme — the signature of a dimension populated only *because* the
    outcome occurred."
  {:budget-alpha               5
   :budget-min                 15
   :budget-max                 90
   :branch-gamma               0.6
   :min-split-gain             0.01
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
;;; Proportion detection — read off the measured data
;;; ---------------------------------------------------------------------------

(defn- proportion-cells?
  "True when every numeric cell metric sits in `[0,1]`, marking the split as a
  **proportion**: within-group variance can be estimated analytically as `p(1−p)`,
  cells at a `[0,1]` extreme count as saturated, and the leakage guard applies. This
  is read straight from the measured values, so any metric whose breakout lands in
  `[0,1]` gets the proportion treatment regardless of how it is defined.

  A percentage expressed `×100` (values `0–100`) is *not* in `[0,1]` and so is
  treated as a generic additive metric — a documented limitation: it loses the
  proportion ranker, the saturation stop, and the leakage guard. Reading the
  breakout column's `:type/Percentage` could recover that case later if needed."
  [cells]
  (let [ms (into [] (keep (fn [{:keys [metric]}] (when (number? metric) (double metric))) cells))]
    (and (seq ms) (every? #(<= 0.0 % 1.0) ms))))

;;; ---------------------------------------------------------------------------
;;; Descent governance — value selection by deviation, min-support gating
;;; ---------------------------------------------------------------------------

(defn min-support-threshold
  "The descent-eligibility floor for a node with `parent-support` rows:
  `max(absolute-floor, ceil(fraction × parent-support))`. The absolute floor is
  raised for a **proportion** split (`:min-support-floor-rate`), which needs a real
  denominator before its φ² is trustworthy."
  ([parent-support] (min-support-threshold parent-support false))
  ([parent-support proportion?]
   (max (if proportion?
          (:min-support-floor-rate config)
          (:min-support-floor config))
        (long (Math/ceil (* (:min-support-fraction config) (double (or parent-support 0))))))))

(defn- saturated?
  "A proportion cell sitting within `:saturation-epsilon` of a `[0,1]` extreme (≈0
  or ≈1): the slice has no residual variation left to explain, so descending into it
  only splits noise. Applies only when the split's cells are proportions
  (`proportion?`); a metric with values outside `[0,1]` has no intrinsic extreme."
  [metric proportion?]
  (and proportion?
       (number? metric)
       (let [eps (:saturation-epsilon config)
             m   (double metric)]
         (or (<= m eps) (>= m (- 1.0 eps))))))

(defn select-child-values
  "Top-`k` child values to descend into, by **absolute deviation** of each child's
  metric from the mean of the (min-support-eligible) children — both tails, since
  a strongly-below child deviates as much as a strongly-above one. Cells below the
  min-support threshold (raised when the cells are proportions, see
  `min-support-threshold`), with a non-numeric metric, or — for a proportion split —
  already saturated at a `[0,1]` extreme (no residual variation to drill, see
  [[saturated?]]) are dropped first. Whether the split is a proportion is read from
  the cells ([[proportion-cells?]]). Ties break by stringified value, so selection
  is deterministic. Returns raw cell values (the breakout group values, ready for
  equality/`is-null` inversion)."
  [cells k]
  (let [prop?          (proportion-cells? cells)
        parent-support (reduce + 0 (keep :count cells))
        threshold      (min-support-threshold parent-support prop?)
        eligible       (filterv (fn [{:keys [count metric]}]
                                  (and count (>= count threshold) (number? metric)
                                       (not (saturated? metric prop?))))
                                cells)]
    (if (empty? eligible)
      []
      (let [mean (/ (reduce + 0.0 (map :metric eligible)) (count eligible))]
        (->> eligible
             (sort-by (juxt #(- (Math/abs (double (- (:metric %) mean))))
                            #(str (:value %))))
             (take k)
             (mapv :value))))))

;;; ---------------------------------------------------------------------------
;;; Metric aggregations — read via lib, for the definitional-axis guard
;;; ---------------------------------------------------------------------------

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
    else `:metric` (`avg`/proportion cells already are means).
  - **proportion** fast-path (no `:variance`, cells in `[0,1]` per
    [[proportion-cells?]]) — within-variance is analytic, `SS_within = N·m̄(1−m̄) −
    SS_between`, feeding the same ε². If `m̄` somehow isn't a proportion
    (`m̄(1−m̄) ≤ 0`), falls through to the rate-free form below.
  - otherwise — rate-free [[norm-weighted-variance]] `SS_between / (N·m̄²)`.

  Whether the split is a proportion is read from the cells (see
  [[proportion-cells?]]). `0.0` for a degenerate split (`k ≤ 1`, no support, or zero
  grand mean). Pure — unit-testable with hand-built cells."
  [cells]
  (let [cells (filterv (fn [{:keys [metric count]}]
                         (and (number? metric) (number? count) (pos? count)))
                       cells)
        k     (count cells)]
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

           ;; Proportion fast-path: ε² with the within-variance solved analytically.
           (proportion-cells? cells)
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
  keeps a strong `{A,B}` split and is descended. Non-proportion metrics have no
  saturated cells, so this equals the full split gain."
  [cells]
  (let [prop? (proportion-cells? cells)]
    (split-gain (into [] (remove #(saturated? (:metric %) prop?) cells)))))

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

  Scoped to **proportion** splits (cells in `[0,1]`, see [[proportion-cells?]]),
  where 'saturated' is well-defined as the proportion's extreme; a metric with
  values outside `[0,1]` has no intrinsic max/min to saturate against and is left
  untouched."
  [cells]
  (and (proportion-cells? cells)
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
    (when (and (#{:sum :avg} (first agg)) (= 3 (count agg)))
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

(defn- survivor-items
  "Build the plan items for a survivor `(metric-ctx, dim)` at `filter-path` via the
  shared `items-for-pair` construction catalog (rich variant set — `default` /
  `top-n-other` / temporal patterns / `time-facet` / transforms where eligible),
  stamped with `group-id` and the accumulating filter path. **Returns** the items;
  it does not insert anything — the caller collects them and the orchestrator
  materializes them into rows. The path is stored as `{:dimension_id :value}` pairs
  in `:params`; the runner resolves each dimension_id's target from the metric's
  mappings and applies it (so the persisted query carries its filters)."
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
  candidate split (or the single `forced` one) and pick the best by **split-gain**.
  Returns `{:node {...} :cost <executions>}` (cost = candidates measured), or nil
  when there is no categorical split to descend — the metric is still surfaced by
  the depth-1 matrix, so there is nothing to guarantee here."
  [group-id metric-ctx filter-path depth forced]
  (let [measure    (fn [c]
                     (let [cells (:cells (*measure-split* metric-ctx filter-path c))]
                       (assoc c :gain (split-gain cells) :cells cells
                              :prior (interestingness/dimension-interestingness (:dim c)))))
        candidates (if forced [forced] (remaining-candidates metric-ctx filter-path))
        measured   (mapv measure candidates)
        ;; Drop leakage / outcome artifacts before ranking — but never the forced
        ;; anchor dim (user-selected, kept by definition).
        eligible   (if forced
                     measured
                     (remove #(leakage-artifact? (:cells %)) measured))
        chosen     (cond forced        (first measured)
                         (seq eligible) (select-split eligible)
                         :else          nil)]
    (when chosen
      {:node {:group-id     group-id
              :metric-ctx   metric-ctx
              :filter-path  filter-path
              :depth        depth
              :chosen       chosen
              :gain         (double (:gain chosen))
              :descend-gain (double (descend-gain (:cells chosen)))}
       :cost (count measured)})))

;;; ---------------------------------------------------------------------------
;;; Governed best-first search
;;; ---------------------------------------------------------------------------

(defn- node-key
  "Total-order tiebreak key for the frontier — makes expansion order fully
  deterministic when gains tie (same data → same exploration)."
  [{:keys [depth filter-path metric-ctx chosen]}]
  [depth (pr-str filter-path) (:metric-id metric-ctx) (str (:dimension-id chosen))])

(defn- frontier-comparator
  "Highest split-gain first; ties broken by `node-key` so the sorted-set is a
  total order (distinct nodes never collide)."
  [a b]
  (compare [(- (:gain a)) (node-key a)]
           [(- (:gain b)) (node-key b)]))

(defn- branch-id
  "The depth-1 ancestor a node belongs to (its first filter-path step under a
  metric) — the unit the per-branch cap meters. Roots (empty path) belong to no
  branch."
  [{:keys [metric-ctx filter-path]}]
  (when (seq filter-path)
    [(:metric-id metric-ctx) (first filter-path)]))

(defn- child-nodes
  "Measure the child nodes of `node` (one per selected child value), threading the
  remaining budget so we never measure past it. Returns `{:nodes [...] :cost n}`."
  [node remaining-budget]
  (let [{:keys [group-id metric-ctx filter-path depth chosen]} node
        values (select-child-values (:cells chosen) (:k-child-values config))]
    (reduce (fn [{:keys [nodes cost] :as acc} value]
              (if (>= cost remaining-budget)
                (reduced acc)
                (let [child-path (conj (vec filter-path)
                                       {:dimension-id (:dimension-id chosen)
                                        :target       (:target chosen)
                                        :value        value})
                      measured   (measure-node group-id metric-ctx child-path (inc depth) nil)]
                  (if measured
                    {:nodes (conj nodes (:node measured)) :cost (+ cost (:cost measured))}
                    acc))))
            {:nodes [] :cost 0}
            values)))

(defn- search
  "Best-first search over a group's seed nodes, sharing one `budget` of measurement
  executions. Pops the highest-gain node, surfaces it **only when it is drilled**
  (non-empty filter path — depth-1 charts come from the matrix pass, not here), and
  expands it (descend into top-k child values) when the split's **non-saturated**
  cells still differentiate (`:descend-gain ≥ min-split-gain` — not the full `:gain`,
  which can be inflated entirely by saturated cells), depth allows, the branch is
  under its cap, and budget remains. Returns `{:items [...] :spent n}` where every
  item is a drilled (depth > 1) survivor."
  [seed-nodes seed-cost budget]
  (let [{:keys [branch-gamma max-depth min-split-gain]} config
        branch-cap (long (Math/ceil (* branch-gamma (double budget))))]
    (loop [frontier (into (sorted-set-by frontier-comparator) seed-nodes)
           spent    seed-cost
           branch   {}
           items    []]
      (if (empty? frontier)
        {:items items :spent spent}
        (let [node    (first frontier)
              rest-fr (disj frontier node)
              ;; Surface only DRILLED (non-empty filter-path) survivors here; the
              ;; depth-1 charts are owned by the full-matrix pass in `plan-group`,
              ;; so a root (empty path) is expand-only — no double-emit, no dedup.
              items+  (if (seq (:filter-path node))
                        (into items (survivor-items (:group-id node) (:metric-ctx node)
                                                    (:dim (:chosen node)) (:filter-path node)))
                        items)
              b-id    (branch-id node)
              expand? (and (>= (:descend-gain node) min-split-gain)
                           (< (:depth node) max-depth)
                           (< spent budget)
                           (or (nil? b-id) (< (get branch b-id 0) branch-cap)))]
          (if-not expand?
            (recur rest-fr spent branch items+)
            (let [{:keys [nodes cost]} (child-nodes node (- budget spent))
                  ;; attribute each child's measurement cost to its branch
                  branch' (reduce (fn [m c] (update m (branch-id c) (fnil + 0)
                                                    (/ (double cost) (max 1 (count nodes)))))
                                  branch nodes)]
              (recur (into rest-fr nodes) (+ spent cost) branch' items+))))))))

;;; ---------------------------------------------------------------------------
;;; Per-anchor seeding
;;; ---------------------------------------------------------------------------

(defn- anchor-budget
  "Per-anchor measurement-execution budget: `clamp(alpha · seed-breadth, min,
  max)`. Seed-breadth is the subject metric's candidate dims (metric anchor) or
  the metric count (dimension anchor)."
  [group anchor]
  (let [{:keys [budget-alpha budget-min budget-max]} config
        seed-breadth (case anchor
                       :metric    (transduce (map (comp count candidate-categorical-dims))
                                             max 1 (:metrics group))
                       :dimension (count (:metrics group)))]
    (-> (* budget-alpha (max 1 seed-breadth))
        (max budget-min)
        (min budget-max))))

(defn- seed-nodes
  "Measure the root node for each of the group's seeds. Metric anchor: one root per
  metric, free choice of split. Dimension anchor: one root per metric, forced to
  split on the anchor dim (falling back to free choice when the dim doesn't
  resolve). Returns `{:nodes [...] :cost n}`."
  [group anchor]
  (let [anchor-id (-> group :dimensions first :dimension-id)
        seed-of   (fn [metric-ctx]
                    (let [forced (when (= anchor :dimension)
                                   (when-let [appl (get-in metric-ctx [:applicability anchor-id])]
                                     {:dimension-id anchor-id :target (:target appl) :dim (:dim appl)}))]
                      (measure-node (:group-id group) metric-ctx [] 0 forced)))]
    (reduce (fn [acc m]
              (if-let [{:keys [node cost]} (seed-of m)]
                (-> acc (update :nodes conj node) (update :cost + cost))
                acc))
            {:nodes [] :cost 0}
            (:metrics group))))

;;; ---------------------------------------------------------------------------
;;; Planner
;;; ---------------------------------------------------------------------------

(defn- plan-group
  "Plan one group: the **full depth-1 matrix** (every applicable selected pair,
  surfaced unconditionally via the shared `group-matrix-items`) **plus** the
  gain-gated, per-anchor best-first descent, which contributes only the drilled
  (depth > 1) survivors the matrix can't express. Adaptive thus emits a strict
  superset of the mechanical planner's output."
  [group]
  (let [anchor (anchor-type group)
        budget (anchor-budget group anchor)
        {:keys [nodes cost]} (seed-nodes group anchor)]
    (into (qp.mechanical/group-matrix-items group)
          (:items (search nodes cost budget)))))

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
