(ns metabase.explorations.query-plan.adaptive-test
  "Tests for the adaptive (greedy best-first) planner.

  Issue 1 (spine): `:adaptive` augments the mechanical matrix — at depth 1 it
  emits exactly `mechanical/group-matrix-items`, so its output is identical to
  `:mechanical`. Measurement / scoring / descent tests arrive with later slices."
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.query-plan.adaptive :as qp.adaptive]
   [metabase.explorations.query-plan.mechanical :as qp.mech]
   [metabase.explorations.query-plan.planner :as planner]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]))

;;; ---------------------------------------------------------------------------
;;; Fixture helpers (mirror mechanical-test — hand-built metric-dim-ctx)
;;; ---------------------------------------------------------------------------

(defn- text-dim
  ([dim-id]                (text-dim dim-id nil))
  ([dim-id distinct-count] {:dimension_id   dim-id
                            :display_name   dim-id
                            :effective_type :type/Text
                            :semantic_type  :type/Category
                            :fingerprint    (when distinct-count
                                              {:global {:distinct-count distinct-count}})}))

(defn- datetime-dim [dim-id] {:dimension_id dim-id :display_name dim-id :effective_type :type/DateTime})
(defn- numeric-dim  [dim-id] {:dimension_id dim-id :display_name dim-id :effective_type :type/Float})

(defn- metric-with-dims
  "A metric-context entry matching `qp.context/metric-and-dim-context` shape,
  just enough for depth-1 matrix emission."
  ([metric-id dim-map] (metric-with-dims metric-id dim-map false []))
  ([metric-id dim-map metric-temporal?] (metric-with-dims metric-id dim-map metric-temporal? []))
  ([metric-id dim-map metric-temporal? segments]
   {:metric-id                         metric-id
    :default-temporal-breakout-summary (when metric-temporal? {:column "created_at" :unit "month"})
    :segments                          segments
    :applicability                     (into {}
                                             (map (fn [[did d]]
                                                    [did {:target [:field 1 nil] :dim d}]))
                                             dim-map)}))

(defn- plan-via
  "Dispatch `planner` over explicit group contexts, returning the `:plan` items."
  [planner-instance groups]
  (:plan (planner/plan! planner-instance {:metric-dim-ctx {:groups groups}})))

(defn- metric-ctx
  "A metric-context entry: `:applicability` keyed by dim-id with `{:target :dim}`.
  `dims` is a seq of dim snapshots (no card/mp, so the definitional-axis guard is
  inert — descent runs purely on the canned measurement cells)."
  [metric-id dims]
  {:metric-id     metric-id
   :applicability (into {} (for [d dims]
                             [(:dimension_id d) {:target [:field 1 nil] :dim d}]))})

;;; ---------------------------------------------------------------------------
;;; Issue 1 — :adaptive ≡ mechanical depth-1 matrix
;;; ---------------------------------------------------------------------------

(deftest depth-1-matrix-parity-test
  (testing "the adaptive planner's output is identical to the mechanical planner's"
    (let [groups [{:group-id 1 :type "metric"
                   :metrics  [(metric-with-dims 10 {"a" (text-dim "a" 8)            ; default
                                                    "b" (text-dim "b" 500)          ; top-n-other
                                                    "d" (datetime-dim "d")          ; temporal patterns
                                                    "n" (numeric-dim "n")} true)]}  ; metric temporal → facet
                  {:group-id 2 :type "metric"
                   :metrics  [(metric-with-dims 20 {"x" (text-dim "x" 12)})
                              (metric-with-dims 21 {"y" (text-dim "y" 30)})]}]]
      (is (= (plan-via qp.mech/planner groups)
             (plan-via qp.adaptive/planner groups))))))

(deftest skip-when-empty-test
  (testing "no applicable pairs → :skip-not-applicable (matches mechanical's soft exit)"
    (let [groups [{:group-id 1 :type "metric" :metrics [(metric-with-dims 1 {})]}]]
      (is (= :skip-not-applicable
             (:outcome (planner/plan! qp.adaptive/planner {:metric-dim-ctx {:groups groups}})))))))

;;; ---------------------------------------------------------------------------
;;; Issue 3 — candidate-categorical-dims (pure)
;;; ---------------------------------------------------------------------------

(deftest candidate-categorical-dims-test
  (let [m (metric-with-dims 1 {"plan"    (text-dim "plan")
                               "region"  (text-dim "region")
                               "created" (datetime-dim "created")
                               "amount"  (numeric-dim "amount")})]
    (testing "only categorical dims are candidates; temporal/numeric excluded"
      (is (= #{"plan" "region"}
             (set (map :dimension-id (qp.adaptive/candidate-categorical-dims m))))))
    (testing "each candidate carries its resolved target and dim snapshot"
      (let [c (first (filter #(= "plan" (:dimension-id %))
                             (qp.adaptive/candidate-categorical-dims m)))]
        (is (= [:field 1 nil] (:target c)))
        (is (= "plan" (-> c :dim :dimension_id))))))
  (testing "no cardinality cap — a high-cardinality categorical is still a candidate"
    (let [m (metric-with-dims 1 {"label" (text-dim "label" 5000)})]
      (is (= ["label"] (map :dimension-id (qp.adaptive/candidate-categorical-dims m)))))))

;;; ---------------------------------------------------------------------------
;;; Issue 3 — measure-split* (eager QP measurement, DB-backed)
;;; ---------------------------------------------------------------------------

(defn- sum-price-metric-query []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
        (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :products :price)))))))

(deftest measure-split-test
  (let [mp     (mt/metadata-provider)
        card   {:dataset_query (sum-price-metric-query)}
        target ["field" {} (mt/id :products :category)]
        dim    (text-dim "category")]
    (testing "cells carry :value :metric :count, one per category"
      (let [cells (:cells (#'qp.adaptive/measure-split* mp card target dim []))]
        (is (= 4 (count cells)) "products has 4 categories")
        (is (every? #(and (some? (:value %)) (number? (:metric %)) (number? (:count %))) cells))))
    (testing "a sum-of-field metric also carries per-group :variance and :group-mean"
      (let [cells (:cells (#'qp.adaptive/measure-split* mp card target dim []))]
        (is (every? #(number? (:variance %)) cells))
        (is (every? #(number? (:group-mean %)) cells))))
    (testing "a filter path scopes the measurement"
      (let [cells (:cells (#'qp.adaptive/measure-split*
                           mp card target dim
                           [{:target ["field" {} (mt/id :products :category)] :value "Gadget"}]))]
        (is (= 1 (count cells)) "filtering to category=Gadget leaves one breakout cell")
        (is (= "Gadget" (:value (first cells))))))
    (testing "a failed measurement degrades to {:cells []}"
      (is (= [] (:cells (#'qp.adaptive/measure-split* mp {:dataset_query nil} target dim [])))))))

;;; ---------------------------------------------------------------------------
;;; select-split (highest gain, deterministic tie-break)
;;; ---------------------------------------------------------------------------

(deftest select-split-test
  (testing "the highest-gain candidate wins"
    (is (= "b" (:dimension-id
                (qp.adaptive/select-split
                 [{:dimension-id "a" :gain 0.2 :prior 0.9}
                  {:dimension-id "b" :gain 0.8 :prior 0.1}
                  {:dimension-id "c" :gain 0.5 :prior 0.5}])))))
  (testing "a flat candidate (gain ~0) loses to any non-flat one"
    (is (= "live" (:dimension-id
                   (qp.adaptive/select-split
                    [{:dimension-id "flat" :gain 0.0 :prior 0.9}
                     {:dimension-id "live" :gain 0.3 :prior 0.1}])))))
  (testing "ties on gain break by split prior (desc), then dimension-id (asc) — deterministic"
    (is (= "hi-prior" (:dimension-id
                       (qp.adaptive/select-split
                        [{:dimension-id "lo-prior" :gain 0.5 :prior 0.1}
                         {:dimension-id "hi-prior" :gain 0.5 :prior 0.9}]))))
    (is (= "aaa" (:dimension-id
                  (qp.adaptive/select-split
                   [{:dimension-id "zzz" :gain 0.5 :prior 0.5}
                    {:dimension-id "aaa" :gain 0.5 :prior 0.5}])))))
  (testing "all-flat candidates still yield a deterministic winner (guaranteed output)"
    (is (= "aaa" (:dimension-id
                  (qp.adaptive/select-split
                   [{:dimension-id "zzz" :gain 0.0 :prior 0.0}
                    {:dimension-id "aaa" :gain 0.0 :prior 0.0}])))))
  (testing "nil for an empty candidate set"
    (is (nil? (qp.adaptive/select-split [])))))

(deftest min-split-gain-test
  (testing "min-split-gain is a centralized tunable in [0,1]"
    (is (number? qp.adaptive/min-split-gain))
    (is (<= 0.0 qp.adaptive/min-split-gain 1.0))))

;;; ---------------------------------------------------------------------------
;;; Issue 2 — split-gain (continuous, support-weighted effect size)
;;; ---------------------------------------------------------------------------

(deftest split-gain-degenerate-test
  (testing "k ≤ 1 → 0 (no split to differentiate)"
    (is (= 0.0 (qp.adaptive/split-gain [])))
    (is (= 0.0 (qp.adaptive/split-gain [{:value "a" :metric 100 :count 500}])))
    (is (= 0.0 (qp.adaptive/split-gain [{:value "a" :metric 0.5 :count 500}]))))
  (testing "a flat split (all cells equal) → ~0"
    (is (> 1e-9 (qp.adaptive/split-gain [{:value "a" :metric 100 :count 500}
                                         {:value "b" :metric 100 :count 500}])))
    (is (> 1e-9 (qp.adaptive/split-gain [{:value "a" :metric 0.5 :count 500}
                                         {:value "b" :metric 0.5 :count 500}]))))
  (testing "non-numeric / zero-support cells are dropped (degenerate → 0)"
    (is (= 0.0 (qp.adaptive/split-gain [{:value "a" :metric nil :count 500}
                                        {:value "b" :metric 0.5 :count 0}])))))

(deftest split-gain-strength-test
  (testing "a strong split scores well above a weak one"
    (let [strong (qp.adaptive/split-gain [{:value "a" :metric 1000 :count 500}
                                          {:value "b" :metric 10   :count 500}])
          weak   (qp.adaptive/split-gain [{:value "a" :metric 110 :count 500}
                                          {:value "b" :metric 100 :count 500}])]
      (is (> strong weak))
      (is (> strong 0.1))))
  (testing "rate effect size is bounded in [0,1] and ranks a strong split high"
    (let [strong (qp.adaptive/split-gain [{:value "a" :metric 0.9 :count 500}
                                          {:value "b" :metric 0.1 :count 500}])]
      (is (<= 0.0 strong 1.0))
      (is (> strong 0.5)))))

(deftest split-gain-support-weighting-test
  (testing "a small-n outlier barely moves a rate gain (support-weighting)"
    (let [outlier (qp.adaptive/split-gain [{:value "a"   :metric 0.5 :count 100000}
                                           {:value "b"   :metric 0.5 :count 100000}
                                           {:value "out" :metric 1.0 :count 3}])
          genuine (qp.adaptive/split-gain [{:value "a" :metric 0.55 :count 5000}
                                           {:value "b" :metric 0.45 :count 5000}])]
      (is (> 0.01 outlier))
      (is (> genuine (* 10 outlier)))))
  (testing "a large-n modest rate effect outranks a small-n wild one"
    (let [modest-large (qp.adaptive/split-gain [{:value "a" :metric 0.55 :count 5000}
                                                {:value "b" :metric 0.45 :count 5000}])
          wild-small   (qp.adaptive/split-gain [{:value "a" :metric 0.50 :count 9970}
                                                {:value "b" :metric 1.00 :count 30}])]
      (is (> modest-large wild-small)))))

(deftest split-gain-rate-fallback-test
  (testing "a rate metric whose cells aren't proportions (mis-scaled) degrades to the
            scale-free form instead of NaN, preserving a sane ranking"
    (let [strong (qp.adaptive/split-gain [{:value "a" :metric 90 :count 500}
                                          {:value "b" :metric 10 :count 500}])
          weak   (qp.adaptive/split-gain [{:value "a" :metric 52 :count 500}
                                          {:value "b" :metric 48 :count 500}])]
      (is (not (Double/isNaN strong)))
      (is (> strong weak)))))

(deftest split-gain-regression-263-test
  (testing "exploration 263 (signup-completion rate): live funnel-native cells re-rank
            on the per-df effect-size scale — OS sinks below Browser, OS gain ≈ 0.020,
            Step (no cells) is 0"
    (let [os      [{:value "Android" :metric 0.7706093189964157 :count 10109}
                   {:value "iOS"     :metric 0.7184865712605372 :count 30375}
                   {:value "Linux"   :metric 0.7745297407219115 :count 23790}
                   {:value "macOS"   :metric 0.752420470262794  :count 95591}
                   {:value "Windows" :metric 0.7725474282235974 :count 118934}]
          browser [{:value "Chrome"  :metric 0.768671536988439  :count 169844}
                   {:value "Edge"    :metric 0.7780556423882463 :count 19457}
                   {:value "Firefox" :metric 0.7831441680753441 :count 25078}
                   {:value "Other"   :metric 0.7756410256410257 :count 5655}
                   {:value "Safari"  :metric 0.7170979198376457 :count 58765}]
          g-os      (qp.adaptive/split-gain os)
          g-browser (qp.adaptive/split-gain browser)
          g-step    (qp.adaptive/split-gain [])]
      (is (< 0.019 g-os 0.021)                "OS per-df gain matches the validated ~0.020")
      (is (> g-os qp.adaptive/min-split-gain) "OS clears the descent floor (a real effect)")
      (is (< g-os g-browser)                  "OS ranks below Browser")
      (is (= 0.0 g-step)                      "Step — the metric's own filter axis — has no split, 0"))))

(deftest split-gain-cardinality-bias-test
  (testing "ε² removes degrees-of-freedom inflation: a high-cardinality noise split
            does not out-rank a genuine low-cardinality effect"
    (let [real-low-k   [{:value "a" :metric 0.80 :count 5000}
                        {:value "b" :metric 0.66 :count 5000}]
          noise-high-k (mapv (fn [i] {:value  (str i)
                                      :metric (+ 0.73 (* 0.002 (- (mod i 5) 2)))
                                      :count  300})
                             (range 40))
          g-real  (qp.adaptive/split-gain real-low-k)
          g-noise (qp.adaptive/split-gain noise-high-k)]
      (is (> g-real g-noise)             "the genuine k=2 effect outranks the k=40 noise")
      (is (> 0.001 g-noise)              "the high-cardinality noise split collapses to ~0")
      (is (< g-noise qp.adaptive/min-split-gain) "and falls below the descent floor")))
  (testing "adding null groups does not manufacture gain under the null"
    (let [base   [{:value "a" :metric 0.50 :count 1000} {:value "b" :metric 0.50 :count 1000}]
          padded (into base (for [i (range 30)] {:value (str "z" i) :metric 0.50 :count 1000}))]
      (is (> 1e-9 (qp.adaptive/split-gain base)))
      (is (> 1e-9 (qp.adaptive/split-gain padded)))))
  (testing "a granular dimension that merely NESTS a coarse one's signal loses to the
            coarse dimension — the per-df normalization is what flips this"
    (let [region  [{:value "Europe"   :metric 0.60 :count 8000}
                   {:value "APAC"     :metric 0.75 :count 8000}
                   {:value "Americas" :metric 0.78 :count 8000}
                   {:value "MEA"      :metric 0.80 :count 8000}]
          country (vec (for [{:keys [value metric]} region, c (range 4)]
                         {:value (str value "-" c) :metric metric :count 2000}))
          g-region  (qp.adaptive/split-gain region)
          g-country (qp.adaptive/split-gain country)]
      (is (> g-region g-country)              "Region (k=4) outranks Country (k=16) nesting it")
      (is (> g-region qp.adaptive/min-split-gain)))))

(deftest split-gain-measured-variance-test
  (testing "with measured within-group variance, gain is sqrt(ε²/(k−1)) — bias-corrected, per-df"
    (let [cells [{:value "a" :metric 600 :count 500 :variance 400}
                 {:value "b" :metric 400 :count 500 :variance 400}]
          ss-b 1.0e7, ss-w 4.0e5, n 1000.0, k 2
          eps2     (/ (- ss-b (* (dec k) (/ ss-w (- n k)))) (+ ss-b ss-w))
          expected (Math/sqrt (/ eps2 (double (dec k))))
          gain (qp.adaptive/split-gain cells)]
      (is (<= 0.0 gain 1.0) "the gain is bounded in [0,1]")
      (is (< (Math/abs (double (- gain expected))) 1e-9) "gain matches sqrt(ε²/(k−1))")))
  (testing "a null / missing per-group variance contributes 0 to SS_within"
    (let [cells [{:value "a" :metric 10 :count 100 :variance 0.0}
                 {:value "b" :metric 20 :count 1   :variance nil}]]
      (is (number? (qp.adaptive/split-gain cells)))
      (is (<= 0.0 (qp.adaptive/split-gain cells) 1.0))))
  (testing "for sum metrics, SS_between is taken around the measured :group-mean"
    (let [flat-means [{:value "a" :metric 1000 :group-mean 50 :count 20  :variance 100}
                      {:value "b" :metric 5000 :group-mean 50 :count 100 :variance 100}]
          real-split [{:value "a" :metric 1000 :group-mean 50 :count 20  :variance 100}
                      {:value "b" :metric 5000 :group-mean 90 :count 100 :variance 100}]
          g-flat (qp.adaptive/split-gain flat-means)
          g-real (qp.adaptive/split-gain real-split)]
      (is (> 1e-9 g-flat) "equal group means ⇒ ~0 gain despite very different totals")
      (is (> g-real 0.1)  "a real difference in per-row means scores well")
      (is (<= 0.0 g-real 1.0)))))

(deftest split-gain-negative-zero-crossing-test
  (testing "a profit-like additive metric whose group means straddle 0 ranks sanely on η²"
    (let [straddle [{:value "A" :metric -50 :count 500 :variance 400}
                    {:value "B" :metric  60 :count 500 :variance 500}
                    {:value "C" :metric  -5 :count 500 :variance 450}]
          flat     [{:value "A" :metric -5 :count 500 :variance 450}
                    {:value "B" :metric -4 :count 500 :variance 450}
                    {:value "C" :metric -5 :count 500 :variance 450}]
          eta2-straddle (qp.adaptive/split-gain straddle)
          eta2-flat     (qp.adaptive/split-gain flat)
          nwv-straddle  (qp.adaptive/split-gain (mapv #(dissoc % :variance) straddle))]
      (is (<= 0.0 eta2-straddle 1.0)  "η² is finite and bounded across zero")
      (is (> eta2-straddle eta2-flat) "a real straddle outranks a flat split")
      (is (> nwv-straddle 1.0)        "the NWV fallback would blow past 1 on the same cells"))))

(deftest split-gain-phi2-eta2-identity-test
  (testing "for a 0/1 outcome, the analytic rate φ² equals the measured η² with
            within-variance = p(1−p)"
    (let [rate-cells [{:value "a" :metric 0.9 :count 500}
                      {:value "b" :metric 0.1 :count 500}
                      {:value "c" :metric 0.6 :count 1500}]
          measured   (mapv (fn [{:keys [metric] :as c}]
                             (assoc c :variance (* metric (- 1.0 metric))))
                           rate-cells)
          analytic-phi2 (qp.adaptive/split-gain rate-cells)
          measured-eta2 (qp.adaptive/split-gain measured)]
      (is (< (Math/abs (double (- analytic-phi2 measured-eta2))) 1e-12)
          "φ² (analytic Bernoulli within-variance) == η² (measured within-variance)"))))

(deftest split-gain-graceful-fallback-test
  (testing "without a :variance field: rate fast-path forms analytic ε², non-rate falls
            back to the rate-free normalized weighted variance"
    (let [rate-cells [{:value "a" :metric 0.9 :count 500} {:value "b" :metric 0.1 :count 500}]
          add-cells  [{:value "a" :metric 1000 :count 500} {:value "b" :metric 10 :count 500}]
          eps2       (/ (- 160.0 (/ 90.0 998.0)) 250.0)
          expected   (Math/sqrt eps2)]
      (is (< (Math/abs (double (- (qp.adaptive/split-gain rate-cells) expected))) 1e-9)
          "rate fast-path returns sqrt(analytic ε²) ≈ 0.800")
      (is (> (qp.adaptive/split-gain add-cells) 0.1)
          "additive NWV fallback still ranks a strong split well"))))

;;; ---------------------------------------------------------------------------
;;; definitional-axis exclusion
;;; ---------------------------------------------------------------------------

(deftest definitional-dim-test
  ;; A `share(category = "Gadget")` rate is *defined on* products.category, so
  ;; splitting it by category is a tautology and must be dropped from descent.
  (let [mp        (mt/metadata-provider)
        category  (lib.metadata/field mp (mt/id :products :category))
        metric-q  (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                      (lib/aggregate (lib/share (lib/= category "Gadget"))))
        defn-cols (#'qp.adaptive/metric-definitional-columns
                   {:mp mp :card {:dataset_query metric-q}})]
    (testing "metric-definitional-columns reads the aggregation's columns via lib"
      (is (= [(mt/id :products :category)] (map :id defn-cols))))
    (testing "the metric's defining field is a definitional axis (excluded from descent)"
      (is (true? (#'qp.adaptive/definitional-dim?
                  defn-cols {:target [:field {} (mt/id :products :category)]}))))
    (testing "a JSON-snapshotted target with a STRING \"field\" tag must still match"
      (is (true? (#'qp.adaptive/definitional-dim?
                  defn-cols {:target ["field" {:base-type "type/Text"} (mt/id :products :category)]}))))
    (testing "any other field is not a definitional axis"
      (is (false? (#'qp.adaptive/definitional-dim?
                   defn-cols {:target [:field {} (mt/id :products :vendor)]}))))
    (testing "no defining columns → nothing is definitional"
      (is (false? (#'qp.adaptive/definitional-dim?
                   [] {:target [:field {} (mt/id :products :category)]}))))))

;;; ---------------------------------------------------------------------------
;;; Issue 5 — descent governance: min-support + deviation value selection
;;; ---------------------------------------------------------------------------

(deftest min-support-threshold-test
  (testing "max(absolute floor, ceil(fraction * parent-support))"
    (is (= 50 (qp.adaptive/min-support-threshold 1000)) "floor dominates on small parents")
    (is (= 100 (qp.adaptive/min-support-threshold 10000)) "fraction dominates on big parents"))
  (testing "proportion splits get a raised absolute floor (a proportion needs a real denominator)"
    (is (= 200 (qp.adaptive/min-support-threshold 1000 true)) "proportion floor dominates")
    (is (= 50  (qp.adaptive/min-support-threshold 1000 false)) "non-proportion floor unchanged")
    (is (= 300 (qp.adaptive/min-support-threshold 30000 true)) "fraction still dominates a huge parent")))

(deftest select-child-values-test
  (let [cells [{:value "a" :metric 100 :count 200}
               {:value "b" :metric 900 :count 200}
               {:value "c" :metric 500 :count 200}
               {:value "d" :metric 100 :count 5}]]
    (testing "top-k by absolute deviation from the eligible mean"
      (is (= #{"a" "b"} (set (qp.adaptive/select-child-values cells 2)))))
    (testing "both tails: a strongly-below child is as selectable as a strongly-above one"
      (let [cs [{:value "lo" :metric 10  :count 200}
                {:value "mid" :metric 500 :count 200}
                {:value "hi" :metric 990 :count 200}]]
        (is (= #{"lo" "hi"} (set (qp.adaptive/select-child-values cs 2))))))
    (testing "min-support gating excludes low-count cells"
      (is (not (contains? (set (qp.adaptive/select-child-values cells 4)) "d"))))
    (testing "no eligible cells → empty"
      (is (= [] (qp.adaptive/select-child-values [{:value "x" :metric 1 :count 1}] 2))))))

(deftest select-child-values-saturation-stop-test
  (testing "rate: cells saturated at a [0,1] extreme are not descended into"
    (let [cells [{:value "data_loss"     :metric 1.0   :count 406}
                 {:value "mysql_perf"    :metric 1.0   :count 748}
                 {:value "pricing"       :metric 0.327 :count 1351}
                 {:value "value"         :metric 0.0   :count 591}
                 {:value "documentation" :metric 0.0   :count 972}]]
      (is (= ["pricing"] (qp.adaptive/select-child-values cells 2)))))
  (testing "a strong-but-real cell (0.95, outside the saturation epsilon) is still descended"
    (let [cells [{:value "cluster" :metric 0.95 :count 500}
                 {:value "rest"    :metric 0.30 :count 500}]]
      (is (= #{"cluster" "rest"} (set (qp.adaptive/select-child-values cells 2))))))
  (testing "a non-proportion metric (values outside [0,1]) has no intrinsic extreme — saturation does not apply"
    (let [cells [{:value "a" :metric 1000 :count 500}
                 {:value "b" :metric 200  :count 500}]]
      (is (= #{"a" "b"} (set (qp.adaptive/select-child-values cells 2)))))))

(deftest descend-gain-test
  (testing "descend-gain is the split gain over only the NON-saturated cells"
    (let [cells [{:value "data_loss" :metric 1.0   :count 406}
                 {:value "mysql"     :metric 1.0   :count 748}
                 {:value "pricing"   :metric 0.327 :count 1351}
                 {:value "value"     :metric 0.0   :count 591}]]
      (is (> (qp.adaptive/split-gain cells) qp.adaptive/min-split-gain)
          "the FULL split gain is high (the saturated cells make it look differentiating)")
      (is (< (#'qp.adaptive/descend-gain cells) qp.adaptive/min-split-gain)
          "but descend-gain collapses below the floor — no real driver to drill")))
  (testing "a genuine split keeps its gain — saturated cells removed, the real tails remain"
    (let [cells [{:value "A" :metric 0.7 :count 500}
                 {:value "B" :metric 0.1 :count 500}
                 {:value "C" :metric 1.0 :count 500}]]
      (is (>= (#'qp.adaptive/descend-gain cells) qp.adaptive/min-split-gain)
          "the non-saturated {A,B} split still differentiates → descend")))
  (testing "additive metrics: nothing is saturated, descend-gain == full split gain"
    (let [cells [{:value "a" :metric 1000 :count 500}
                 {:value "b" :metric 10   :count 500}]]
      (is (== (#'qp.adaptive/descend-gain cells)
              (qp.adaptive/split-gain cells))))))

;;; ---------------------------------------------------------------------------
;;; Issue 5 — plan! orchestration: depth-1 matrix + drilled descent (canned cells)
;;; ---------------------------------------------------------------------------

(defn- plan-groups!
  "Dispatch the adaptive planner over explicit group contexts. `cells-by-dim` maps
  dimension-id → canned measurement cells (injected via the *measure-split* seam)."
  [groups cells-by-dim]
  (binding [qp.adaptive/*measure-split* (fn [_metric-ctx _filter-path candidate]
                                          {:cells (get cells-by-dim (:dimension-id candidate) [])})]
    (planner/plan! qp.adaptive/planner {:metric-dim-ctx {:groups groups}})))

(deftest plan-metric-anchor-test
  (testing "a metric-anchored group surfaces EVERY selected dim at depth 1 (full matrix),
            even the flat/boring one — the loser is not discarded"
    (let [group {:group-id 1 :type "metric"
                 :metrics [(metric-ctx 10 [(text-dim "plan" 5) (text-dim "region" 5)])]}
          {:keys [outcome plan]} (plan-groups! [group]
                                               {"region" [{:value "x" :metric 1000 :count 5}
                                                          {:value "y" :metric 10 :count 5}]
                                                "plan"   [{:value "x" :metric 100 :count 5}
                                                          {:value "y" :metric 100 :count 5}]})]
      (is (= :ok outcome))
      (is (= #{"region" "plan"} (set (map :dimension_id plan)))
          "both selected dims surfaced — the flat 'plan' dim is NOT discarded")
      (is (every? #(empty? (get-in % [:params :filter_path])) plan)
          "all items are depth-1 matrix charts (no descent — sub-floor support)")
      (is (every? #(= 1 (:group_id %)) plan) "items stamped with group id")
      (is (every? #(= 10 (:metric_id %)) plan))
      (is (contains? (set (map :variant plan)) "default")
          "rendered via items-for-pair (rich variant set)"))))

(defn- plan-with-measure!
  "Dispatch the planner with a fully-injected `*measure-split*` (cells), so ranking
  and descent run deterministically without the QP."
  [groups measure-fn]
  (binding [qp.adaptive/*measure-split* measure-fn]
    (planner/plan! qp.adaptive/planner {:metric-dim-ctx {:groups groups}})))

(deftest descent-accumulates-filter-path-test
  (testing "the loop descends into top-k child values, accumulating a filter path"
    (let [group {:group-id 1 :type "metric"
                 :metrics [(metric-ctx 10 [(text-dim "A" 5) (text-dim "B" 5)])]}
          measure (fn [_ _ c]
                    (case (:dimension-id c)
                      "A" {:cells [{:value "a1" :metric 1000 :count 200}
                                   {:value "a2" :metric 10   :count 200}]}
                      "B" {:cells [{:value "b1" :metric 5 :count 200}]}))
          {:keys [outcome plan]} (plan-with-measure! [group] measure)
          depth1  (filter #(empty? (get-in % [:params :filter_path])) plan)
          drilled (filter #(seq (get-in % [:params :filter_path])) plan)]
      (is (= :ok outcome))
      (testing "the depth-1 matrix surfaces BOTH selected dims (A and B), empty filter path"
        (is (= #{"A" "B"} (set (map :dimension_id depth1)))))
      (testing "drilled survivors carry an accumulating equality filter path (dim = value)"
        (is (= #{[{:dimension_id "A" :value "a1"}] [{:dimension_id "A" :value "a2"}]}
               (set (map #(get-in % [:params :filter_path]) drilled)))))
      (testing "the drilled split is the remaining dimension B (A is already in the path)"
        (is (every? #(= "B" (:dimension_id %)) drilled)))
      (testing "B does not descend further (its gain is below the floor)"
        (is (not-any? #(< 1 (count (get-in % [:params :filter_path]))) plan))))))

;;; ---------------------------------------------------------------------------
;;; Issue 6 — leakage / artifact split exclusion
;;; ---------------------------------------------------------------------------

(def ^:private region-263-artifact
  "Real measured cells from exploration 263 (signup-completion rate): an account-attribute
  'Region' recorded only once a signup completes — a single dominant nil bucket plus
  non-null buckets all saturated at 100%. A leakage artifact."
  [{:value "APAC"          :metric 1.0                :count 3594}
   {:value "Europe"        :metric 1.0                :count 6378}
   {:value "LATAM"         :metric 1.0                :count 1440}
   {:value "North America" :metric 1.0                :count 8579}
   {:value nil             :metric 0.7307152535811072 :count 258808}])

(def ^:private region-263-funnel-native
  "Real measured cells from exploration 263 for the *other*, funnel-native 'Region' dim:
  real values at intermediate rates, full support, no dominant null. A real effect."
  [{:value "APAC"          :metric 0.7688280785246877 :count 50605}
   {:value "Europe"        :metric 0.7499491904342525 :count 88416}
   {:value "LATAM"         :metric 0.775391224301933  :count 19550}
   {:value "North America" :metric 0.7607013665594855 :count 120228}])

(deftest leakage-artifact-test
  (testing "the artifact (null-bucket-dominant + non-null saturated at 1.0) is flagged"
    (is (true? (qp.adaptive/leakage-artifact? region-263-artifact))))
  (testing "it ranks above the funnel-native dim by split-gain — so it must be excluded BEFORE ranking"
    (is (> (qp.adaptive/split-gain region-263-artifact)
           (qp.adaptive/split-gain region-263-funnel-native))))
  (testing "the funnel-native Region (real values, no dominant null) is NOT flagged"
    (is (false? (qp.adaptive/leakage-artifact? region-263-funnel-native))))
  (testing "a non-proportion metric (values outside [0,1]) is never flagged — no extreme to saturate against"
    (is (false? (qp.adaptive/leakage-artifact?
                 [{:value nil :metric 7300 :count 250000}
                  {:value "a" :metric 10000 :count 3000}])))))

(deftest leakage-artifact-false-positive-guard-test
  (testing "a genuinely rare-but-real minority bucket (intermediate rate) is NOT excluded"
    (is (false? (qp.adaptive/leakage-artifact?
                 [{:value nil :metric 0.73 :count 250000}
                  {:value "VIP" :metric 0.92 :count 3000}]))))
  (testing "null bucket not dominant → not an artifact"
    (is (false? (qp.adaptive/leakage-artifact?
                 [{:value nil :metric 0.5 :count 4000}
                  {:value "a" :metric 1.0 :count 6000}]))))
  (testing "no null bucket at all → not an artifact"
    (is (false? (qp.adaptive/leakage-artifact?
                 [{:value "a" :metric 1.0 :count 100}
                  {:value "b" :metric 1.0 :count 100}]))))
  (testing "non-null saturated at the LOW extreme also counts (present ⟹ never converts)"
    (is (true? (qp.adaptive/leakage-artifact?
                [{:value nil :metric 0.27 :count 250000}
                 {:value "a" :metric 0.0 :count 3000}
                 {:value "b" :metric 0.0 :count 3000}]))))
  (testing "non-null split across BOTH extremes is a real differentiator, not an artifact"
    (is (false? (qp.adaptive/leakage-artifact?
                 [{:value nil :metric 0.5 :count 250000}
                  {:value "a" :metric 0.0 :count 3000}
                  {:value "b" :metric 1.0 :count 3000}]))))
  (testing "a blank-string bucket is treated as null"
    (is (true? (qp.adaptive/leakage-artifact?
                [{:value "" :metric 0.73 :count 250000}
                 {:value "a" :metric 1.0 :count 3000}])))))

(deftest leakage-artifact-excluded-from-root-split-test
  (testing "a leakage-artifact dim that ranks #1 by gain never roots the search; a real
            funnel-native dim roots and is descended, and the artifact is in no filter path"
    (let [group {:group-id 1 :type "metric"
                 :metrics [(metric-ctx 10 [(text-dim "region" 5) (text-dim "browser" 5) (text-dim "plan" 5)])]}
          measure (fn [_ _ c]
                    (case (:dimension-id c)
                      "region"  {:cells [{:value nil    :metric 0.731 :count 250000}
                                         {:value "APAC" :metric 1.0   :count 3000}
                                         {:value "EU"   :metric 1.0   :count 3000}]}
                      "browser" {:cells [{:value "Chrome"  :metric 0.768671536988439  :count 169844}
                                         {:value "Edge"    :metric 0.7780556423882463 :count 19457}
                                         {:value "Firefox" :metric 0.7831441680753441 :count 25078}
                                         {:value "Safari"  :metric 0.7170979198376457 :count 58765}]}
                      "plan"    {:cells [{:value "Pro"  :metric 0.74 :count 50000}
                                         {:value "Free" :metric 0.72 :count 50000}]}))
          {:keys [outcome plan]} (plan-with-measure! [group] measure)
          drilled (filter #(seq (get-in % [:params :filter_path])) plan)]
      (is (= :ok outcome))
      (is (seq drilled) "the real split descended (the guard didn't starve the search)")
      (testing "the artifact 'region' never roots — every descent path starts with browser"
        (is (every? #(= "browser" (-> % (get-in [:params :filter_path]) first :dimension_id))
                    drilled)))
      (testing "the artifact 'region' is descended into nowhere — it is in no filter path"
        (is (not-any? (fn [item] (some #(= "region" (:dimension_id %))
                                       (get-in item [:params :filter_path])))
                      plan))))))

;;; ---------------------------------------------------------------------------
;;; Issue 7 — anchors + governed best-first search
;;; ---------------------------------------------------------------------------

(deftest anchor-type-test
  (testing "anchor type is read from the persisted :type"
    (is (= :metric    (qp.adaptive/anchor-type {:type "metric"})))
    (is (= :dimension (qp.adaptive/anchor-type {:type "dimension"}))))
  (testing "a missing / unrecognized :type throws (legacy type-less groups unsupported)"
    (is (thrown? clojure.lang.ExceptionInfo (qp.adaptive/anchor-type {:type nil})))
    (is (thrown? clojure.lang.ExceptionInfo (qp.adaptive/anchor-type {})))))

(deftest config-centralized-test
  (testing "all tunables live in one config map"
    (is (every? qp.adaptive/config
                [:budget-alpha :budget-min :budget-max :branch-gamma :max-depth
                 :min-support-floor :min-support-floor-rate :min-support-fraction
                 :k-child-values :min-split-gain
                 :leakage-null-fraction :leakage-saturation-epsilon
                 :saturation-epsilon]))))

(defn- n-dim-metric [metric-id n]
  (metric-ctx metric-id (map #(text-dim (str "d" %) 5) (range n))))

(def ^:private always-expand
  "A measurement that always wants to descend: a high-gain split with two
  strongly-deviating, min-support-eligible children."
  (fn [_ _ _] {:cells [{:value "x" :metric 1000 :count 200}
                       {:value "y" :metric 0    :count 200}]}))

(deftest budget-bounds-executions-test
  (testing "total measurement executions per anchor are bounded by the budget"
    (let [calls   (atom 0)
          measure (fn [a b c] (swap! calls inc) (always-expand a b c))
          group   {:group-id 1 :type "metric" :metrics [(n-dim-metric 10 6)]}
          ;; budget = clamp(5*6, 15, 90) = 30
          {:keys [outcome]} (plan-with-measure! [group] measure)]
      (is (= :ok outcome))
      (is (<= @calls 36)
          (str "executions (" @calls ") bounded by budget (30) + one node's overshoot"))
      (is (< @calls 80)
          "and far below the unbounded depth-5 k-2 tree (~120 executions)"))))

(deftest per-branch-cap-prevents-tunneling-test
  (testing "a single greedy branch cannot consume the whole budget — the other branch is still explored"
    (with-redefs [qp.adaptive/config (assoc qp.adaptive/config
                                            :budget-alpha 100 :budget-min 40 :budget-max 40
                                            :branch-gamma 0.4 :max-depth 8)]
      (let [measure (fn [_ filter-path _]
                      (let [root-val (some-> filter-path first :value)
                            cells    (if (= root-val "lo")
                                       [{:value "hi" :metric 600  :count 300}
                                        {:value "lo" :metric 400  :count 300}]
                                       [{:value "hi" :metric 1000 :count 300}
                                        {:value "lo" :metric 0    :count 300}])]
                        {:cells cells}))
            group   {:group-id 1 :type "metric" :metrics [(n-dim-metric 10 6)]}
            {:keys [plan]} (plan-with-measure! [group] measure)
            descended-past-1 (fn [pred]
                               (some #(and (pred (-> % (get-in [:params :filter_path]) first :value))
                                           (> (count (get-in % [:params :filter_path])) 1))
                                     plan))]
        (is (descended-past-1 #{"lo"})
            "the lower-gain branch is still descended past depth 1 (the greedy hi branch hit its cap)")))))

(deftest reproducibility-test
  (testing "same data → same exploration (deterministic frontier order)"
    (let [group {:group-id 1 :type "metric" :metrics [(n-dim-metric 10 4)]}
          run   #(:plan (plan-with-measure! [group] always-expand))]
      (is (= (run) (run)) "identical plan items, in identical order, across runs"))))

(deftest min-support-terminates-before-budget-test
  (testing "branches starve at min-support — high gain but no eligible children means no descent"
    (let [calls   (atom 0)
          measure (fn [_ _ _] (swap! calls inc)
                    {:cells [{:value "x" :metric 1000 :count 5}
                             {:value "y" :metric 0    :count 5}]})
          group   {:group-id 1 :type "metric" :metrics [(n-dim-metric 10 6)]}
          {:keys [plan]} (plan-with-measure! [group] measure)]
      (is (every? #(empty? (get-in % [:params :filter_path])) plan)
          "no survivor is drilled — children never clear min-support")
      (is (<= @calls 6) "search stops after seeding (6 candidate measurements), well under budget"))))

(deftest plan-dimension-anchor-test
  (testing "a dimension-anchored group surfaces every metric through the forced anchor dim"
    (let [x     (text-dim "plan" 5)
          group {:group-id 2 :type "dimension"
                 :dimensions [{:dimension-id "plan" :dim x}]
                 :metrics [(metric-ctx 10 [x]) (metric-ctx 20 [x])]}
          {:keys [outcome plan]} (plan-groups! [group] {})]
      (is (= :ok outcome))
      (is (= #{10 20} (set (map :metric_id plan))) "one survivor per metric")
      (is (every? #(= "plan" (:dimension_id %)) plan) "all forced onto the anchor dim")
      (is (every? #(= 2 (:group_id %)) plan)))))
