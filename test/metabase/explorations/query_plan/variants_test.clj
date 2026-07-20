(ns ^:mb/driver-tests metabase.explorations.query-plan.variants-test
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.query-plan.variants :as variants]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.request.core :as request]
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
;; Temporal-axis variants: order by date desc + row cap (no filters added)
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

(deftest variant-qualifier-test
  (testing "each variant has a short page qualifier; default has none, unknowns fall through to nil"
    (is (= {"default"               nil
            "temporal-pattern-day"  "(Day of week)"
            "temporal-pattern-hour" "(Hour of day)"
            "time-facet"            "over time"
            "per-value-time-series" "over time"
            "top-n-other"           "(Top values + Other)"
            "filtered-subset"       "(Filtered)"
            "some-future-variant"   nil}
           (into {} (map (juxt identity variants/variant-qualifier))
                 ["default" "temporal-pattern-day" "temporal-pattern-hour" "time-facet"
                  "per-value-time-series" "top-n-other" "filtered-subset" "some-future-variant"])))))

(defn- widget-filtered-card
  "`card` with its `:dataset_query` rebuilt and scoped to `category = Widget`, the way
  `build-row-context` re-applies a block's `:explore_filters` per row. Each call mints fresh
  `:lib/uuid`s, so two invocations produce equal-but-not-identical queries with different hashes."
  [card]
  (let [mp (mt/metadata-provider)]
    (assoc card :dataset_query
           (lib/->legacy-MBQL
            (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                (lib/aggregate (lib/count))
                (lib/filter (lib/= (lib.metadata/field mp (mt/id :products :category)) "Widget")))))))

(def ^:private widget-explore-filters
  "The `:explore_filters` chain that produced a Widget-scoped card — what the ctx carries and the
  discovery cache keys on."
  [{:field_ref ["field" {} 4242] :value "Widget"}])

(deftest cached-discovery-isolates-filtered-queries-test
  (testing "cached-discovery keys on the :explore-filters chain so segments don't share top-N results"
    (let [card-id    9000100
          mp         (mt/metadata-provider)
          unfiltered (products-count-card card-id)
          filtered   (widget-filtered-card unfiltered)
          base-ctx   {:mp mp :target (category-target) :dim category-dim :segment nil :params {:k 2}}
          discover           (fn [card explore-filters]
                               (#'variants/cached-discovery
                                (assoc base-ctx :card card :explore-filters explore-filters)))
          unfiltered-results (discover unfiltered nil)
          filtered-results   (discover filtered widget-explore-filters)]
      (is (not= unfiltered-results filtered-results)
          "unfiltered top-N must not be served from cache after a filtered query with the same card/dim/k")
      (is (= ["Widget"] filtered-results)
          "a Widget-scoped metric query only discovers that segment"))))

(deftest cached-discovery-isolates-users-test
  (testing "cached-discovery keys on the current user, so a top-N value set discovered under one
            user's lens (sandboxing / impersonation / routing can all narrow it) is never served to
            a different user"
    (let [card-id  9000102
          mp       (mt/metadata-provider)
          card     (products-count-card card-id)
          ctx      {:mp mp :card card :target (category-target) :dim category-dim
                    :segment nil :params {:k 2} :explore-filters nil}
          discover (fn [user-id]
                     (request/with-current-user user-id
                       (#'variants/cached-discovery ctx)))
          calls    (atom 0)
          real     @#'variants/run-top-k-discovery]
      (with-redefs [variants/run-top-k-discovery (fn [& args]
                                                   (swap! calls inc)
                                                   (apply real args))]
        (discover (mt/user->id :rasta))
        (discover (mt/user->id :crowberto))
        (is (= 2 @calls)
            "each user runs its own discovery query rather than inheriting the other's cached values")
        (discover (mt/user->id :rasta))
        (is (= 2 @calls)
            "a repeat for the same user still hits the cache")))))

(deftest cached-discovery-key-is-stable-across-query-rebuilds-test
  (testing "the cache key is stable across per-row query rebuilds, so the discovery query runs once —"
    (testing "keying on the reconstructed :dataset_query never hit: `lib/=` mints fresh :lib/uuids per row"
      (let [card-id  9000101
            mp       (mt/metadata-provider)
            base-ctx {:mp mp :target (category-target) :dim category-dim :segment nil :params {:k 2}}
            card     (products-count-card card-id)
            runs     (atom 0)
            discover (fn []
                       ;; A fresh rebuild each call — equal query, different :lib/uuids (and so a
                       ;; different hash), exactly like two rows of the same block.
                       (#'variants/cached-discovery
                        (assoc base-ctx
                               :card (widget-filtered-card card)
                               :explore-filters widget-explore-filters)))]
        (with-redefs-fn {#'variants/run-top-k-discovery (fn [& _] (swap! runs inc) ["Widget"])}
          (fn []
            (is (= ["Widget"] (discover)))
            (is (= ["Widget"] (discover)) "second row is served from cache")
            (is (= 1 @runs)
                "discovery ran once across both rebuilds — the key ignores the churning :lib/uuids")))))))
