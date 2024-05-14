(ns metabase.query-processor-test.cumulative-aggregation-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(defn- ->local-date [t]
  (t/local-date
   (cond-> t
     (instance? java.time.Instant t)
     (t/zoned-date-time (t/zone-id "UTC")))))

(deftest ^:parallel cumulative-sum-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "cum_sum w/o breakout should be treated the same as sum"
      (let [result (mt/run-mbql-query users
                     {:aggregation [[:cum-sum $id]]})]
        (is (=? [{:display_name "Cumulative sum of ID"
                  :source :aggregation}]
                (-> result :data :cols)))
        (is (= [[120]]
               (mt/formatted-rows [int]
                 result)))))))

(deftest ^:parallel cumulative-sum-test-2
  (mt/test-drivers (mt/normal-drivers)
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
                 (mt/formatted-rows [int int]
                   (qp/process-query query)))))))))

(deftest ^:parallel cumulative-sum-test-3
  (mt/test-drivers (mt/normal-drivers)
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
                 (mt/formatted-rows [str int]
                   (qp/process-query query)))))))))

(deftest ^:parallel cumulative-sum-test-4
  (mt/test-drivers (mt/normal-drivers)
    (testing "Cumulative sum w/ a different breakout field that requires grouping"
      (let [query (mt/mbql-query venues
                    {:aggregation [[:cum-sum $id]]
                     :breakout    [$price]})]
        (mt/with-native-query-testing-context query
          (is (= [[1 1211]
                  [2 4066]
                  [3 4681]
                  [4 5050]]
                 (mt/formatted-rows [int int]
                   (qp/process-query query)))))))))

(deftest ^:parallel cumulative-sum-with-bucketed-breakout-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "cumulative sum with a temporally bucketed breakout"
      (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
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
                 (mt/formatted-rows [->local-date 2.0]
                   (qp/process-query query)))))))))

(deftest ^:parallel cumulative-count-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "cumulative count aggregations"
      (testing "w/o breakout should be treated the same as count"
        (let [query (mt/mbql-query users
                      {:aggregation [[:cum-count $id]]})]
          (mt/with-native-query-testing-context query
            (is (= [[15]]
                   (mt/formatted-rows [int]
                     (qp/process-query query))))))))))

(deftest ^:parallel cumulative-count-with-breakout-test
  (mt/test-drivers (mt/normal-drivers)
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
                 (mt/formatted-rows [str int]
                   (qp/process-query query)))))))))

(deftest ^:parallel cumulative-count-with-breakout-test-2
  (mt/test-drivers (mt/normal-drivers)
    (testing "w/ breakout on field that requires grouping"
      (let [query (mt/mbql-query venues
                    {:aggregation [[:cum-count $id]]
                     :breakout    [$price]})]
        (mt/with-native-query-testing-context query
          (is (= [[1 22]
                  [2 81]
                  [3 94]
                  [4 100]]
                 (mt/formatted-rows [int int]
                   (qp/process-query query)))))))))

(deftest ^:parallel cumulative-count-with-multiple-breakouts-test
  (testing "Should be ORDERED BY first BREAKOUT and PARTITIONED BY the second BREAKOUT (#2862, #42003)"
    (mt/test-drivers (mt/normal-drivers)
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
                 (mt/formatted-rows [->local-date ->local-date int]
                   (qp/process-query query)))))))))

(deftest ^:parallel cumulative-count-with-three-breakouts-test
  (testing "Three breakouts: should be ORDERED BY first BREAKOUT and PARTITIONED BY second and third BREAKOUTS (#2862, #42003)"
    (mt/test-drivers (mt/normal-drivers)
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
                 (mt/formatted-rows [->local-date ->local-date ->local-date int]
                   (qp/process-query query)))))))))

(deftest ^:parallel cumulative-count-without-field-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "cumulative count without a field"
      (let [query (mt/mbql-query venues
                    {:aggregation [[:cum-count]]
                     :breakout    [$price]})]
        (mt/with-native-query-testing-context query
          (is (= [[1 22]
                  [2 81]
                  [3 94]
                  [4 100]]
                 (mt/formatted-rows [int int]
                   (qp/process-query query)))))))))

(deftest ^:parallel cumulative-count-with-bucketed-breakout-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "cumulative count with a temporally bucketed breakout"
      (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
        (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
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
                   (mt/formatted-rows [->local-date int]
                     (qp/process-query query))))))))))

(deftest ^:parallel cumulative-sum-with-multiple-breakouts-test
  (testing "Should be ORDERED BY first BREAKOUT and PARTITIONED BY the second BREAKOUT (#2862, #42003)"
    (mt/test-drivers (mt/normal-drivers)
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
                 (mt/formatted-rows [->local-date ->local-date 2.0]
                   (qp/process-query query)))))))))

(deftest ^:parallel cumulative-sum-with-three-breakouts-test
  (testing "Three breakouts: should be ORDERED BY first BREAKOUT and PARTITIONED BY last two BREAKOUTS (#2862, #42003)"
    (mt/test-drivers (mt/normal-drivers)
      (let [query (-> (mt/mbql-query orders
                        {:aggregation [[:cum-sum $total]]
                         :breakout    [!day.created_at !year.created_at !month.created_at]
                         :limit       4})
                      (assoc-in [:middleware :format-rows?] false))]
        (mt/with-native-query-testing-context query
          ;; you can sanity check these numbers by changing `:cum-sum` to `:sum` and adding them up manually.
          (is (= [[#t "2016-04-30" #t "2016-01-01" #t "2016-04-01" 52.76]
                  [#t "2016-05-04" #t "2016-01-01" #t "2016-05-01" 98.78]  ; <-- total should reset here, when last two breakouts change
                  [#t "2016-05-06" #t "2016-01-01" #t "2016-05-01" 186.07]
                  [#t "2016-05-08" #t "2016-01-01" #t "2016-05-01" 270.94]]
                 (mt/formatted-rows [->local-date ->local-date ->local-date 2.0]
                   (qp/process-query query)))))))))

(deftest ^:parallel cumulative-count-and-sum-in-expressions-test
  (testing "Cumulative count should work inside expressions (#13634, #15118)"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
      (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
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
                 (mt/formatted-rows [->local-date int 2.0 2.0]
                   (qp/process-query query)))))))))

(deftest ^:parallel expressions-inside-cumulative-aggregations-test
  (testing "Expressions inside of cumulative aggregations should work correctly"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
      (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
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
                 (mt/formatted-rows [->local-date 2.0]
                   (qp/process-query query)))))))))

(deftest ^:parallel mixed-cumulative-and-non-cumulative-aggregations-test
  (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/cumulative)
    (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
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
               (mt/formatted-rows [->local-date int 2.0 2.0]
                 (qp/process-query query))))))))

(deftest ^:parallel cumulative-aggregation-with-filter-and-temporal-bucketed-breakout-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join :window-functions/cumulative)
    (testing "Query with a filter and a temporally bucketed breakout should work (#41791)"
      (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
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
          ;;       YEAR            CATEGORY   COUNT CUM-COUNT
          (is (= [[#t "2016-01-01" "Doohickey" 131  131]
                  [#t "2016-01-01" "Gadget"    145  145]
                  [#t "2016-01-01" "Gizmo"     115  115]
                  [#t "2016-01-01" "Widget"    146  146]
                  [#t "2017-01-01" "Doohickey" 617  748] ; 131 + 617 = 748
                  [#t "2017-01-01" "Gadget"    690  835] ; 145 + 690 = 835
                  [#t "2017-01-01" "Gizmo"     616  731]
                  [#t "2017-01-01" "Widget"    718  864]
                  [#t "2018-01-01" "Doohickey" 865  1613]
                  [#t "2018-01-01" "Gadget"    1109 1944]]
                 (mt/formatted-rows
                  [->local-date str int int]
                  (qp/process-query query)))))))))
