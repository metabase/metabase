(ns metabase.lib.underlying-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.underlying :as lib.underlying]
   [metabase.lib.util :as lib.util]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

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
          (is (= column (lib.underlying/top-level-column query column))))))))

(deftest ^:parallel top-level-column-test-2
  (testing `lib.underlying/top-level-column
    (testing "returns the column in the top-level query"
      (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                      (lib/aggregate (lib/sum (meta/field-metadata :orders :subtotal)))
                      (lib/breakout (meta/field-metadata :orders :created-at))
                      (lib/append-stage))
            cols  (lib/returned-columns query)]
        (is (= (lib/returned-columns query 0 (lib.util/query-stage query 0))
               (map #(lib.underlying/top-level-column query %) cols)))))))

(deftest ^:parallel top-level-column-test-3
  (testing `lib.underlying/top-level-column
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/join (-> (lib/join-clause (meta/table-metadata :products))
                                  (lib/with-join-alias "P")))
                    (lib/breakout (meta/field-metadata :orders :created-at))
                    (lib/breakout (-> (meta/field-metadata :products :category)
                                      (lib/with-join-alias "P")))
                    lib/append-stage)
          cols  (lib/returned-columns query)]
      (is (=? [{:name "CREATED_AT"}
               {:name "CATEGORY"}]
              cols))
      (testing "CREATED_AT"
        (is (=? {:name          "CREATED_AT"
                 :lib/source    :source/table-defaults
                 :lib/breakout? true}
                (lib.underlying/top-level-column query (first cols)))))
      (testing "CATEGORY"
        (is (=? {:name                         "CATEGORY"
                 :metabase.lib.join/join-alias "P"
                 :lib/source                   :source/joins
                 :lib/breakout?                true}
                (lib.underlying/top-level-column query (second cols))))))))

(deftest ^:parallel top-level-column-rename-options-test
  (testing `lib.underlying/top-level-column
    (testing "respects rename-superfluous-options?"
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
                top-level-col (lib.underlying/top-level-column query col :rename-superfluous-options? rename?)]
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
        (is (= -1 (lib.underlying/top-level-stage-number query)))))))

(deftest ^:parallel top-level-stage-number-test-2
  (testing `lib.underlying/top-level-stage-number
    (testing "returns the stage-number of the top-level query"
      (let [base-query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                           (lib/aggregate (lib/sum (meta/field-metadata :orders :subtotal)))
                           (lib/breakout (meta/field-metadata :orders :created-at)))]
        (doseq [[expected-stage query] [[-1 base-query]
                                        [-2 (-> base-query lib/append-stage)]
                                        [-3 (-> base-query lib/append-stage lib/append-stage)]]]
          (is (= expected-stage
                 (lib.underlying/top-level-stage-number query))))))))

(deftest ^:parallel breakout-sourced?-test
  (let [query          (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                           (lib/join (-> (lib/join-clause (meta/table-metadata :products))
                                         (lib/with-join-alias "P")))
                           (lib/breakout (meta/field-metadata :orders :created-at))
                           (lib/breakout (-> (meta/field-metadata :products :category)
                                             (lib/with-join-alias "P"))))
        returned-cols+ (fn [query]
                         (map (fn [col]
                                (assoc col ::breakout-sourced? (lib.underlying/breakout-sourced? query col)))
                              (lib/returned-columns query)))]
    (testing "breakout was in this stage"
      (is (=? [{:name               "CREATED_AT"
                :lib/source         :source/table-defaults
                :lib/breakout?      true
                ::breakout-sourced? true}
               {:name                         "CATEGORY"
                :metabase.lib.join/join-alias "P"
                :lib/source                   :source/joins
                :lib/breakout?                true
                ::breakout-sourced?           true}]
              (returned-cols+ query))))
    (testing "breakout was in previous stage"
      (is (=? [{:name               "CREATED_AT"
                :lib/source         :source/previous-stage
                :lib/breakout?      false
                ::breakout-sourced? true}
               {:name                         "CATEGORY"
                :lib/original-join-alias      "P"
                :metabase.lib.join/join-alias (symbol "nil #_\"key is not present.\"")
                :lib/source                   :source/previous-stage
                :lib/breakout?                false
                ::breakout-sourced?           true}]
              (returned-cols+ (lib/append-stage query)))))))
