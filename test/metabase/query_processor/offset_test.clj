(ns ^:mb/driver-tests metabase.query-processor.offset-test
  "Tests for the new :offset window function clause (#9393)."
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.query-processor.offset-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.test :as qp]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]))

(defn- ->local-date [t]
  (t/local-date
   (cond-> t
     (instance? java.time.Instant t)
     (t/zoned-date-time (t/zone-id "UTC")))))

(deftest ^:parallel simple-offset-test
  (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/offset)
    (let [metadata-provider (mt/metadata-provider)
          orders            (lib.metadata/table metadata-provider (mt/id :orders))
          orders-created-at (lib.metadata/field metadata-provider (mt/id :orders :created_at))
          orders-total      (lib.metadata/field metadata-provider (mt/id :orders :total))
          query             (-> (lib/query metadata-provider orders)
                                ;; 1. year
                                (lib/breakout (lib/with-temporal-bucket orders-created-at :year))
                                ;; 2. sum(total)
                                (lib/aggregate (lib/sum orders-total))
                                ;; 3. sum(total) last year
                                (lib/aggregate (lib/offset (lib/sum orders-total) -1))
                                (lib/limit 3)
                                (assoc-in [:middleware :format-rows?] false))]
      (mt/with-native-query-testing-context query
        ;;       1               2         3
        (is (= [[#t "2016-01-01" 42156.94  nil]
                [#t "2017-01-01" 205256.4  42156.94]
                [#t "2018-01-01" 510043.47 205256.4]]
               (mt/formatted-rows
                [->local-date 2.0 2.0]
                (qp/process-query query))))))))

(deftest ^:parallel offset-aggregation-test
  (testing "yearly growth (this year sales vs last year sales) (#5606)"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/offset)
      (let [metadata-provider (mt/metadata-provider)
            orders            (lib.metadata/table metadata-provider (mt/id :orders))
            orders-created-at (lib.metadata/field metadata-provider (mt/id :orders :created_at))
            orders-total      (lib.metadata/field metadata-provider (mt/id :orders :total))
            query             (-> (lib/query metadata-provider orders)
                                  ;; 1. year
                                  (lib/breakout (lib/with-temporal-bucket orders-created-at :year))
                                  ;; 2. sum(total)
                                  (lib/aggregate (lib/sum orders-total))
                                  ;; 3. yearly growth -- sum(total) / offset(sum(total), -1)
                                  (lib/aggregate (lib/- (lib// (lib/sum orders-total)
                                                               (lib/offset (lib/sum orders-total) -1))
                                                        1.0))
                                  (assoc-in [:middleware :format-rows?] false))]
        (mt/with-native-query-testing-context query
          ;;       1               2       3
          (is (= [[#t "2016-01-01"  42156.94 nil]    ; first year
                  [#t "2017-01-01" 205256.40 3.87]   ; sales up 387% wow!
                  [#t "2018-01-01" 510043.47 1.48]   ; 248% growth!
                  [#t "2019-01-01" 577064.96 0.13]   ; 13% growth doesn't look like a hockey stick to me!
                  [#t "2020-01-01" 176095.93 -0.69]] ; sales down by 69%, oops!
                 (mt/formatted-rows
                  [->local-date 2.0 2.0]
                  (qp/process-query query)))))))))

(deftest ^:parallel offset-aggregation-two-breakouts-test
  (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/offset)
    (let [metadata-provider (mt/metadata-provider)
          orders            (lib.metadata/table metadata-provider (mt/id :orders))
          orders-created-at (lib.metadata/field metadata-provider (mt/id :orders :created_at))
          orders-total      (lib.metadata/field metadata-provider (mt/id :orders :total))
          query             (-> (lib/query metadata-provider orders)
                                ;; 1. month
                                (lib/breakout (lib/with-temporal-bucket orders-created-at :month))
                                ;; 2. year
                                (lib/breakout (lib/with-temporal-bucket orders-created-at :year))
                                ;; 3. sum(total)
                                (lib/aggregate (lib/sum orders-total))
                                ;; 4. monthly growth %
                                (lib/aggregate (lib/* (lib/- (lib// (lib/sum orders-total)
                                                                    (lib/offset (lib/sum orders-total) -1))
                                                             1.0)
                                                      100.0))
                                (lib/limit 12)
                                (assoc-in [:middleware :format-rows?] false))]
      (mt/with-native-query-testing-context query
        ;;       1               2               3        4
        (is (= [[#t "2016-04-01" #t "2016-01-01" 52.76    nil]
                [#t "2016-05-01" #t "2016-01-01" 1265.73  2299.03]
                [#t "2016-06-01" #t "2016-01-01" 2072.92  63.77]
                [#t "2016-07-01" #t "2016-01-01" 3734.72  80.17]
                [#t "2016-08-01" #t "2016-01-01" 4960.65  32.83]
                [#t "2016-09-01" #t "2016-01-01" 5372.09  8.29]
                [#t "2016-10-01" #t "2016-01-01" 7702.93  43.39]
                [#t "2016-11-01" #t "2016-01-01" 7926.69  2.9]
                [#t "2016-12-01" #t "2016-01-01" 9068.45  14.4]
                [#t "2017-01-01" #t "2017-01-01" 11094.77 nil] ; <- should reset here because breakout 2 changed values
                [#t "2017-02-01" #t "2017-01-01" 11243.66 1.34]
                [#t "2017-03-01" #t "2017-01-01" 14115.68 25.54]]
               (mt/formatted-rows
                [->local-date ->local-date 2.0 2.0]
                (qp/process-query query))))))))

(deftest ^:parallel rolling-window-test
  (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/offset)
    (testing "Rolling windows: rolling total of sales last 3 months (#8977)"
      (let [metadata-provider (mt/metadata-provider)
            orders            (lib.metadata/table metadata-provider (mt/id :orders))
            orders-created-at (lib.metadata/field metadata-provider (mt/id :orders :created_at))
            orders-total      (lib.metadata/field metadata-provider (mt/id :orders :total))
            query             (-> (lib/query metadata-provider orders)
                                  ;; 1. month
                                  (lib/breakout (lib/with-temporal-bucket orders-created-at :month))
                                  ;; 2. sum(total)
                                  (lib/aggregate (lib/sum orders-total))
                                  ;; 3. rolling total of sales last 3 months
                                  (lib/aggregate (lib/+ (lib/sum orders-total)
                                                        (lib/offset (lib/sum orders-total) -1)
                                                        (lib/offset (lib/sum orders-total) -2)))
                                  (lib/limit 5)
                                  (assoc-in [:middleware :format-rows?] false))]
        (mt/with-native-query-testing-context query
          ;;       1               2        3
          (is (= [[#t "2016-04-01" 52.76   nil]
                  [#t "2016-05-01" 1265.73 nil]
                  [#t "2016-06-01" 2072.92 3391.41]   ; (+ 2072.92 1265.73 52.76)
                  [#t "2016-07-01" 3734.72 7073.37]   ; (+ 3734.72 2072.92 1265.73)
                  [#t "2016-08-01" 4960.65 10768.29]] ; (+ 4960.65 3734.72 2072.92)
                 (mt/formatted-rows
                  [->local-date 2.0 2.0]
                  (qp/process-query query)))))))))

(deftest ^:parallel lead-test
  (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/offset)
    (testing "Rolling windows: sales for current month and next month (LEAD instead of LAG)"
      (let [metadata-provider (mt/metadata-provider)
            orders            (lib.metadata/table metadata-provider (mt/id :orders))
            orders-created-at (lib.metadata/field metadata-provider (mt/id :orders :created_at))
            orders-total      (lib.metadata/field metadata-provider (mt/id :orders :total))
            query             (-> (lib/query metadata-provider orders)
                                  ;; 1. month
                                  (lib/breakout (lib/with-temporal-bucket orders-created-at :month))
                                  ;; 2. sum(total)
                                  (lib/aggregate (lib/sum orders-total))
                                  ;; 3. rolling total of sales last 3 months
                                  (lib/aggregate (lib/+ (lib/sum orders-total)
                                                        (lib/offset (lib/sum orders-total) 1)))
                                  (lib/limit 4)
                                  (assoc-in [:middleware :format-rows?] false))]
        (mt/with-native-query-testing-context query
          ;;       1               2        3
          (is (= [[#t "2016-04-01" 52.76   1318.49] ; (+ 52.76 1265.73)
                  [#t "2016-05-01" 1265.73 3338.65] ; (+ 1265.73 2072.92)
                  [#t "2016-06-01" 2072.92 5807.64]
                  [#t "2016-07-01" 3734.72 8695.37]]
                 (mt/formatted-rows
                  [->local-date 2.0 2.0]
                  (qp/process-query query)))))))))

(deftest ^:parallel legacy-query-normalization-test
  (testing "Make sure legacy queries work correctly as they come in from the REST API (not-yet-normalized) (#42323)"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/offset)
      ;; TODO(mbql5-migration): exercises legacy-MBQL normalization (§5) — the not-yet-normalized legacy map IS the
      ;; fixture under test (#42323); porting to lib would pre-normalize it. Keep on the old macro.
      (let [query (-> (mt/mbql-query orders
                        {:aggregation [[:offset
                                        ;; missing UUID. Even in legacy we're supposed to be keeping the UUID.
                                        {:name           "Sum previous total"
                                         :display-name   "Sum previous total"
                                         :effective-type :type/Float}
                                        ;; TODO -- Field has string base-type, effective-type
                                        [:sum [:field (mt/id :orders :total) {:base-type :type/Float, :effective-type :type/Float}]]
                                        -1]]
                         :breakout    [[:field (mt/id :orders :created_at) {:base-type :type/DateTime, :temporal-unit :month}]]
                         :limit       3})
                      (assoc-in [:middleware :format-rows?] false))]
        (is (= [[#t "2016-04-01" nil]
                [#t "2016-05-01" 52.76]
                [#t "2016-06-01" 1265.73]]
               (mt/formatted-rows
                [->local-date 2.0]
                (qp/process-query (mt/obj->json->obj query)))))))))

(deftest ^:parallel sort-by-offset-aggregation-test
  (testing "Should be able to sort by an Offset() expression in an aggregation (#42554)"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/offset)
      (let [mp         (mt/metadata-provider)
            orders     (lib.metadata/table mp (mt/id :orders))
            created-at (lib.metadata/field mp (mt/id :orders :created_at))
            total      (lib.metadata/field mp (mt/id :orders :total))
            query      (-> (lib/query mp orders)
                           (lib/breakout (lib/with-temporal-bucket created-at :month))
                           (lib/aggregate (lib/update-options (lib/offset (lib/sum total) -1)
                                                              assoc :name "X" :display-name "X"))
                           (as-> $q (lib/order-by $q (lib/aggregation-ref $q 0)))
                           (lib/limit 3)
                           (assoc-in [:middleware :format-rows?] false))]
        (mt/with-native-query-testing-context query
          (is (= (if (tx/sorts-nil-first? driver/*driver* :type/Float)
                   [[#t "2016-04-01" nil]
                    [#t "2016-05-01" 52.76]
                    [#t "2016-06-01" 1265.73]]
                   [[#t "2016-05-01" 52.76]
                    [#t "2016-06-01" 1265.73]
                    [#t "2016-07-01" 2072.92]])
                 (mt/formatted-rows
                  [->local-date 2.0]
                  (qp/process-query query)))))))))

(deftest ^:parallel external-remapping-with-offset-test
  (testing "External remapping works correctly with offset (#45348)"
    (let [mp (lib.tu/remap-metadata-provider
              (mt/metadata-provider)
              (mt/id :orders :product_id)
              (mt/id :products :title))]
      (doseq [[multiple-breakouts? ofs-col-index]
              [[false 2] [true 3]]]
        (testing (format "multiple-breakouts? `%s`" multiple-breakouts?)
          (let [q (as-> (lib/query mp (lib.metadata/table mp (mt/id :orders))) $
                    (lib/aggregate $ (lib/offset (lib/sum (m/find-first (comp #{"TOTAL"} :name)
                                                                        (lib/visible-columns $)))
                                                 -1))
                    (lib/aggregate $ (lib/sum (m/find-first (comp #{"TOTAL"} :name)
                                                            (lib/visible-columns $))))
                    (lib/breakout $ (m/find-first :lib/external-remap (lib/breakoutable-columns $)))
                    (cond-> $
                      multiple-breakouts?
                      (lib/breakout (m/find-first (comp #{"USER_ID"} :name) (lib/breakoutable-columns $))))
                    (lib/limit $ 10))
                rows (mt/rows (qp/process-query q))
                ofs-ag-col-vals (map #(nth % ofs-col-index) rows)
                ag-col-vals (map #(nth % (inc ofs-col-index)) rows)]
            (testing "Sanity: the first row of offset col is nil"
              (is (nil? (first ofs-ag-col-vals))))
            (testing "Offset column is correctly shifted according to aggregation column"
              (is (= (butlast ag-col-vals)
                     (drop 1 ofs-ag-col-vals))))))))))

(deftest ^:parallel offset-with-date-field-in-breakout-and-custom-expression
  (testing "A query with an offset and a date field in the breakout and a custom expression works (#65503)"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/offset)
      (let [mp (mt/metadata-provider)
            orders (lib.metadata/table mp (mt/id :orders))
            created-at (lib.metadata/field mp (mt/id :orders :created_at))
            total (lib.metadata/field mp (mt/id :orders :total))
            query (-> (lib/query mp orders)
                      (lib/expression "test" created-at)
                      (lib/breakout (lib/with-temporal-bucket created-at :year))
                      (lib/aggregate (lib/sum total))
                      (lib/aggregate (lib/offset (lib/sum total) -1))
                      (assoc-in [:middleware :format-rows?] false))]
        (is (= [[#t "2016-01-01" 42156.94 nil]
                [#t "2017-01-01" 205256.4 42156.94]
                [#t "2018-01-01" 510043.47 205256.4]
                [#t "2019-01-01" 577064.96 510043.47]
                [#t "2020-01-01" 176095.93 577064.96]]
               (->> query
                    (qp/process-query)
                    (mt/formatted-rows [->local-date 2.0 2.0]))))))))

(deftest ^:parallel offset-with-explicit-join-test
  (testing "offset window over an explicitly-joined breakout column works with the offset first or second, and with avg"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/offset :left-join)
      (let [mp         (mt/metadata-provider)
            orders     (lib.metadata/table mp (mt/id :orders))
            products   (lib.metadata/table mp (mt/id :products))
            created-at (lib.metadata/field mp (mt/id :orders :created_at))
            total      (lib.metadata/field mp (mt/id :orders :total))
            category   (lib.metadata/field mp (mt/id :products :category))
            joined     (-> (lib/query mp orders)
                           (lib/join products)
                           (lib/breakout category)
                           (lib/breakout (lib/with-temporal-bucket created-at :year)))]
        (testing "offset as the first aggregation"
          (let [rows (mt/rows (qp/process-query
                               (-> joined
                                   (lib/aggregate (lib/offset (lib/sum total) -1))
                                   (lib/aggregate (lib/sum total)))))]
            (is (seq rows))
            (is (some (comp nil? #(nth % 2)) rows))))
        (testing "offset as the second aggregation"
          (let [rows (mt/rows (qp/process-query
                               (-> joined
                                   (lib/aggregate (lib/sum total))
                                   (lib/aggregate (lib/offset (lib/sum total) -1)))))]
            (is (seq rows))
            (is (some (comp nil? #(nth % 3)) rows))))
        (testing "offset of avg applied to a custom column"
          (let [base (-> (lib/query mp orders)
                         (lib/expression "CC" (lib/* total 2)))
                cc   (m/find-first (comp #{"CC"} :name) (lib/visible-columns base))
                q    (-> base
                         (lib/breakout (lib/with-temporal-bucket created-at :year))
                         (lib/aggregate (lib/offset (lib/avg cc) -1)))]
            (is (seq (mt/rows (qp/process-query q))))))))))

;; A constant custom column used as a breakout compiles to `PARTITION BY <constant>` in the offset window. The #47870
;; regression was a query-processor crash while compiling that shape, so assert compilation succeeds rather than
;; executing: that keeps the test portable (Redshift compiles it fine and only its engine rejects a constant
;; PARTITION BY at execution time) while still catching a recurrence of the compile-time crash.
(deftest ^:parallel offset-with-constant-expression-breakout-test
  (testing "a constant custom column used as a breakout combined with offset(sum) compiles without crashing (#47870)"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/offset)
      (let [mp         (mt/metadata-provider)
            orders     (lib.metadata/table mp (mt/id :orders))
            created-at (lib.metadata/field mp (mt/id :orders :created_at))
            total      (lib.metadata/field mp (mt/id :orders :total))
            base       (-> (lib/query mp orders)
                           (lib/expression "two" (lib/+ 1 1)))
            two        (m/find-first (comp #{"two"} :name) (lib/breakoutable-columns base))
            _          (assert (some? two))]
        (testing "constant CC as the first breakout"
          (is (string? (:query (qp.compile/compile
                                (-> base
                                    (lib/breakout two)
                                    (lib/breakout (lib/with-temporal-bucket created-at :year))
                                    (lib/aggregate (lib/sum total))
                                    (lib/aggregate (lib/offset (lib/sum total) -1))))))))
        (testing "constant CC not in the first breakout position"
          (is (string? (:query (qp.compile/compile
                                (-> base
                                    (lib/breakout (lib/with-temporal-bucket created-at :year))
                                    (lib/breakout two)
                                    (lib/aggregate (lib/sum total))
                                    (lib/aggregate (lib/offset (lib/sum total) -1))))))))))))

(deftest ^:parallel offset-three-breakouts-test
  (testing "offset(sum) over three breakouts compiles and executes"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/offset)
      (let [mp         (mt/metadata-provider)
            orders     (lib.metadata/table mp (mt/id :orders))
            created-at (lib.metadata/field mp (mt/id :orders :created_at))
            total      (lib.metadata/field mp (mt/id :orders :total))
            query      (-> (lib/query mp orders)
                           (lib/breakout (lib/with-temporal-bucket created-at :year))
                           (lib/breakout (lib.metadata/field mp (mt/id :orders :product_id)))
                           (lib/breakout (lib.metadata/field mp (mt/id :orders :user_id)))
                           (lib/aggregate (lib/sum total))
                           (lib/aggregate (lib/offset (lib/sum total) -1)))]
        (is (seq (mt/rows (qp/process-query query))))))))

(deftest ^:parallel offset-with-segment-filter-test
  (testing "a saved segment filter coexists with offset window compilation"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/offset)
      (let [mp         (mt/metadata-provider)
            total      (lib.metadata/field mp (mt/id :orders :total))
            created-at (lib.metadata/field mp (mt/id :orders :created_at))
            mp         (lib.tu/mock-metadata-provider
                        mp
                        {:segments [{:id         1
                                     :name       "Small orders"
                                     :table-id   (mt/id :orders)
                                     :definition (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                                                     (lib/filter (lib/< total 100)))}]})
            query      (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                           (lib/filter (lib.metadata/segment mp 1))
                           (lib/breakout (lib/with-temporal-bucket created-at :year))
                           (lib/aggregate (lib/sum total))
                           (lib/aggregate (lib/offset (lib/sum total) -1)))]
        (is (seq (mt/rows (qp/process-query query))))))))

(deftest ^:parallel offset-follows-desc-order-by-breakout-test
  (testing "with a desc order-by on the breakout, the offset window follows the display order: the first (latest) row has a nil offset and each following row's offset is the previous displayed row's sum"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/offset)
      (let [mp         (mt/metadata-provider)
            orders     (lib.metadata/table mp (mt/id :orders))
            created-at (lib.metadata/field mp (mt/id :orders :created_at))
            total      (lib.metadata/field mp (mt/id :orders :total))
            query      (-> (lib/query mp orders)
                           (lib/breakout (lib/with-temporal-bucket created-at :year))
                           (lib/aggregate (lib/sum total))
                           (lib/aggregate (lib/offset (lib/sum total) -1))
                           (lib/order-by (lib/with-temporal-bucket created-at :year) :desc)
                           (assoc-in [:middleware :format-rows?] false))
            rows       (mt/formatted-rows [->local-date 2.0 2.0] (qp/process-query query))
            years      (map first rows)
            sums       (map second rows)
            offsets    (map #(nth % 2) rows)]
        (testing "breakout years are displayed in descending order"
          (is (= (reverse (sort years)) years)))
        (testing "the first (latest) row has no previous row in the window -> nil offset"
          (is (nil? (first offsets))))
        (testing "each following row's offset is the sum of the row displayed above it"
          (is (= (butlast sums) (rest offsets))))))))

(deftest ^:parallel offset-without-breakout-compiles-test
  (testing "an offset aggregation with no breakout still compiles to native SQL without erroring (#47819)"
    (mt/test-drivers (mt/normal-drivers-with-feature :window-functions/offset)
      (let [mp    (mt/metadata-provider)
            total (lib.metadata/field mp (mt/id :orders :total))
            query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                      (lib/aggregate (lib/offset (lib/sum total) -1)))]
        (is (string? (:query (qp.compile/compile query))))))))
