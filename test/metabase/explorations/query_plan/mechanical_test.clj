(ns metabase.explorations.query-plan.mechanical-test
  "Unit tests for the mechanical planner. Hand-built `metric-dim-ctx`
  fixtures cover the variant-emission heuristics: every applicable pair
  gets a `default`, temporal dims add the pattern variants, and the
  time-facet variant gates on metric temporal breakout + dim fingerprint."
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.query-plan.mechanical :as qp.mech]
   [metabase.explorations.query-plan.planner :as planner]))

;;; ---------------------------------------------------------------------------
;;; Fixture helpers
;;; ---------------------------------------------------------------------------

(defn- text-dim
  ([dim-id]                (text-dim dim-id nil))
  ([dim-id distinct-count] {:dimension_id   dim-id
                            :display_name   dim-id
                            :effective_type "type/Text"
                            :semantic_type  "type/Category"
                            :fingerprint    (when distinct-count
                                              {:global {:distinct-count distinct-count}})}))

(defn- date-dim     [dim-id] {:dimension_id dim-id :display_name dim-id :effective_type "type/Date"})
(defn- datetime-dim [dim-id] {:dimension_id dim-id :display_name dim-id :effective_type "type/DateTime"})
(defn- numeric-dim  [dim-id] {:dimension_id dim-id :display_name dim-id :effective_type "type/Float"})

(defn- metric-with-dims
  "Build a metric-context entry matching `qp.context/metric-and-dim-context`
  shape, just enough for the mechanical planner: id, applicability map,
  and optional `:default-temporal-breakout`."
  ([metric-id dim-map]                   (metric-with-dims metric-id dim-map false))
  ([metric-id dim-map metric-temporal?]
   {:metric-id                 metric-id
    :default-temporal-breakout (when metric-temporal? {:column "created_at" :unit "month"})
    :applicability             (into {}
                                     (map (fn [[did d]]
                                            [did {:target [:field 1 nil] :dim d}]))
                                     dim-map)}))

(defn- plan!
  "Convenience: dispatch the mechanical planner through its protocol on a
  single-metric context."
  [metric]
  (planner/plan! qp.mech/planner {:metric-dim-ctx {:metrics [metric]}}))

;;; ---------------------------------------------------------------------------
;;; Tests
;;; ---------------------------------------------------------------------------

(deftest skip-when-empty-test
  (testing "Returns :skip-not-applicable when no metric has any applicable dim"
    (let [m (metric-with-dims 1 {})
          r (plan! m)]
      (is (= :skip-not-applicable (:outcome r)))
      (is (nil? (:plan r))))))

(deftest default-per-pair-test
  (testing "Every applicable (metric, dim) pair gets a default item"
    (let [r (plan! (metric-with-dims 1 {"a" (text-dim "a") "b" (text-dim "b")}))]
      (is (= :ok (:outcome r)))
      (is (= 2 (count (:plan r))))
      (is (every? #(= "default" (:variant %)) (:plan r)))
      (is (= #{"a" "b"} (set (map :dimension_id (:plan r))))))))

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

  (testing "top-n-other skipped when dim cardinality unknown"
    (let [r (plan! (metric-with-dims 1 {"d" (text-dim "d")}))]
      (is (not (contains? (set (map :variant (:plan r))) "top-n-other")))))

  (testing "top-n-other skipped when cardinality at or below the threshold (default already fits)"
    (let [r (plan! (metric-with-dims 1 {"d" (text-dim "d" 20)}))]
      (is (not (contains? (set (map :variant (:plan r))) "top-n-other")))))

  (testing "top-n-other skipped for auto-binned numeric dim (default already caps at bin count)"
    (let [r (plan! (metric-with-dims 1 {"n" (numeric-dim "n")}))]
      (is (not (contains? (set (map :variant (:plan r))) "top-n-other"))))))

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
