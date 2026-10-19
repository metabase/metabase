(ns metabase.explorations.query-plan.mechanical-test
  "Unit tests for the mechanical planner. Hand-built `metric-dim-ctx`
  fixtures cover the variant-emission heuristics: `default` for low-cardinality
  or temporal/auto-binned dims, `top-n-other` for high-or-unknown cardinality,
  temporal dims add the pattern variants, and time-facet gates on metric
  temporal breakout + dim fingerprint."
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.query-plan.mechanical :as qp.mech]
   [metabase.explorations.query-plan.planner :as planner]))

;;; ---------------------------------------------------------------------------
;;; Fixture helpers
;;; ---------------------------------------------------------------------------

(defn- text-dim
  ([dim-id]                (text-dim dim-id nil))
  ([dim-id distinct-count] {:dimension-id   dim-id
                            :display-name   dim-id
                            :effective-type :type/Text
                            :semantic-type  :type/Category
                            :fingerprint    (when distinct-count
                                              {:global {:distinct-count distinct-count}})}))

(defn- date-dim     [dim-id] {:dimension-id dim-id :display-name dim-id :effective-type :type/Date})
(defn- datetime-dim [dim-id] {:dimension-id dim-id :display-name dim-id :effective-type :type/DateTime})
(defn- numeric-dim  [dim-id] {:dimension-id dim-id :display-name dim-id :effective-type :type/Float})

(defn- fk-dim
  "Numeric FK dim. Keys never auto-bin (the QP refuses to bin :Relation/*
  columns), so cardinality banding uses the raw distinct count."
  ([dim-id]                (fk-dim dim-id nil))
  ([dim-id distinct-count] {:dimension_id   dim-id
                            :display_name   dim-id
                            :effective_type :type/Integer
                            :semantic_type  :type/FK
                            :fingerprint    (when distinct-count
                                              {:global {:distinct-count distinct-count}})}))

(defn- metric-with-dims
  "Build a metric-context entry matching `qp.context/metric-and-dim-context`
  shape, just enough for the mechanical planner: id, applicability map,
  optional `:default-temporal-breakout-summary`, and optional `:segments`."
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

(defn- plan!
  "Convenience: dispatch the mechanical planner through its protocol on a
  single metric wrapped in a single block (block-id 1)."
  [metric]
  (planner/plan! qp.mech/planner {:metric-dim-ctx {:blocks [{:block-id 1 :metrics [metric]}]}}))

(defn- plan-blocks!
  "Dispatch the mechanical planner over explicit block contexts —
  each `{:block-id _ :metrics [metric-ctx ...]}`."
  [blocks]
  (planner/plan! qp.mech/planner {:metric-dim-ctx {:blocks blocks}}))

;;; ---------------------------------------------------------------------------
;;; Tests
;;; ---------------------------------------------------------------------------

(deftest skip-when-empty-test
  (testing "Returns :skip-not-applicable when no metric has any applicable dim"
    (let [m (metric-with-dims 1 {})
          r (plan! m)]
      (is (= :skip-not-applicable (:outcome r)))
      (is (nil? (:plan r))))))

(deftest default-eligibility-test
  (testing "default emitted for a text dim with known low cardinality"
    (let [r (plan! (metric-with-dims 1 {"a" (text-dim "a" 10)}))]
      (is (= :ok (:outcome r)))
      (is (contains? (set (map :variant (:plan r))) "default"))))
  (testing "default emitted for a text dim with known mid cardinality (21-100)"
    (let [r (plan! (metric-with-dims 1 {"a" (text-dim "a" 50)}))]
      (is (contains? (set (map :variant (:plan r))) "default"))))
  (testing "default skipped for a text dim with known high cardinality (>100)"
    (let [r (plan! (metric-with-dims 1 {"a" (text-dim "a" 500)}))]
      (is (not (contains? (set (map :variant (:plan r))) "default")))))
  (testing "default skipped for a text dim with unknown cardinality"
    (let [r (plan! (metric-with-dims 1 {"a" (text-dim "a")}))]
      (is (not (contains? (set (map :variant (:plan r))) "default")))))
  (testing "default always emitted for a temporal dim (cardinality irrelevant)"
    (let [r (plan! (metric-with-dims 1 {"d" (datetime-dim "d")}))]
      (is (contains? (set (map :variant (:plan r))) "default"))))
  (testing "default always emitted for an auto-binned numeric dim"
    (let [r (plan! (metric-with-dims 1 {"n" (numeric-dim "n")}))]
      (is (contains? (set (map :variant (:plan r))) "default")))))

(deftest temporal-pattern-emission-test
  (testing "Date dim emits default + temporal-pattern-day (no hour)"
    (let [r (plan! (metric-with-dims 1 {"d" (date-dim "d")}))]
      (is (= :ok (:outcome r)))
      (is (= #{"default" "temporal-pattern-day"}
             (set (map :variant (:plan r)))))))
  (testing "DateTime dim emits default + temporal-pattern-day + temporal-pattern-hour"
    (let [r (plan! (metric-with-dims 1 {"d" (datetime-dim "d")}))]
      (is (= :ok (:outcome r)))
      (is (= #{"default" "temporal-pattern-day" "temporal-pattern-hour"}
             (set (map :variant (:plan r))))))))

(deftest time-facet-eligibility-test
  (testing "time-facet emitted when metric has temporal breakout AND dim cardinality known and small"
    (let [r (plan! (metric-with-dims 1 {"d" (text-dim "d" 10)} true))]
      (is (contains? (set (map :variant (:plan r))) "time-facet"))))
  (testing "time-facet skipped when metric has no temporal breakout"
    (let [r (plan! (metric-with-dims 1 {"d" (text-dim "d" 10)} false))]
      (is (not (contains? (set (map :variant (:plan r))) "time-facet")))))
  (testing "time-facet skipped when dim cardinality unknown"
    (let [r (plan! (metric-with-dims 1 {"d" (text-dim "d")} true))]
      (is (not (contains? (set (map :variant (:plan r))) "time-facet")))))
  (testing "time-facet skipped when dim cardinality too high"
    (let [r (plan! (metric-with-dims 1 {"d" (text-dim "d" 100)} true))]
      (is (not (contains? (set (map :variant (:plan r))) "time-facet")))))
  (testing "time-facet ENABLED on auto-binned numeric dims (effective cardinality is bin count)"
    ;; A numeric dim like `Subtotal` has thousands of distinct values but
    ;; renders as ~8 bars after default binning, so per-bin lines stacked
    ;; over the metric's temporal axis is a perfectly reasonable chart.
    (let [r (plan! (metric-with-dims 1 {"n" (numeric-dim "n")} true))]
      (is (contains? (set (map :variant (:plan r))) "time-facet")))))

(deftest top-n-other-eligibility-test
  (testing "top-n-other emitted for a non-temporal dim with known cardinality above the threshold"
    (let [r (plan! (metric-with-dims 1 {"d" (text-dim "d" 100)}))
          items (filter #(= "top-n-other" (:variant %)) (:plan r))]
      (is (= 1 (count items)))
      (is (= {:k 10} (:params (first items))))))
  (testing "top-n-other skipped when dim is temporal"
    (let [r (plan! (metric-with-dims 1 {"d" (datetime-dim "d")}))]
      (is (not (contains? (set (map :variant (:plan r))) "top-n-other")))))
  (testing "top-n-other EMITTED when dim cardinality unknown (fail-safe — high-card without fingerprint must not fall through to unbounded default)"
    (let [r (plan! (metric-with-dims 1 {"d" (text-dim "d")}))]
      (is (contains? (set (map :variant (:plan r))) "top-n-other"))))
  (testing "top-n-other skipped when cardinality at or below the threshold (default already fits)"
    (let [r (plan! (metric-with-dims 1 {"d" (text-dim "d" 20)}))]
      (is (not (contains? (set (map :variant (:plan r))) "top-n-other")))))
  (testing "top-n-other skipped for auto-binned numeric dim (default already caps at bin count)"
    (let [r (plan! (metric-with-dims 1 {"n" (numeric-dim "n")}))]
      (is (not (contains? (set (map :variant (:plan r))) "top-n-other"))))))

(deftest numeric-key-eligibility-test
  (testing "numeric keys never auto-bin, so they band by raw distinct count like categoricals (UXW-4757)"
    (testing "high-cardinality numeric FK → top-n-other only, never the unbounded default"
      (let [r (plan! (metric-with-dims 1 {"fk" (fk-dim "fk" 1000)}))]
        (is (= #{"top-n-other"} (set (map :variant (:plan r)))))))
    (testing "unknown-cardinality numeric FK → top-n-other only (fail-safe)"
      (let [r (plan! (metric-with-dims 1 {"fk" (fk-dim "fk")}))]
        (is (= #{"top-n-other"} (set (map :variant (:plan r)))))))
    (testing "low-cardinality numeric FK (≤20) → default only"
      (let [r (plan! (metric-with-dims 1 {"fk" (fk-dim "fk" 10)}))]
        (is (= #{"default"} (set (map :variant (:plan r)))))))
    (testing "mid-cardinality numeric FK (21-100) → both"
      (let [r (plan! (metric-with-dims 1 {"fk" (fk-dim "fk" 50)}))]
        (is (= #{"default" "top-n-other"} (set (map :variant (:plan r)))))))
    (testing "numeric PK bands the same way as a numeric FK"
      (let [pk (assoc (fk-dim "pk" 1000) :semantic_type :type/PK)
            r  (plan! (metric-with-dims 1 {"pk" pk}))]
        (is (= #{"top-n-other"} (set (map :variant (:plan r)))))))
    (testing "high-cardinality numeric FK is NOT time-facet eligible — raw count, not bin count,
              is the series budget now"
      (let [r (plan! (metric-with-dims 1 {"fk" (fk-dim "fk" 1000)} true))]
        (is (not (contains? (set (map :variant (:plan r))) "time-facet")))))))

(deftest segment-fan-out-test
  (testing "Each non-time-facet variant is fanned out across [nil + segments]"
    ;; Datetime dim → 3 variants emitted (default, temporal-day, temporal-hour).
    ;; With 2 segments, expect (3 × (1 + 2)) = 9 items, all sharing (metric, dim).
    (let [m (metric-with-dims 1 {"d" (datetime-dim "d")} false
                              [{:id 100 :name "Active"} {:id 200 :name "Lapsed"}])
          r (plan! m)
          by-variant (group-by :variant (:plan r))]
      (is (= 9 (count (:plan r))))
      (is (= 3 (count (by-variant "default"))))
      (is (= 3 (count (by-variant "temporal-pattern-day"))))
      (is (= 3 (count (by-variant "temporal-pattern-hour"))))
      ;; Each variant's items cover {nil, 100, 200}
      (doseq [variant ["default" "temporal-pattern-day" "temporal-pattern-hour"]]
        (is (= #{nil 100 200}
               (set (map #(get-in % [:params :segment_id]) (by-variant variant))))))))
  (testing "time-facet is NOT fanned across segments — per-category line series is already busy"
    (let [m (metric-with-dims 1 {"d" (text-dim "d" 10)} true
                              [{:id 100 :name "Active"} {:id 200 :name "Lapsed"}])
          r (plan! m)
          facets (filter #(= "time-facet" (:variant %)) (:plan r))]
      (is (= 1 (count facets)))
      (is (nil? (get-in (first facets) [:params :segment_id])))))
  (testing "top-n-other fans across segments while preserving :k"
    (let [m (metric-with-dims 1 {"d" (text-dim "d" 100)} false
                              [{:id 100 :name "Active"}])
          r (plan! m)
          tons (filter #(= "top-n-other" (:variant %)) (:plan r))]
      (is (= 2 (count tons)))
      (is (= #{nil 100} (set (map #(get-in % [:params :segment_id]) tons))))
      (is (every? #(= 10 (get-in % [:params :k])) tons))))
  (testing "No segments → behavior matches pre-segment-fan-out output"
    (let [r (plan! (metric-with-dims 1 {"d" (datetime-dim "d")}))]
      (is (= 3 (count (:plan r))))
      (is (every? #(nil? (get-in % [:params :segment_id])) (:plan r))))))

(deftest block-id-stamped-test
  (testing "every emitted item carries its block's id"
    (let [r (plan! (metric-with-dims 1 {"d" (datetime-dim "d")}))]
      (is (= :ok (:outcome r)))
      (is (seq (:plan r)))
      (is (every? #(= 1 (:block_id %)) (:plan r))))))

(deftest within-block-scoping-test
  (testing "each block's items reference only that block's metric + dim — no cross-block pairs"
    (let [blocks [{:block-id 1 :metrics [(metric-with-dims 10 {"d1" (text-dim "d1" 10)})]}
                  {:block-id 2 :metrics [(metric-with-dims 20 {"d2" (text-dim "d2" 10)})]}]
          r        (plan-blocks! blocks)
          by-block (group-by :block_id (:plan r))]
      (is (= :ok (:outcome r)))
      (is (= #{[10 "d1"]} (set (map (juxt :metric_id :dimension_id) (by-block 1)))))
      (is (= #{[20 "d2"]} (set (map (juxt :metric_id :dimension_id) (by-block 2))))))))

(deftest duplicate-pair-across-blocks-test
  (testing "the same (metric, dim) in two blocks yields one item per block"
    (let [blocks [{:block-id 1 :metrics [(metric-with-dims 7 {"d1" (text-dim "d1" 10)})]}
                  {:block-id 2 :metrics [(metric-with-dims 7 {"d1" (text-dim "d1" 10)})]}]
          r        (plan-blocks! blocks)
          by-block (group-by :block_id (:plan r))]
      (is (= #{1 2} (set (keys by-block))) "items emitted in both blocks")
      (is (= 1 (count (by-block 1))))
      (is (= 1 (count (by-block 2))))
      (is (every? #(and (= 7 (:metric_id %)) (= "d1" (:dimension_id %))) (:plan r))))))

(deftest no-rationale-noise-test
  (testing "Mechanical items don't carry rationale strings — the variant + dim type
            already explains the choice, and a per-item rationale would be filler"
    (let [r (plan! (metric-with-dims 1 {"d" (datetime-dim "d")}))]
      (is (every? #(not (contains? % :rationale)) (:plan r)))))
  (testing "Top-level rationale is also omitted"
    (let [r (plan! (metric-with-dims 1 {"d" (datetime-dim "d")}))]
      (is (not (contains? r :rationale)))))
  (testing "Transcript still records strategy + counts"
    (let [r (plan! (metric-with-dims 1 {"a" (text-dim "a") "b" (text-dim "b")}))]
      (is (= "mechanical" (-> r :transcript :strategy)))
      (is (= 2 (-> r :transcript :n-items))))))
