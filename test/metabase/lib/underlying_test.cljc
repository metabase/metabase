(ns metabase.lib.underlying-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.underlying :as lib.underlying]
   [metabase.lib.util :as lib.util]))

(deftest ^:parallel top-level-query-test
  (testing `lib.underlying/top-level-query
    (testing "returns the same query"
      (testing "if the last stage has aggregations"
        (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                        (lib/aggregate (lib/count)))]
          (is (identical? query
                          (lib.underlying/top-level-query query)))))
      (testing "if there are no aggregations in any stage"
        (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                        (lib/append-stage)
                        (lib/filter (lib/= (meta/field-metadata :orders :product-id)
                                           100)))]
          (is (identical? query
                          (lib.underlying/top-level-query query))))))

    (testing "returns the last stage with an aggregation"
      (let [agg-0 (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                      (lib/aggregate (lib/count))
                      (lib/append-stage)
                      (lib/filter (lib/= (meta/field-metadata :orders :product-id)
                                         100)))

            agg-1 (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                      (lib/append-stage)
                      (lib/aggregate (lib/count))
                      (lib/filter (lib/= (meta/field-metadata :orders :product-id)
                                         100)))]
        (is (identical? agg-1
                        (lib.underlying/top-level-query agg-1)))
        (is (= (update agg-0 :stages pop)
               (lib.underlying/top-level-query agg-0)))))

    (testing "returns the last stage with a breakout"
      (let [brk-0 (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                      (lib/breakout (meta/field-metadata :orders :product-id))
                      (lib/append-stage)
                      (lib/filter (lib/= (meta/field-metadata :orders :product-id)
                                         100)))

            brk-1 (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                      (lib/append-stage)
                      (lib/breakout (meta/field-metadata :orders :product-id))
                      (lib/filter (lib/= (meta/field-metadata :orders :product-id)
                                         100)))]
        (is (identical? brk-1
                        (lib.underlying/top-level-query brk-1)))
        (is (= (update brk-0 :stages pop)
               (lib.underlying/top-level-query brk-0)))))))

(deftest ^:parallel top-level-column-test
  (testing `lib.underlying/top-level-column
    (testing "returns the same column if not nested"
      (let [query (lib/query meta/metadata-provider (meta/table-metadata :orders))]
        (doseq [column (lib/returned-columns query)]
          (is (= column (lib.underlying/top-level-column query column))))))

    (testing "returns the column in the top-level query"
      (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                      (lib/aggregate (lib/sum (meta/field-metadata :orders :subtotal)))
                      (lib/breakout (meta/field-metadata :orders :created-at))
                      (lib/append-stage))
            cols  (lib/returned-columns query)]
        (is (= (lib/returned-columns query 0 (lib.util/query-stage query 0))
               (map #(lib.underlying/top-level-column query %) cols)))))))

(deftest ^:parallel top-level-column-rename-options-test
  (testing `lib.underlying/top-level-column
    (testing "respects rename-superflous-options?"
      (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                      (lib/aggregate (lib/sum (meta/field-metadata :orders :subtotal)))
                      (lib/breakout (-> (meta/field-metadata :orders :created-at)
                                        (lib/with-temporal-bucket :month)))
                      (lib/breakout (-> (meta/field-metadata :orders :quantity)
                                        (lib/with-binning {:strategy :num-bins, :num-bins 10}))))
            temporal-col (m/find-first #(= (:name %) "CREATED_AT")
                                       (lib/returned-columns query))
            _          (is (some? temporal-col))
            binned-col (m/find-first #(= (:name %) "QUANTITY")
                                     (lib/returned-columns query))
            _          (is (some? binned-col))
            query      (lib/append-stage query)]

        (doseq [[col key-name] [[temporal-col "temporal-unit"]
                                [binned-col "binning"]]
                rename?        [true false]]
          (let [orig-key      (keyword "metabase.lib.field" key-name)
                renamed-key   (keyword "metabase.lib.underlying" key-name)
                top-level-col (lib.underlying/top-level-column query col :rename-superflous-options? rename?)]
            (testing (str "\nrename? " rename?
                          "\norig-key " orig-key
                          "\nrenamed-key " renamed-key
                          "\ntop-level-col " top-level-col)
              (if rename?
                (do (is (= (orig-key col) (renamed-key top-level-col)))
                    (is (= nil (orig-key top-level-col))))
                (do (is (= (orig-key col) (orig-key top-level-col)))
                    (is (= nil (renamed-key top-level-col))))))))))))

(deftest ^:parallel top-level-stage-number-test
  (testing `lib.underlying/top-level-stage-number
    (testing "returns -1 if not nested"
      (let [query (lib/query meta/metadata-provider (meta/table-metadata :orders))]
        (is (= -1 (lib.underlying/top-level-stage-number query)))))

    (testing "returns the stage-number of the top-level query"
      (let [base-query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                           (lib/aggregate (lib/sum (meta/field-metadata :orders :subtotal)))
                           (lib/breakout (meta/field-metadata :orders :created-at)))]
        (doseq [[expected-stage query] [[-1 base-query]
                                        [-2 (-> base-query lib/append-stage)]
                                        [-3 (-> base-query lib/append-stage lib/append-stage)]]]
          (is (= expected-stage
                 (lib.underlying/top-level-stage-number query))))))))
