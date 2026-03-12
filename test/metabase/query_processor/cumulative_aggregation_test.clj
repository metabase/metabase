(ns ^:mb/driver-tests metabase.query-processor.cumulative-aggregation-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(defn- ->local-date [t]
  (t/local-date
   (cond-> t
     (instance? java.time.Instant t)
     (t/zoned-date-time (t/zone-id "UTC")))))

(deftest ^:parallel cumulative-sum-test
  (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
    (testing "cum_sum w/o breakout should be treated the same as sum"
      (let [result (mt/run-mbql-query users
                     {:aggregation [[:cum-sum $id]]})]
        (is (=? [{:display_name "Cumulative sum of ID"
                  :source :aggregation}]
                (-> result :data :cols)))
        (is (= [[120]]
               (mt/formatted-rows
                [int]
                result)))))))

(deftest ^:parallel cumulative-sum-test-2
  (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
    (testing "Simple cumulative sum where breakout field is same as cum_sum field"
      (let [query (mt/mbql-query users
                    {:aggregation [[:cum-sum $id]]
                     :breakout    [$id]})]
        (mt/with-native-query-testing-context query
          (is (= [[1    1]
                  [2    3]
                  [3    6]
                  [4   10]
                  [5   15]
                  [6   21]
                  [7   28]
                  [8   36]
                  [9   45]
                  [10  55]
                  [11  66]
                  [12  78]
                  [13  91]
                  [14 105]
                  [15 120]]
                 (mt/formatted-rows
                  [int int]
                  (qp/process-query query)))))))))

(deftest ^:parallel cumulative-sum-test-3
  (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
    (testing "Cumulative sum w/ a different breakout field"
      (let [query (mt/mbql-query users
                    {:aggregation [[:cum-sum $id]]
                     :breakout    [$name]})]
        (mt/with-native-query-testing-context query
          (is (= [["Broen Olujimi"        14]
                  ["Conchúr Tihomir"      21]
                  ["Dwight Gresham"       34]
                  ["Felipinho Asklepios"  36]
                  ["Frans Hevel"          46]
                  ["Kaneonuskatew Eiran"  49]
                  ["Kfir Caj"             61]
                  ["Nils Gotam"           70]
                  ["Plato Yeshua"         71]
                  ["Quentin Sören"        76]
                  ["Rüstem Hebel"         91]
                  ["Shad Ferdynand"       97]
                  ["Simcha Yan"          101]
                  ["Spiros Teofil"       112]
                  ["Szymon Theutrich"    120]]
                 (mt/formatted-rows
                  [str int]
                  (qp/process-query query)))))))))

(deftest ^:parallel cumulative-sum-test-4
  (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
    (testing "Cumulative sum w/ a different breakout field that requires grouping"
      (let [query (mt/mbql-query venues
                    {:aggregation [[:cum-sum $id]]
                     :breakout    [$price]})]
        (mt/with-native-query-testing-context query
          (is (= [[1 1211]
                  [2 4066]
                  [3 4681]
                  [4 5050]]
                 (mt/formatted-rows
                  [int int]
                  (qp/process-query query)))))))))

(deftest ^:parallel cumulative-sum-with-bucketed-breakout-test
  (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
    (testing "cumulative sum with a temporally bucketed breakout"
      (let [metadata-provider (mt/metadata-provider)
            orders            (lib.metadata/table metadata-provider (mt/id :orders))
            orders-created-at (lib.metadata/field metadata-provider (mt/id :orders :created_at))
            orders-total      (lib.metadata/field metadata-provider (mt/id :orders :total))
            query             (-> (lib/query metadata-provider orders)
                                  (lib/breakout (lib/with-temporal-bucket orders-created-at :month))
                                  (lib/aggregate (lib/cum-sum orders-total))
                                  (lib/limit 3)
                                  (assoc-in [:middleware :format-rows?] false))]
        (mt/with-native-query-testing-context query
          (is (= [[#t "2016-04-01" 52.76]
                  [#t "2016-05-01" 1318.49]
                  [#t "2016-06-01" 3391.41]]
                 (mt/formatted-rows
                  [->local-date 2.0]
                  (qp/process-query query)))))))))

(deftest ^:parallel cumulative-count-test
  (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
    (testing "cumulative count aggregations"
      (testing "w/o breakout should be treated the same as count"
        (let [query (mt/mbql-query users
                      {:aggregation [[:cum-count $id]]})]
          (mt/with-native-query-testing-context query
            (is (= [[15]]
                   (mt/formatted-rows
                    [int]
                    (qp/process-query query))))))))))

(deftest ^:parallel cumulative-count-with-breakout-test
  (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
    (testing "w/ breakout on field with distinct values"
      (let [query (mt/mbql-query users
                    {:aggregation [[:cum-count $id]]
                     :breakout    [$name]})]
        (mt/with-native-query-testing-context query
          (is (= [["Broen Olujimi"        1]
                  ["Conchúr Tihomir"      2]
                  ["Dwight Gresham"       3]
                  ["Felipinho Asklepios"  4]
                  ["Frans Hevel"          5]
                  ["Kaneonuskatew Eiran"  6]
                  ["Kfir Caj"             7]
                  ["Nils Gotam"           8]
                  ["Plato Yeshua"         9]
                  ["Quentin Sören"       10]
                  ["Rüstem Hebel"        11]
                  ["Shad Ferdynand"      12]
                  ["Simcha Yan"          13]
                  ["Spiros Teofil"       14]
                  ["Szymon Theutrich"    15]]
                 (mt/formatted-rows
                  [str int]
                  (qp/process-query query)))))))))

(deftest ^:parallel cumulative-count-with-breakout-test-2
  (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
    (testing "w/ breakout on field that requires grouping"
      (let [query (mt/mbql-query venues
                    {:aggregation [[:cum-count $id]]
                     :breakout    [$price]})]
        (mt/with-native-query-testing-context query
          (is (= [[1 22]
                  [2 81]
                  [3 94]
                  [4 100]]
                 (mt/formatted-rows
                  [int int]
                  (qp/process-query query)))))))))

(deftest ^:parallel cumulative-count-with-multiple-breakouts-test
  (testing "Should be ORDERED BY first BREAKOUT and PARTITIONED BY the second BREAKOUT (#2862, #42003)"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
      (let [query (-> (mt/mbql-query orders
                        {:aggregation [[:cum-count]]
                         :breakout    [!month.created_at !year.created_at]
                         :limit       12})
                      (assoc-in [:middleware :format-rows?] false))]
        (mt/with-native-query-testing-context query
          (is (= [[#t "2016-04-01" #t "2016-01-01" 1]
                  [#t "2016-05-01" #t "2016-01-01" 20]
                  [#t "2016-06-01" #t "2016-01-01" 57]
                  [#t "2016-07-01" #t "2016-01-01" 121]
                  [#t "2016-08-01" #t "2016-01-01" 200]
                  [#t "2016-09-01" #t "2016-01-01" 292]
                  [#t "2016-10-01" #t "2016-01-01" 429]
                  [#t "2016-11-01" #t "2016-01-01" 579]
                  [#t "2016-12-01" #t "2016-01-01" 744]
                  [#t "2017-01-01" #t "2017-01-01" 205] ; <--- total should reset here, when second breakout changes
                  [#t "2017-02-01" #t "2017-01-01" 411]
                  [#t "2017-03-01" #t "2017-01-01" 667]]
                 (mt/formatted-rows
                  [->local-date ->local-date int]
                  (qp/process-query query)))))))))

(deftest ^:parallel cumulative-count-with-three-breakouts-test
  (testing "Three breakouts: should be ORDERED BY first BREAKOUT and PARTITIONED BY second and third BREAKOUTS (#2862, #42003)"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
      (let [query (-> (mt/mbql-query orders
                        {:aggregation [[:cum-count]]
                         :breakout    [!day.created_at !year.created_at !month.created_at]
                         :limit       4})
                      (assoc-in [:middleware :format-rows?] false))]
        (mt/with-native-query-testing-context query
          (is (= [[#t "2016-04-30" #t "2016-01-01" #t "2016-04-01" 1]
                  [#t "2016-05-04" #t "2016-01-01" #t "2016-05-01" 1] ; <- count should reset here, when last two breakouts change
                  [#t "2016-05-06" #t "2016-01-01" #t "2016-05-01" 2]
                  [#t "2016-05-08" #t "2016-01-01" #t "2016-05-01" 3]]
                 (mt/formatted-rows
                  [->local-date ->local-date ->local-date int]
                  (qp/process-query query)))))))))

(deftest ^:parallel cumulative-count-without-field-test
  (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
    (testing "cumulative count without a field"
      (let [query (mt/mbql-query venues
                    {:aggregation [[:cum-count]]
                     :breakout    [$price]})]
        (mt/with-native-query-testing-context query
          (is (= [[1 22]
                  [2 81]
                  [3 94]
                  [4 100]]
                 (mt/formatted-rows
                  [int int]
                  (qp/process-query query)))))))))

(deftest ^:parallel cumulative-count-with-bucketed-breakout-test
  (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
    (testing "cumulative count with a temporally bucketed breakout"
      (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
        (let [metadata-provider (mt/metadata-provider)
              orders            (lib.metadata/table metadata-provider (mt/id :orders))
              orders-created-at (lib.metadata/field metadata-provider (mt/id :orders :created_at))
              query             (-> (lib/query metadata-provider orders)
                                    (lib/breakout (lib/with-temporal-bucket orders-created-at :month))
                                    (lib/aggregate (lib/cum-count))
                                    (lib/limit 3)
                                    (assoc-in [:middleware :format-rows?] false))]
          (mt/with-native-query-testing-context query
            (is (= [[#t "2016-04-01" 1]
                    [#t "2016-05-01" 20]
                    [#t "2016-06-01" 57]]
                   (mt/formatted-rows
                    [->local-date int]
                    (qp/process-query query))))))))))

(deftest ^:parallel cumulative-sum-with-multiple-breakouts-test
  (testing "Should be ORDERED BY first BREAKOUT and PARTITIONED BY the second BREAKOUT (#2862, #42003)"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
      (let [query (-> (mt/mbql-query orders
                        {:aggregation [[:cum-sum $total]]
                         :breakout    [!month.created_at !year.created_at]
                         :limit       12})
                      (assoc-in [:middleware :format-rows?] false))]
        (mt/with-native-query-testing-context query
          ;; you can sanity check these numbers by changing `:cum-sum` to `:sum` and adding them up manually
          (is (= [[#t "2016-04-01" #t "2016-01-01" 52.76]
                  [#t "2016-05-01" #t "2016-01-01" 1318.49]
                  [#t "2016-06-01" #t "2016-01-01" 3391.41]
                  [#t "2016-07-01" #t "2016-01-01" 7126.13]
                  [#t "2016-08-01" #t "2016-01-01" 12086.78]
                  [#t "2016-09-01" #t "2016-01-01" 17458.87]
                  [#t "2016-10-01" #t "2016-01-01" 25161.80]
                  [#t "2016-11-01" #t "2016-01-01" 33088.49]
                  [#t "2016-12-01" #t "2016-01-01" 42156.94]
                  [#t "2017-01-01" #t "2017-01-01" 11094.77] ; <--- total should reset here, when second breakout changes
                  [#t "2017-02-01" #t "2017-01-01" 22338.43]
                  [#t "2017-03-01" #t "2017-01-01" 36454.11]]
                 (mt/formatted-rows
                  [->local-date ->local-date 2.0]
                  (qp/process-query query)))))))))

(deftest ^:parallel cumulative-sum-with-three-breakouts-test
  (testing "Three breakouts: should be ORDERED BY first BREAKOUT and PARTITIONED BY last two BREAKOUTS (#2862, #42003)"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
      (let [query (-> (mt/mbql-query orders
                        {:aggregation [[:cum-sum $total]]
                         :breakout    [!day.created_at !year.created_at !month.created_at]
                         :limit       4})
                      (assoc-in [:middleware :format-rows?] false))]
        (mt/with-native-query-testing-context query
          ;; you can sanity check these numbers by changing `:cum-sum` to `:sum` and adding them up manually.
          (is (= [[#t "2016-04-30" #t "2016-01-01" #t "2016-04-01" 52.76]
                  [#t "2016-05-04" #t "2016-01-01" #t "2016-05-01" 98.78] ; <-- total should reset here, when last two breakouts change
                  [#t "2016-05-06" #t "2016-01-01" #t "2016-05-01" 186.07]
                  [#t "2016-05-08" #t "2016-01-01" #t "2016-05-01" 270.94]]
                 (mt/formatted-rows
                  [->local-date ->local-date ->local-date 2.0]
                  (qp/process-query query)))))))))

(deftest ^:parallel cumulative-count-and-sum-in-expressions-test
  (testing "Cumulative count should work inside expressions (#13634, #15118)"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
      (let [metadata-provider (mt/metadata-provider)
            orders            (lib.metadata/table metadata-provider (mt/id :orders))
            orders-created-at (lib.metadata/field metadata-provider (mt/id :orders :created_at))
            orders-total      (lib.metadata/field metadata-provider (mt/id :orders :total))
            query             (-> (lib/query metadata-provider orders)
                                  ;; 1. month
                                  (lib/breakout (lib/with-temporal-bucket orders-created-at :month))
                                  ;; 2. cumulative count of orders
                                  (lib/aggregate (lib/cum-count))
                                  ;; 3. cumulative sum of order total
                                  (lib/aggregate (lib/cum-sum orders-total))
                                  ;; 4. cumulative average order total (cumulative sum of total / cumulative count)
                                  (lib/aggregate (lib/+ (lib// (lib/cum-sum orders-total)
                                                               (lib/cum-count))
                                                        1.0))
                                  (lib/limit 3)
                                  (assoc-in [:middleware :format-rows?] false))]
        (mt/with-native-query-testing-context query
          ;;       1               2  3       4
          (is (= [[#t "2016-04-01" 1  52.76   53.76]
                  [#t "2016-05-01" 20 1318.49 66.92]
                  [#t "2016-06-01" 57 3391.41 60.50]]
                 (mt/formatted-rows
                  [->local-date int 2.0 2.0]
                  (qp/process-query query)))))))))

(deftest ^:parallel expressions-inside-cumulative-aggregations-test
  (testing "Expressions inside of cumulative aggregations should work correctly"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
      (let [metadata-provider (mt/metadata-provider)
            orders            (lib.metadata/table metadata-provider (mt/id :orders))
            orders-created-at (lib.metadata/field metadata-provider (mt/id :orders :created_at))
            orders-total      (lib.metadata/field metadata-provider (mt/id :orders :total))
            query             (-> (lib/query metadata-provider orders)
                                  (lib/breakout (lib/with-temporal-bucket orders-created-at :month))
                                  (lib/aggregate (lib/cum-sum (lib/+ orders-total 1)))
                                  (lib/limit 3)
                                  (assoc-in [:middleware :format-rows?] false))]
        (mt/with-native-query-testing-context query
          (is (= [[#t "2016-04-01" 53.76]
                  [#t "2016-05-01" 1338.49]
                  [#t "2016-06-01" 3448.41]]
                 (mt/formatted-rows
                  [->local-date 2.0]
                  (qp/process-query query)))))))))

(deftest ^:parallel mixed-cumulative-and-non-cumulative-aggregations-test
  (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
    (let [metadata-provider (mt/metadata-provider)
          orders            (lib.metadata/table metadata-provider (mt/id :orders))
          orders-created-at (lib.metadata/field metadata-provider (mt/id :orders :created_at))
          orders-total      (lib.metadata/field metadata-provider (mt/id :orders :total))
          query             (-> (lib/query metadata-provider orders)
                                ;; 1. month
                                (lib/breakout (lib/with-temporal-bucket orders-created-at :month))
                                ;; 2. cumulative count of orders
                                (lib/aggregate (lib/cum-count))
                                ;; 3. cumulative sum of order total
                                (lib/aggregate (lib/cum-sum orders-total))
                                ;; 4. sum of order total
                                (lib/aggregate (lib/sum orders-total))
                                (lib/limit 3)
                                (assoc-in [:middleware :format-rows?] false))]
      (mt/with-native-query-testing-context query
        ;;       1               2  3       4
        (is (= [[#t "2016-04-01" 1  52.76   52.76]
                [#t "2016-05-01" 20 1318.49 1265.73]
                [#t "2016-06-01" 57 3391.41 2072.92]]
               (mt/formatted-rows
                [->local-date int 2.0 2.0]
                (qp/process-query query))))))))

(deftest ^:parallel cumulative-aggregation-with-filter-and-temporal-bucketed-breakout-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join :window-functions/cumulative)
    (testing "Query with a filter and a temporally bucketed breakout should work (#41791)"
      (let [metadata-provider (mt/metadata-provider)
            orders            (lib.metadata/table metadata-provider (mt/id :orders))
            orders-created-at (lib.metadata/field metadata-provider (mt/id :orders :created_at))
            orders-id         (lib.metadata/field metadata-provider (mt/id :orders :id))
            products-category (m/find-first (fn [col]
                                              (= (:id col) (mt/id :products :category)))
                                            (lib/visible-columns (lib/query metadata-provider orders)))
            _                 (assert (some? products-category))
            query             (-> (lib/query metadata-provider orders)
                                  (lib/filter (lib/> orders-id 5000))
                                  (lib/aggregate (lib/count))
                                  (lib/aggregate (lib/cum-count))
                                  (lib/breakout (lib/with-temporal-bucket orders-created-at :year))
                                  (lib/breakout products-category)
                                  (lib/limit 10)
                                  (assoc-in [:middleware :format-rows?] false))]
        (mt/with-native-query-testing-context query
          ;; Even though created_at is the first breakout it should come as second
          ;; in the sort order, so that the accumulation is easy to follow.
          ;;       YEAR            CATEGORY   COUNT CUM-COUNT
          (is (= [[#t "2016-01-01" "Doohickey"  131  131]
                  [#t "2017-01-01" "Doohickey"  617  748]
                  [#t "2018-01-01" "Doohickey"  865 1613]
                  [#t "2019-01-01" "Doohickey"  990 2603]
                  [#t "2020-01-01" "Doohickey"  312 2915]
                  [#t "2016-01-01" "Gadget"     145  145]
                  [#t "2017-01-01" "Gadget"     690  835]
                  [#t "2018-01-01" "Gadget"    1109 1944]
                  [#t "2019-01-01" "Gadget"    1328 3272]
                  [#t "2020-01-01" "Gadget"     369 3641]]
                 (mt/formatted-rows
                  [->local-date str int int]
                  (qp/process-query query)))))))))

(deftest ^:parallel cumulative-sum-ordered-by-aggregation-expression-test
  (testing "Ordering by an expression used in cumulative sum works as expected (#47613)"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
      (let [metadata-provider (mt/metadata-provider)
            orders            (lib.metadata/table metadata-provider (mt/id :orders))
            orders-subtotal   (lib.metadata/field metadata-provider (mt/id :orders :subtotal))
            products-category (m/find-first (fn [col]
                                              (= (:id col) (mt/id :products :category)))
                                            (lib/visible-columns (lib/query metadata-provider orders)))
            _                 (assert (some? products-category))
            base-query        (-> (lib/query metadata-provider orders)
                                  (lib/breakout products-category)
                                  (lib/aggregate (lib/sum orders-subtotal))
                                  (lib/aggregate (lib/cum-sum orders-subtotal)))
            sum-subtotal      (m/find-first (fn [col]
                                              (= (:display-name col) "Sum of Subtotal"))
                                            (lib/returned-columns base-query))
            _                 (assert (some? sum-subtotal))
            query             (-> base-query
                                  (lib/order-by sum-subtotal :desc)
                                  (assoc-in [:middleware :format-rows?] false))]
        (mt/with-native-query-testing-context query
          (is (= [["Widget"    406109.05  406109.05]
                  ["Gadget"    389812.65  795921.7]
                  ["Gizmo"     367220.16 1163141.86]
                  ["Doohickey" 285042.38 1448184.24]]
                 (mt/formatted-rows
                  [str 2.0 2.0]
                  (qp/process-query query)))))))))

(deftest ^:parallel cumulative-count-different-temporal-breakouts-test
  (testing "The finest temporal column comes last in the order-by"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
      (let [metadata-provider   (mt/metadata-provider)
            orders              (lib.metadata/table metadata-provider (mt/id :orders))
            created-at          (lib.metadata/field metadata-provider (mt/id :orders :created_at))
            products-category   (m/find-first (fn [col]
                                                (= (:id col) (mt/id :products :category)))
                                              (lib/visible-columns (lib/query metadata-provider orders)))
            _                   (assert (some? products-category))
            products-created-at (m/find-first (fn [col]
                                                (= (:id col) (mt/id :products :created_at)))
                                              (lib/visible-columns (lib/query metadata-provider orders)))
            _                   (assert (some? products-created-at))
            base-query          (-> (lib/query metadata-provider orders)
                                    (lib/filter (lib/< created-at "2018"))
                                    (lib/filter (lib/< products-created-at "2018"))
                                    (lib/filter (lib/starts-with products-category "G"))
                                    (lib/breakout (lib/with-temporal-bucket products-created-at :quarter))
                                    (lib/breakout products-category)
                                    (lib/breakout (lib/with-temporal-bucket created-at :year))
                                    (lib/aggregate (lib/count))
                                    (lib/aggregate (lib/cum-count))
                                    (lib/order-by products-category :desc)
                                    (assoc-in [:middleware :format-rows?] false))
            query               base-query]
        (mt/with-native-query-testing-context query
          (is (= [[#t "2016-04-01" "Gizmo"  #t "2016-01-01"  41  41]
                  [#t "2016-07-01" "Gizmo"  #t "2016-01-01"  28  69]
                  [#t "2016-10-01" "Gizmo"  #t "2016-01-01"  15  84]
                  [#t "2017-01-01" "Gizmo"  #t "2016-01-01"   3  87]
                  [#t "2017-04-01" "Gizmo"  #t "2016-01-01"   6  93]
                  [#t "2017-07-01" "Gizmo"  #t "2016-01-01"  19 112]
                  [#t "2017-10-01" "Gizmo"  #t "2016-01-01"  17 129]
                  [#t "2016-04-01" "Gizmo"  #t "2017-01-01"  76  76]
                  [#t "2016-07-01" "Gizmo"  #t "2017-01-01"  45 121]
                  [#t "2016-10-01" "Gizmo"  #t "2017-01-01" 137 258]
                  [#t "2017-01-01" "Gizmo"  #t "2017-01-01" 103 361]
                  [#t "2017-04-01" "Gizmo"  #t "2017-01-01"  64 425]
                  [#t "2017-07-01" "Gizmo"  #t "2017-01-01" 144 569]
                  [#t "2017-10-01" "Gizmo"  #t "2017-01-01"  85 654]
                  [#t "2016-04-01" "Gadget" #t "2016-01-01"  49  49]
                  [#t "2016-07-01" "Gadget" #t "2016-01-01"  30  79]
                  [#t "2016-10-01" "Gadget" #t "2016-01-01"  39 118]
                  [#t "2017-01-01" "Gadget" #t "2016-01-01"  18 136]
                  [#t "2017-04-01" "Gadget" #t "2016-01-01"   8 144]
                  [#t "2017-07-01" "Gadget" #t "2016-01-01"   3 147]
                  [#t "2017-10-01" "Gadget" #t "2016-01-01"  12 159]
                  [#t "2016-04-01" "Gadget" #t "2017-01-01"  87  87]
                  [#t "2016-07-01" "Gadget" #t "2017-01-01" 107 194]
                  [#t "2016-10-01" "Gadget" #t "2017-01-01" 124 318]
                  [#t "2017-01-01" "Gadget" #t "2017-01-01" 174 492]
                  [#t "2017-04-01" "Gadget" #t "2017-01-01"  97 589]
                  [#t "2017-07-01" "Gadget" #t "2017-01-01"  38 627]
                  [#t "2017-10-01" "Gadget" #t "2017-01-01"  68 695]]
                 (mt/formatted-rows
                  [->local-date str ->local-date int int]
                  (qp/process-query query)))))))))

(deftest ^:parallel cumulative-count-different-temporal-fields-test
  (testing "month-of-year is finer than year (GROUP BY should preserve breakout order; add ORDER BY year, month-of-year)"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
      (let [metadata-provider (mt/metadata-provider)
            orders            (lib.metadata/table metadata-provider (mt/id :orders))
            created-at        (lib.metadata/field metadata-provider (mt/id :orders :created_at))
            birth-date        (->> (lib/breakoutable-columns (lib/query metadata-provider orders))
                                   (m/find-first (comp #{(mt/id :people :birth_date)} :id)))
            query             (-> (lib/query metadata-provider orders)
                                  (lib/breakout (lib/with-temporal-bucket birth-date :month-of-year))
                                  (lib/breakout (lib/with-temporal-bucket created-at :year))
                                  (lib/aggregate (lib/count))
                                  (lib/aggregate (lib/cum-count))
                                  (lib/limit 10)
                                  (assoc-in [:middleware :format-rows?] false))]
        (mt/with-native-query-testing-context query
          (is (= [["1"  #t "2016-01-01" 66  66]
                  ["2"  #t "2016-01-01" 83 149]
                  ["3"  #t "2016-01-01" 46 195]
                  ["4"  #t "2016-01-01" 70 265]
                  ["5"  #t "2016-01-01" 57 322]
                  ["6"  #t "2016-01-01" 67 389]
                  ["7"  #t "2016-01-01" 49 438]
                  ["8"  #t "2016-01-01" 76 514]
                  ["9"  #t "2016-01-01" 61 575]
                  ["10" #t "2016-01-01" 57 632]]
                 (mt/formatted-rows
                  [str ->local-date int int]
                  (qp/process-query query)))))))))

(deftest ^:parallel cumulative-count-offset-day-of-year-test
  (testing "day is finer than day-of-year (GROUP BY should preserve breakout order; add ORDER BY day-of-year, day)"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative :window-functions/offset)
      (let [metadata-provider   (mt/metadata-provider)
            orders              (lib.metadata/table metadata-provider (mt/id :orders))
            created-at          (lib.metadata/field metadata-provider (mt/id :orders :created_at))
            base-query          (-> (lib/query metadata-provider orders)
                                    (lib/breakout (lib/with-temporal-bucket created-at :day-of-year))
                                    (lib/breakout (lib/with-temporal-bucket created-at :day))
                                    (lib/aggregate (lib/count))
                                    (lib/aggregate (lib/offset (lib/count) -1))
                                    (lib/limit 10)
                                    (assoc-in [:middleware :format-rows?] false))
            query               base-query]
        (mt/with-native-query-testing-context query
          (is (= [[1 #t "2017-01-01"  5 nil]
                  [1 #t "2018-01-01" 10   5]
                  [1 #t "2019-01-01" 16  10]
                  [1 #t "2020-01-01" 14  16]
                  [2 #t "2017-01-02"  3 nil]
                  [2 #t "2018-01-02" 12   3]
                  [2 #t "2019-01-02" 21  12]
                  [2 #t "2020-01-02" 20  21]
                  [3 #t "2017-01-03"  8 nil]
                  [3 #t "2018-01-03" 14   8]]
                 (mt/formatted-rows
                  [int ->local-date int int]
                  (qp/process-query query)))))))))

(deftest ^:parallel offset-filtering-test
  (testing "can filter offset aggregations"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative :window-functions/offset)
      (let [metadata-provider (mt/metadata-provider)
            orders            (lib.metadata/table metadata-provider (mt/id :orders))
            created-at        (lib.metadata/field metadata-provider (mt/id :orders :created_at))
            total             (lib.metadata/field metadata-provider (mt/id :orders :total))
            base-query        (-> (lib/query metadata-provider orders)
                                  (lib/breakout (lib/with-temporal-bucket created-at :month))
                                  (lib/breakout (lib/with-temporal-bucket created-at :month-of-year))
                                  (lib/aggregate (lib/sum total))
                                  (lib/aggregate (lib/offset (lib/sum total) -1))
                                  lib/append-stage)
            created-at-month  (->> (lib/filterable-columns base-query)
                                   (m/find-first (comp #{"Created At: Month"} :display-name)))
            created-at-ymonth (->> (lib/orderable-columns base-query)
                                   (m/find-first (comp #{"Created At: Month of year"} :display-name)))
            query             (-> base-query
                                  (lib/filter (lib/between created-at-month "2019-09-03" "2020-10-03"))
                                  (lib/order-by created-at-ymonth)
                                  (lib/limit 10)
                                  (assoc-in [:middleware :format-rows?] false))]
        (mt/with-native-query-testing-context query
          (is (= [[#t "2020-01-01"  1 52249.36 51634.1]
                  [#t "2020-02-01"  2 47403.79 47075.6]
                  [#t "2020-03-01"  3 45683.47 51346.97]
                  [#t "2020-04-01"  4 30759.31 47554.92]
                  [#t "2019-10-01" 10 46273.34 47728.54]
                  [#t "2019-11-01" 11 47410.27 46431.86]
                  [#t "2019-12-01" 12 48260.52 48242.06]]
                 (mt/formatted-rows
                  [->local-date int 2.0 2.0]
                  (qp/process-query query)))))))))

(deftest ^:parallel offset-function-expression-breakout-test
  (testing "can break out by expression aggregations"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative :window-functions/offset)
      (let [metadata-provider (mt/metadata-provider)
            orders            (lib.metadata/table metadata-provider (mt/id :orders))
            created-at        (lib.metadata/field metadata-provider (mt/id :orders :created_at))
            total             (lib.metadata/field metadata-provider (mt/id :orders :total))
            produnct-category (->> (lib/breakoutable-columns (lib/query metadata-provider orders))
                                   (m/find-first (comp #{(mt/id :products :category)} :id)))
            base-query        (-> (lib/query metadata-provider orders)
                                  (lib/expression "CC Product Category" (lib/concat produnct-category " from products")))
            cc-column         (->> (lib/breakoutable-columns base-query)
                                   (m/find-first (comp #{"CC Product Category"} :display-name)))
            _                 (assert (some? cc-column))
            query             (-> base-query
                                  (lib/breakout (lib/with-temporal-bucket created-at :year))
                                  (lib/breakout cc-column)
                                  (lib/aggregate (lib/sum total))
                                  (lib/aggregate (lib/offset (lib/sum total) -1))
                                  (lib/limit 10)
                                  (assoc-in [:middleware :format-rows?] false))]
        (mt/with-native-query-testing-context query
          (is (= [[#t "2016-01-01" "Doohickey from products"   9031.71        nil]
                  [#t "2017-01-01" "Doohickey from products"  43069.67    9031.71]
                  [#t "2018-01-01" "Doohickey from products"  98515.46   43069.67]
                  [#t "2019-01-01" "Doohickey from products" 110322.05   98515.46]
                  [#t "2020-01-01" "Doohickey from products"  36332.58  110322.05]
                  [#t "2016-01-01" "Gadget from products"     10672.75        nil]
                  [#t "2017-01-01" "Gadget from products"     54961.01   10672.75]
                  [#t "2018-01-01" "Gadget from products"    133811.07   54961.01]
                  [#t "2019-01-01" "Gadget from products"    160501.62  133811.07]
                  [#t "2020-01-01" "Gadget from products"     46673.3   160501.62]]
                 (mt/formatted-rows
                  [->local-date str 2.0 2.0]
                  (qp/process-query query)))))))))
