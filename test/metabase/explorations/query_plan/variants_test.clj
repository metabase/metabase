(ns ^:mb/driver-tests metabase.explorations.query-plan.variants-test
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.query-plan.variants :as variants]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(defn- products-count-card
  "Hand-built `:card` ctx — a count metric on PRODUCTS. The variant only
  reads `:id` (for the discovery cache key) and `:dataset_query`, so no real
  Card row is needed."
  [card-id]
  {:id            card-id
   :dataset_query (lib/->legacy-MBQL
                   (-> (lib/query (mt/metadata-provider)
                                  (lib.metadata/table (mt/metadata-provider) (mt/id :products)))
                       (lib/aggregate (lib/count))))})

(defn- category-target []
  [:field (mt/id :products :category) nil])

(def ^:private category-dim
  {:dimension_id   "d-category"
   :display_name   "Category"
   :effective_type :type/Text
   :semantic_type  :type/Category})

(defn- run-top-n-other [{:keys [card-id k]}]
  (let [ctx {:mp      (mt/metadata-provider)
             :card    (products-count-card card-id)
             :target  (category-target)
             :dim     category-dim
             :segment nil
             :params  {:k k}}
        q   (variants/dataset-query "top-n-other" ctx)]
    ;; The query orders by metric desc; `pin-other-last` (run by the runner on
    ;; the QP result) moves `(Other)` to the end. Mirror that here so the test
    ;; exercises the same effective ordering the chart sees.
    ;; Coerce the count column to `long`: some drivers (e.g. Oracle) return
    ;; aggregate counts as BigDecimal, which would break exact `=` comparison
    ;; against the expected Long literals even though the ordering is identical.
    (->> (variants/pin-other-last "top-n-other" (qp/process-query q))
         :data :rows
         (mapv (fn [[label cnt]] [label (long cnt)])))))

;; ---------------------------------------------------------------------------
;; Temporal-axis variants: order by date desc + not-null filter + row cap
;; ---------------------------------------------------------------------------

(defn- orders-count-card
  "Count metric on ORDERS, no breakout."
  [card-id]
  {:id            card-id
   :dataset_query (lib/->legacy-MBQL
                   (-> (lib/query (mt/metadata-provider)
                                  (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))
                       (lib/aggregate (lib/count))))})

(defn- orders-count-by-month-card
  "Count metric on ORDERS broken out by CREATED_AT month — carries the temporal
  breakout that `time-facet` and `per-value-time-series` resolve their time
  axis from."
  [card-id]
  (let [mp (mt/metadata-provider)]
    {:id            card-id
     :dataset_query (lib/->legacy-MBQL
                     (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                         (lib/aggregate (lib/count))
                         (lib/breakout (lib/with-temporal-bucket
                                         (lib.metadata/field mp (mt/id :orders :created_at))
                                         :month))))}))

(def ^:private created-at-dim
  {:dimension_id   "d-created-at"
   :display_name   "Created At"
   :base_type      :type/DateTimeWithLocalTZ
   :effective_type :type/DateTimeWithLocalTZ
   :semantic_type  :type/CreationTimestamp})

(defn- orders-category-target []
  [:field (mt/id :products :category) {:source-field (mt/id :orders :product_id)}])

(defn- clause-names
  "Opacity-respecting view of a query's clauses: localized display names read
  through the lib API, never the raw MBQL."
  [q clauses]
  (mapv #(lib/display-name q %) clauses))

(deftest default-temporal-order-test
  (testing "default over a temporal dim orders by date desc,
            so a fired cap keeps the most recent contiguous window"
    (let [ctx {:mp      (mt/metadata-provider)
               :card    (orders-count-card 9000003)
               :target  [:field (mt/id :orders :created_at) nil]
               :dim     created-at-dim
               :segment nil
               :params  {}}
          q   (variants/dataset-query "default" ctx)]
      (is (= [] (clause-names q (lib/filters q))))
      (is (= ["Created At: Month descending" "Count descending"]
             (clause-names q (lib/order-bys q))))
      (with-redefs [variants/default-max-rows 3]
        ;; Sample ORDERS span 2016-04 .. 2020-04; the 3 most recent months
        ;; survive the cap, oldest dropped.
        (is (= [["2020-04-01T00:00:00Z" 344]
                ["2020-03-01T00:00:00Z" 527]
                ["2020-02-01T00:00:00Z" 543]]
               (-> (qp/process-query (variants/dataset-query "default" ctx))
                   :data :rows vec)))))))

(deftest default-categorical-order-unchanged-test
  (testing "default over a categorical dim keeps the aggregation-desc ordering and
            adds no not-null filter"
    (let [ctx {:mp      (mt/metadata-provider)
               :card    (products-count-card 9000004)
               :target  (category-target)
               :dim     category-dim
               :segment nil
               :params  {}}
          q   (variants/dataset-query "default" ctx)]
      (is (= [] (clause-names q (lib/filters q))))
      (is (= ["Count descending"]
             (clause-names q (lib/order-bys q)))))))

(deftest temporal-pattern-order-by-test
  (doseq [variant ["temporal-pattern-day" "temporal-pattern-hour"]]
    (testing variant
      (let [ctx {:mp      (mt/metadata-provider)
                 :card    (orders-count-card 9000007)
                 :target  [:field (mt/id :orders :created_at) nil]
                 :dim     created-at-dim
                 :segment nil
                 :params  {}}
            q   (variants/dataset-query variant ctx)]
        ;; Orders by the single bucketed breakout, ascending.
        (is (= 1 (count (lib/order-bys q))))
        ;; Round-trips through the QP without a duplicate-:lib/uuid failure.
        (is (seq (-> (qp/process-query q) :data :rows)))))))

(deftest time-facet-temporal-order-test
  (testing "time-facet orders by date desc then metric desc,
            so a fired cap keeps the most recent months across all dim values"
    (let [ctx {:mp      (mt/metadata-provider)
               :card    (orders-count-by-month-card 9000005)
               :target  (orders-category-target)
               :dim     category-dim
               :segment nil
               :params  {}}
          q   (variants/dataset-query "time-facet" ctx)]
      (is (= [] (clause-names q (lib/filters q))))
      (is (= ["Created At: Month descending" "Count descending"]
             (clause-names q (lib/order-bys q))))
      (with-redefs [variants/default-max-rows 8]
        ;; 4 categories × ~49 months; cap 8 keeps the 2 most recent months ×
        ;; all 4 categories, count-desc within each month.
        (is (= [["Widget"    "2020-04-01T00:00:00Z" 100]
                ["Gizmo"     "2020-04-01T00:00:00Z" 93]
                ["Gadget"    "2020-04-01T00:00:00Z" 78]
                ["Doohickey" "2020-04-01T00:00:00Z" 73]
                ["Gadget"    "2020-03-01T00:00:00Z" 140]
                ["Gizmo"     "2020-03-01T00:00:00Z" 137]
                ["Widget"    "2020-03-01T00:00:00Z" 129]
                ["Doohickey" "2020-03-01T00:00:00Z" 121]]
               (-> (qp/process-query (variants/dataset-query "time-facet" ctx))
                   :data :rows vec)))))))

(deftest per-value-time-series-cap-test
  (testing "per-value-time-series carries a date-desc row cap (it previously had none)"
    (let [ctx {:mp      (mt/metadata-provider)
               :card    (orders-count-by-month-card 9000006)
               :target  (orders-category-target)
               :dim     category-dim
               :segment nil
               :params  {:k 1 :value_index 0}}
          q   (variants/dataset-query "per-value-time-series" ctx)]
      ;; Discovery resolves value 0 to the top category by count: Widget.
      (is (= ["Category is Widget"]
             (clause-names q (lib/filters q))))
      (is (= ["Created At: Month descending" "Count descending"]
             (clause-names q (lib/order-bys q))))
      (with-redefs [variants/default-max-rows 3]
        (is (= [["2020-04-01T00:00:00Z" 100]
                ["2020-03-01T00:00:00Z" 129]
                ["2020-02-01T00:00:00Z" 158]]
               (-> (qp/process-query (variants/dataset-query "per-value-time-series" ctx))
                   :data :rows vec)))))))

(deftest top-n-other-row-order-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "top-n-other sorts non-Other rows by metric desc and pins (Other) last,
              even when (Other) has the largest metric value."
      ;; Sample PRODUCTS counts: Widget 54, Gadget 53, Gizmo 51, Doohickey 42.
      ;; With k=2 the top buckets are Widget/Gadget; (Other) rollup = Gizmo+Doohickey = 93.
      (is (= [["Widget" 54] ["Gadget" 53] ["(Other)" 93]]
             (run-top-n-other {:card-id 9000001 :k 2}))))
    (testing "when k >= distinct dim values, no (Other) row appears — just the dim values
              sorted by metric desc."
      (is (= [["Widget" 54] ["Gadget" 53] ["Gizmo" 51] ["Doohickey" 42]]
             (run-top-n-other {:card-id 9000002 :k 4}))))))

(deftest pin-other-last-test
  (testing "pin-other-last stably moves the (Other) row to the end, preserving the
            metric-desc order of the named buckets"
    (is (= {:data {:rows [["Widget" 54] ["Gadget" 53] ["(Other)" 93]]}}
           (variants/pin-other-last
            "top-n-other"
            {:data {:rows [["(Other)" 93] ["Widget" 54] ["Gadget" 53]]}}))))
  (testing "no (Other) row → order unchanged"
    (is (= {:data {:rows [["Widget" 54] ["Gadget" 53]]}}
           (variants/pin-other-last
            "top-n-other"
            {:data {:rows [["Widget" 54] ["Gadget" 53]]}}))))
  (testing "no-op for other variants"
    (is (= {:data {:rows [["(Other)" 93] ["Widget" 54]]}}
           (variants/pin-other-last
            "default"
            {:data {:rows [["(Other)" 93] ["Widget" 54]]}}))))
  (testing "no-op for empty/error results"
    (is (= {:data {:rows []}}
           (variants/pin-other-last "top-n-other" {:data {:rows []}})))))
