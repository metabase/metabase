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
   [metabase.explorations.query-plan.mechanical :as qp.mechanical]
   [metabase.explorations.query-plan.planner :as planner]))

(set! *warn-on-reflection* true)

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
    splits; min-support (a later slice) is the real terminator. Does not suppress
    surfacing."
  {:min-split-gain 0.01})

(def min-split-gain
  "The `split-gain` floor (see `config`). A var so call sites / tests read it
  directly; the source of truth is `config`."
  (:min-split-gain config))

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

(defn- plan-group
  "Plan one group: the full depth-1 matrix (every applicable selected pair,
  surfaced unconditionally via the shared `group-matrix-items`). Later slices
  append gain-gated descent survivors here."
  [group]
  (qp.mechanical/group-matrix-items group))

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
