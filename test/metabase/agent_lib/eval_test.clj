(ns metabase.agent-lib.eval-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.agent-lib.core :as program]
   [metabase.agent-lib.test-util :as tu]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.util :as lib.util]))

(deftest ^:parallel expression-ref-parity-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["expression" "Net Amount"
                               ["-" ["field" (meta/id :orders :total)]
                                ["field" (meta/id :orders :discount)]]]
                              ["order-by" ["desc" ["expression-ref" "Net Amount"]]]
                              ["limit" 10]]}
        expected (-> (tu/query-for-table :orders)
                     (lib/expression "Net Amount"
                                     (lib/- (meta/field-metadata :orders :total)
                                            (meta/field-metadata :orders :discount)))
                     (as-> query
                           (lib/order-by query (lib/expression-ref query "Net Amount") :desc))
                     (lib/limit 10))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
               tu/comparable-query)))))

(deftest ^:parallel expression-ref-breakout-parity-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["expression" "Hour of Day" ["get-hour" ["field" (meta/id :orders :created-at)]]]
                              ["aggregate" ["count"]]
                              ["breakout" ["expression-ref" "Hour of Day"]]
                              ["order-by" ["expression-ref" "Hour of Day"]]]}
        base-query (-> (tu/query-for-table :orders)
                       (lib/expression "Hour of Day" (lib/get-hour (meta/field-metadata :orders :created-at)))
                       (lib/aggregate (lib/count)))
        expected   (as-> base-query query
                     (let [expr-ref (lib/expression-ref query "Hour of Day")]
                       (-> query
                           (lib/breakout expr-ref)
                           (lib/order-by (lib.util/fresh-uuids expr-ref)))))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
               tu/comparable-query)))))

(deftest ^:parallel raw-expression-breakout-parity-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["aggregate" ["count"]]
                              ["breakout" ["get-day-of-week" ["field" (meta/id :orders :created-at)]]]
                              ["order-by" ["get-day-of-week" ["field" (meta/id :orders :created-at)]]]]}
        base-query (-> (tu/query-for-table :orders)
                       (lib/expression "__breakout_expression_1"
                                       (lib/get-day-of-week (meta/field-metadata :orders :created-at)))
                       (lib/aggregate (lib/count)))
        expected   (as-> base-query query
                     (let [expr-ref (lib/expression-ref query "__breakout_expression_1")]
                       (-> query
                           (lib/breakout expr-ref)
                           (lib/order-by (lib.util/fresh-uuids expr-ref)))))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
               tu/comparable-query)))))

(deftest ^:parallel raw-field-order-by-reuses-matching-breakout-expression-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["aggregate" ["count"]]
                              ["breakout" ["get-hour" ["field" (meta/id :orders :created-at)]]]
                              ["order-by" ["field" (meta/id :orders :created-at)]]]}
        base-query (-> (tu/query-for-table :orders)
                       (lib/expression "__breakout_expression_1"
                                       (lib/get-hour (meta/field-metadata :orders :created-at)))
                       (lib/aggregate (lib/count)))
        expected   (as-> base-query query
                     (let [expr-ref (lib/expression-ref query "__breakout_expression_1")]
                       (-> query
                           (lib/breakout expr-ref)
                           (lib/order-by (lib.util/fresh-uuids expr-ref)))))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
               tu/comparable-query)))))

(deftest ^:parallel raw-expression-order-by-parity-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["expression" "Net Amount"
                               ["-" ["field" (meta/id :orders :total)]
                                ["field" (meta/id :orders :discount)]]]
                              ["order-by" ["desc"
                                           ["-" ["field" (meta/id :orders :total)]
                                            ["field" (meta/id :orders :discount)]]]]
                              ["limit" 10]]}
        expected (-> (tu/query-for-table :orders)
                     (lib/expression "Net Amount"
                                     (lib/- (meta/field-metadata :orders :total)
                                            (meta/field-metadata :orders :discount)))
                     (as-> query
                           (lib/order-by query (lib/expression-ref query "Net Amount") :desc))
                     (lib/limit 10))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
               tu/comparable-query)))))

(deftest ^:parallel expression-projection-parity-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["expression" "Net Amount"
                               ["-" ["field" (meta/id :orders :total)]
                                ["field" (meta/id :orders :discount)]]]
                              ["with-fields" [["field" (meta/id :orders :id)]
                                              ["expression-ref" "Net Amount"]]]
                              ["order-by" ["desc" ["expression-ref" "Net Amount"]]]
                              ["limit" 10]]}
        expected (-> (tu/query-for-table :orders)
                     (lib/expression "Net Amount"
                                     (lib/- (meta/field-metadata :orders :total)
                                            (meta/field-metadata :orders :discount)))
                     (as-> query
                           (-> query
                               (lib/with-fields [(meta/field-metadata :orders :id)
                                                 (lib/expression-ref query "Net Amount")])
                               (lib/order-by (lib/expression-ref query "Net Amount") :desc)))
                     (lib/limit 10))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
               tu/comparable-query)))))

(deftest ^:parallel same-stage-aggregation-ref-parity-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["aggregate" ["count"]]
                              ["aggregate" ["sum" ["field" (meta/id :venues :price)]]]
                              ["breakout" ["field" (meta/id :venues :category-id)]]
                              ["filter" [">" ["aggregation-ref" 1] 10]]
                              ["order-by" ["desc" ["aggregation-ref" 1]]]]}
        expected (-> (tu/query-for-table :venues)
                     (lib/aggregate (lib/count))
                     (lib/aggregate (lib/sum (meta/field-metadata :venues :price)))
                     (lib/breakout (meta/field-metadata :venues :category-id))
                     (as-> query
                           (-> query
                               (lib/filter (lib/> (lib/aggregation-ref query 1) 10))
                               (lib/order-by (lib/aggregation-ref query 1) :desc))))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :venues))
               tu/comparable-query)))))

(deftest ^:parallel join-with-explicit-fields-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["join"
                               ["with-join-fields"
                                ["with-join-conditions"
                                 ["join-clause" ["table" (meta/id :categories)]]
                                 [["=" ["field" (meta/id :venues :category-id)]
                                   ["field" (meta/id :categories :id)]]]]
                                [["field" (meta/id :categories :name)]]]]]}
        base-query (lib.tu/venues-query)
        expected (-> base-query
                     (lib/join (-> (lib/join-clause (meta/table-metadata :categories))
                                   (lib/with-join-conditions
                                    [(lib/= (tu/current-query-column base-query (meta/id :venues :category-id))
                                            (tu/current-query-column base-query (meta/id :categories :id)))])
                                   (lib/with-join-fields
                                     [(tu/current-query-column base-query (meta/id :categories :name))]))))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :venues :categories))
               tu/comparable-query)))))

(deftest ^:parallel implicit-join-field-parity-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["with-fields" [["field" (meta/id :orders :id)]
                                              ["field" (meta/id :products :title)]]]
                              ["order-by" ["asc" ["field" (meta/id :products :title)]]]]}
        base-query (tu/query-for-table :orders)
        expected (-> base-query
                     (lib/with-fields [(tu/current-query-column base-query (meta/id :orders :id))
                                       (tu/current-query-column base-query (meta/id :products :title))])
                     (lib/order-by (tu/current-query-column base-query (meta/id :products :title)) :asc))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders :products))
               tu/comparable-query)))))

(deftest ^:parallel implicit-join-field-outside-context-parity-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["with-fields" [["field" (meta/id :orders :id)]
                                              ["field" (meta/id :products :title)]]]
                              ["order-by" ["asc" ["field" (meta/id :products :title)]]]]}
        base-query (tu/query-for-table :orders)
        expected (-> base-query
                     (lib/with-fields [(tu/current-query-column base-query (meta/id :orders :id))
                                       (tu/current-query-column base-query (meta/id :products :title))])
                     (lib/order-by (tu/current-query-column base-query (meta/id :products :title)) :asc))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
               tu/comparable-query)))))

(deftest ^:parallel explicit-join-table-outside-context-parity-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["join"
                               ["with-join-fields"
                                ["with-join-conditions"
                                 ["join-clause" ["table" (meta/id :categories)]]
                                 [["=" ["field" (meta/id :venues :category-id)]
                                   ["field" (meta/id :categories :id)]]]]
                                [["field" (meta/id :categories :name)]]]]
                              ["filter" ["=" ["field" (meta/id :categories :name)] "Mexican"]]]}
        base-query (lib.tu/venues-query)
        expected (as-> base-query query
                   (lib/join query
                             (-> (lib/join-clause (meta/table-metadata :categories))
                                 (lib/with-join-conditions
                                  [(lib/= (tu/current-query-column base-query (meta/id :venues :category-id))
                                          (tu/current-query-column base-query (meta/id :categories :id)))])
                                 (lib/with-join-fields
                                   [(tu/current-query-column base-query (meta/id :categories :name))])))
                   (lib/filter query (lib/= (tu/current-query-column query (meta/id :categories :name)) "Mexican")))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :venues))
               tu/comparable-query)))))

(deftest ^:parallel redundant-explicit-join-to-implicit-related-table-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["join"
                               ["with-join-conditions"
                                ["join-clause" ["table" (meta/id :products)]]
                                [["=" ["field" (meta/id :orders :product-id)]
                                  ["field" (meta/id :products :id)]]]]]
                              ["filter" ["=" ["field" (meta/id :products :title)] "Widget"]]
                              ["aggregate" ["count"]]]}
        context  (tu/table-context-with-join-edges :orders
                                                   [:products]
                                                   [(tu/join-edge :orders :product-id :products :id)])
        base-query (tu/query-for-table :orders)
        expected (-> base-query
                     (lib/filter (lib/= (tu/current-query-column base-query (meta/id :products :title)) "Widget"))
                     (lib/aggregate (lib/count)))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider context)
               tu/comparable-query)))))

(deftest ^:parallel implicit-join-filter-field-uses-source-field-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["filter" ["contains" ["field" (meta/id :products :title)] "widget"]]
                              ["aggregate" ["count"]]]}
        base-query (tu/query-for-table :orders)
        expected (-> base-query
                     (lib/filter (lib/contains (tu/current-query-column base-query (meta/id :products :title)) "widget"))
                     (lib/aggregate (lib/count)))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders :products))
               tu/comparable-query)))))

(deftest ^:parallel explicit-join-with-field-selection-is-not-dropped-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["join"
                               ["with-join-fields"
                                ["with-join-conditions"
                                 ["join-clause" ["table" (meta/id :categories)]]
                                 [["=" ["field" (meta/id :venues :category-id)]
                                   ["field" (meta/id :categories :id)]]]]
                                [["field" (meta/id :categories :name)]]]]
                              ["filter" ["=" ["field" (meta/id :categories :name)] "Mexican"]]]}
        context  (tu/table-context-with-join-edges :venues
                                                   [:categories]
                                                   [(tu/join-edge :venues :category-id :categories :id)])
        base-query (lib.tu/venues-query)
        expected (as-> base-query query
                   (lib/join query
                             (-> (lib/join-clause (meta/table-metadata :categories))
                                 (lib/with-join-conditions
                                  [(lib/= (tu/current-query-column base-query (meta/id :venues :category-id))
                                          (tu/current-query-column base-query (meta/id :categories :id)))])
                                 (lib/with-join-fields
                                   [(tu/current-query-column base-query (meta/id :categories :name))])))
                   (lib/filter query (lib/= (tu/current-query-column query (meta/id :categories :name)) "Mexican")))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider context)
               tu/comparable-query)))))

(deftest ^:parallel append-stage-explicit-related-join-falls-back-to-implicit-related-field-test
  (let [implicit-program {:source     {:type "context" :ref "source"}
                          :operations [["breakout" ["field" (meta/id :orders :product-id)]]
                                       ["append-stage"]
                                       ["breakout" ["field" (meta/id :products :title)]]]}
        explicit-program {:source     {:type "context" :ref "source"}
                          :operations [["breakout" ["field" (meta/id :orders :product-id)]]
                                       ["append-stage"]
                                       ["join"
                                        ["with-join-conditions"
                                         ["join-clause" ["table" (meta/id :products)]]
                                         [["=" ["field" (meta/id :orders :product-id)]
                                           ["field" (meta/id :products :id)]]]]]
                                       ["breakout" ["field" (meta/id :products :title)]]]}
        context          (tu/table-context :orders :products)]
    (is (= (-> (program/evaluate-program implicit-program meta/metadata-provider context)
               tu/comparable-query)
           (-> (program/evaluate-program explicit-program meta/metadata-provider context)
               tu/comparable-query)))))

(deftest ^:parallel bare-order-by-field-parity-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["with-fields" [["field" (meta/id :orders :id)]
                                              ["field" (meta/id :products :title)]]]
                              ["order-by" ["field" (meta/id :products :title)]]]}
        base-query (tu/query-for-table :orders)
        expected (-> base-query
                     (lib/with-fields [(tu/current-query-column base-query (meta/id :orders :id))
                                       (tu/current-query-column base-query (meta/id :products :title))])
                     (lib/order-by (tu/current-query-column base-query (meta/id :products :title)) :asc))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders :products))
               tu/comparable-query)))))

(deftest ^:parallel append-stage-raw-field-falls-back-to-previous-stage-column-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["aggregate" ["avg" ["field" (meta/id :orders :total)]]]
                              ["append-stage"]
                              ["order-by" ["desc" ["field" (meta/id :orders :total)]]]]}
        base-query (-> (tu/query-for-table :orders)
                       (lib/aggregate (lib/avg (meta/field-metadata :orders :total)))
                       (lib/append-stage))
        expected   (lib/order-by base-query (tu/previous-stage-aggregation-column base-query 0) :desc)]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
               tu/comparable-query)))))

(deftest ^:parallel aggregate-order-by-raw-field-falls-back-to-aggregation-column-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["aggregate" ["min" ["field" (meta/id :orders :total)]]]
                              ["order-by" ["field" (meta/id :orders :total)]]]}
        base-query (-> (tu/query-for-table :orders)
                       (lib/aggregate (lib/min (meta/field-metadata :orders :total))))
        expected   (lib/order-by base-query (tu/current-aggregation-orderable base-query 0))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
               tu/comparable-query)))))

(deftest ^:parallel grouped-raw-field-order-by-falls-back-to-aggregation-column-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["aggregate" ["avg" ["field" (meta/id :orders :total)]]]
                              ["breakout" ["field" (meta/id :orders :product-id)]]
                              ["order-by" ["desc" ["field" (meta/id :orders :total)]]]]}
        base-query (-> (tu/query-for-table :orders)
                       (lib/aggregate (lib/avg (meta/field-metadata :orders :total)))
                       (lib/breakout (meta/field-metadata :orders :product-id)))
        expected   (lib/order-by base-query (tu/current-aggregation-orderable base-query 0) :desc)]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
               tu/comparable-query)))))

(deftest ^:parallel append-stage-aggregate-raw-field-falls-back-to-previous-stage-column-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["aggregate" ["avg" ["field" (meta/id :orders :total)]]]
                              ["append-stage"]
                              ["aggregate" ["avg" ["field" (meta/id :orders :total)]]]]}
        base-query (-> (tu/query-for-table :orders)
                       (lib/aggregate (lib/avg (meta/field-metadata :orders :total)))
                       (lib/append-stage))
        expected   (lib/aggregate base-query (lib/avg (tu/previous-stage-aggregation-column base-query 0)))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
               tu/comparable-query)))))

(deftest ^:parallel append-stage-filter-on-unavailable-raw-field-is-rejected-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["aggregate" ["count"]]
                              ["append-stage"]
                              ["filter" [">" ["field" (meta/id :orders :total)] 10]]]}
        error   (try
                  (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
                  nil
                  (catch clojure.lang.ExceptionInfo e
                    e))]
    (is error)
    (is (= :invalid-generated-program (:error (ex-data error))))
    (is (re-find #"not available in the current query stage"
                 (:details (ex-data error))))))

(deftest ^:parallel relative-date-alias-parity-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["filter" [">="
                                         ["field" (meta/id :orders :created-at)]
                                         ["relative-date" -90 "day"]]]
                              ["limit" 10]]}
        expected (-> (tu/query-for-table :orders)
                     (lib/filter (lib/>= (meta/field-metadata :orders :created-at)
                                         (lib/relative-datetime -90 :day)))
                     (lib/limit 10))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
               tu/comparable-query)))))

(deftest ^:parallel aggregate-over-aggregation-ref-source-program-parity-test
  (let [program {:source     {:type "program"
                              :program {:source     {:type "context" :ref "source"}
                                        :operations [["aggregate" ["sum" ["field" (meta/id :orders :total)]]]
                                                     ["breakout" ["field" (meta/id :orders :created-at)]]]}}
                 :operations [["aggregate" ["stddev" ["aggregation-ref" 0]]]]}
        base-query (-> (tu/query-for-table :orders)
                       (lib/aggregate (lib/sum (meta/field-metadata :orders :total)))
                       (lib/breakout (meta/field-metadata :orders :created-at))
                       (lib/append-stage))
        expected   (lib/aggregate base-query (lib/stddev (tu/previous-stage-aggregation-column base-query 0)))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
               tu/comparable-query)))))

(deftest ^:parallel repaired-program-evaluation-parity-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["filter" ["is-not-null" ["field" (meta/id :orders :discount)]]]
                              ["filter" ["=" ["field" (meta/id :orders :product-id)] [1 2]]]
                              ["aggregate" ["count-if" ["=" ["field" (meta/id :orders :product-id)] 1]]
                               ["variance" ["field" (meta/id :orders :total)]]]]}
        expected (-> (tu/query-for-table :orders)
                     (lib/filter (lib/not-null (meta/field-metadata :orders :discount)))
                     (lib/filter (lib/in (meta/field-metadata :orders :product-id) 1 2))
                     (lib/aggregate (lib/count-where (lib/= (meta/field-metadata :orders :product-id) 1)))
                     (lib/aggregate (lib/var (meta/field-metadata :orders :total))))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
               tu/comparable-query)))))

(deftest ^:parallel datetime-diff-parity-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["expression" "Days Since Order"
                               ["datetime-diff" ["now"]
                                ["field" (meta/id :orders :created-at)] "day"]]
                              ["with-fields" [["field" (meta/id :orders :id)]
                                              ["expression-ref" "Days Since Order"]]]
                              ["limit" 10]]}
        expected (-> (tu/query-for-table :orders)
                     (lib/expression "Days Since Order"
                                     (lib/expression-clause :datetime-diff
                                                            [(lib/now)
                                                             (meta/field-metadata :orders :created-at)
                                                             :day]
                                                            nil))
                     (as-> query
                           (lib/with-fields query [(meta/field-metadata :orders :id)
                                                   (lib/expression-ref query "Days Since Order")]))
                     (lib/limit 10))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
               tu/comparable-query)))))

(deftest ^:parallel later-stage-aggregation-ref-expression-parity-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["aggregate" ["sum" ["field" (meta/id :orders :total)]]]
                              ["breakout" ["field" (meta/id :orders :product-id)]]
                              ["append-stage"]
                              ["expression" "Revenue K" ["/" ["aggregation-ref" 0] 1000]]
                              ["with-fields" [["field" (meta/id :orders :product-id)]
                                              ["expression-ref" "Revenue K"]]]
                              ["order-by" ["desc" ["expression-ref" "Revenue K"]]]]}
        base-query (-> (tu/query-for-table :orders)
                       (lib/aggregate (lib/sum (meta/field-metadata :orders :total)))
                       (lib/breakout (meta/field-metadata :orders :product-id))
                       lib/append-stage)
        agg-column (tu/previous-stage-aggregation-column base-query 0)
        expected   (-> base-query
                       (lib/expression "Revenue K" (lib// agg-column 1000))
                       (as-> query
                             (-> query
                                 (lib/with-fields [(tu/current-query-column query (meta/id :orders :product-id))
                                                   (lib/expression-ref query "Revenue K")])
                                 (lib/order-by (lib/expression-ref query "Revenue K") :desc))))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
               tu/comparable-query)))))

(deftest ^:parallel expression-ref-falls-back-to-previous-stage-column-after-append-stage-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["aggregate" ["sum" ["field" (meta/id :orders :total)]]]
                              ["aggregate" ["sum" ["field" (meta/id :orders :discount)]]]
                              ["append-stage"]
                              ["expression" "Variance" ["-" ["aggregation-ref" 0] ["aggregation-ref" 1]]]
                              ["append-stage"]
                              ["aggregate" ["avg" ["expression-ref" "Variance"]]]]}
        base-query (-> (tu/query-for-table :orders)
                       (lib/aggregate (lib/sum (meta/field-metadata :orders :total)))
                       (lib/aggregate (lib/sum (meta/field-metadata :orders :discount)))
                       lib/append-stage)
        variance-stage (lib/expression base-query
                                       "Variance"
                                       (lib/- (tu/previous-stage-aggregation-column base-query 0)
                                              (tu/previous-stage-aggregation-column base-query 1)))
        appended (lib/append-stage variance-stage)
        expected (lib/aggregate appended
                                (lib/avg (tu/current-query-column-by-name appended "Variance")))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
               tu/comparable-query)))))

(deftest ^:parallel aggregated-with-fields-raw-fields-become-breakouts-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["aggregate" ["avg" ["field" (meta/id :orders :total)]]]
                              ["with-fields" [["field" (meta/id :orders :product-id)]
                                              ["field" (meta/id :orders :id)]]]]}
        expected (-> (tu/query-for-table :orders)
                     (lib/aggregate (lib/avg (meta/field-metadata :orders :total)))
                     (lib/breakout (meta/field-metadata :orders :product-id))
                     (lib/breakout (meta/field-metadata :orders :id)))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
               tu/comparable-query)))))

(deftest ^:parallel aggregated-with-fields-aggregation-ref-selection-parity-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["aggregate" ["count"]]
                              ["with-fields" [["aggregation-ref" 0]]]]}
        base-query (-> (tu/query-for-table :orders)
                       (lib/aggregate (lib/count)))
        appended   (lib/append-stage base-query)
        expected   (lib/with-fields appended [(tu/previous-stage-aggregation-column appended 0)])]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
               tu/comparable-query)))))

(deftest ^:parallel nested-source-program-parity-test
  (let [program {:source     {:type "program"
                              :program {:source     {:type "context" :ref "source"}
                                        :operations [["filter" ["<" ["field" (meta/id :orders :total)] 100]]
                                                     ["with-fields" [["field" (meta/id :orders :id)]
                                                                     ["field" (meta/id :orders :total)]]]]}}
                 :operations [["limit" 5]]}
        expected (-> (tu/query-for-table :orders)
                     (lib/filter (lib/< (meta/field-metadata :orders :total) 100))
                     (lib/with-fields [(meta/field-metadata :orders :id)
                                       (meta/field-metadata :orders :total)])
                     (lib/limit 5))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
               tu/comparable-query)))))

(deftest ^:parallel nested-join-source-program-parity-test
  (let [nested-program {:source     {:type "table" :id (meta/id :products)}
                        :operations [["with-fields" [["field" (meta/id :products :id)]
                                                     ["field" (meta/id :products :title)]]]]}
        program        {:source     {:type "context" :ref "source"}
                        :operations [["join"
                                      ["with-join-conditions"
                                       ["join-clause" {:type "program" :program nested-program}]
                                       [["=" ["field" (meta/id :orders :product-id)]
                                         ["field" (meta/id :products :id)]]]]]]}
        joined-query   (-> (tu/query-for-table :products)
                           (lib/with-fields [(meta/field-metadata :products :id)
                                             (meta/field-metadata :products :title)]))
        base-query     (tu/query-for-table :orders)
        expected       (-> base-query
                           (lib/join (-> (lib/join-clause joined-query)
                                         (lib/with-join-conditions
                                          [(lib/= (tu/current-query-column base-query (meta/id :orders :product-id))
                                                  (tu/current-query-column base-query (meta/id :products :id)))]))))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders :products))
               tu/comparable-query)))))

(deftest ^:parallel with-page-parity-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["with-page" {:page 2 :items 25}]]}
        expected (lib/with-page (tu/query-for-table :orders) {:page 2 :items 25})]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
               tu/comparable-query)))))

(deftest ^:parallel stage-ops-parity-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["append-stage"]
                              ["drop-empty-stages"]
                              ["append-stage"]
                              ["with-page" {:page 2 :items 25}]
                              ["drop-stage"]]}
        expected (-> (tu/query-for-table :orders)
                     lib/append-stage
                     lib/drop-empty-stages
                     lib/append-stage
                     (lib/with-page {:page 2 :items 25})
                     lib/drop-stage)]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
               tu/comparable-query)))))

(deftest ^:parallel invalid-case-default-object-test
  (let [total-field-id (meta/id :orders :total)
        case-expr      ["case" [[[">" ["field" total-field-id] 100]
                                 ["field" total-field-id]]]
                        {:default nil}]
        program        {:source     {:type "context" :ref "source"}
                        :operations [["expression" "Maybe Revenue" case-expr]]}
        error   (try
                  (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
                  nil
                  (catch clojure.lang.ExceptionInfo e
                    e))]
    (is error)
    (is (= :invalid-generated-program (:error (ex-data error))))
    (is (= "case" (:operator (ex-data error))))
    (is (re-find #"fallback value itself as the optional third argument"
                 (:details (ex-data error))))
    (is (re-find #"Omit the third argument instead of using null"
                 (:details (ex-data error))))))

(deftest ^:parallel invalid-bare-field-id-in-aggregation-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["aggregate" ["sum" (meta/id :orders :total)]]]}
        error   (try
                  (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
                  nil
                  (catch clojure.lang.ExceptionInfo e
                    e))]
    (is error)
    (is (= :invalid-generated-program (:error (ex-data error))))
    (is (= "sum" (:operator (ex-data error))))
    (is (= :field-wrapper (:retry-category (ex-data error))))
    (is (re-find #"Wrap field ids with `\[\"field\", id\]` inside `sum`"
                 (:details (ex-data error))))))

(deftest ^:parallel invalid-unknown-ref-helper-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["expression" "Percentage Share" ["sum-ref"]]]}
        error   (try
                  (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
                  nil
                  (catch clojure.lang.ExceptionInfo e
                    e))]
    (is error)
    (is (= :invalid-generated-program (:error (ex-data error))))
    (is (= "sum-ref" (:operator (ex-data error))))
    (is (re-find #"unknown helper reference"
                 (:details (ex-data error))))))

(deftest ^:parallel conditional-average-case-parity-test
  (let [total-field-id (meta/id :orders :total)
        case-expr      ["case" [[[">" ["field" total-field-id] 100]
                                 ["field" total-field-id]]]]
        program        {:source     {:type "context" :ref "source"}
                        :operations [["expression" "Large Total" case-expr]
                                     ["aggregate" ["avg" ["expression-ref" "Large Total"]]]]}
        expected (-> (tu/query-for-table :orders)
                     (lib/expression "Large Total"
                                     (lib/case [[(lib/> (meta/field-metadata :orders :total) 100)
                                                 (meta/field-metadata :orders :total)]]))
                     (as-> query
                           (lib/aggregate query (lib/avg (lib/expression-ref query "Large Total")))))]
    (is (= (tu/comparable-query expected)
           (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
               tu/comparable-query)))))

(deftest ^:parallel offset-expression-defers-to-lib-core-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["aggregate" ["sum" ["field" (meta/id :orders :total)]]]
                              ["breakout" ["with-temporal-bucket" ["field" (meta/id :orders :created-at)] "month"]]
                              ["order-by" ["asc"
                                           ["with-temporal-bucket"
                                            ["field" (meta/id :orders :created-at)] "month"]]]
                              ["append-stage"]
                              ["expression" "Prev Revenue" ["offset" ["aggregation-ref" 0] -1]]]}
        base-query (-> (tu/query-for-table :orders)
                       (lib/aggregate (lib/sum (meta/field-metadata :orders :total)))
                       (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :month))
                       (lib/order-by (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :month) :asc)
                       lib/append-stage)
        agg-column (tu/previous-stage-aggregation-column base-query 0)
        lib-error  (try
                     (-> base-query
                         (lib/expression "Prev Revenue" (lib/offset agg-column -1)))
                     nil
                     (catch Exception e
                       e))
        program-error (try
                        (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
                        nil
                        (catch clojure.lang.ExceptionInfo e
                          e))]
    (testing "structured evaluation should defer to lib.core instead of rejecting this pattern preemptively"
      (is lib-error)
      (is program-error)
      (is (re-find #"non-aggregation expression" (ex-message lib-error)))
      (is (re-find #"non-aggregation expression" (:details (ex-data program-error))))
      (is (not (re-find #"named expressions must be non-aggregation only"
                        (:details (ex-data program-error)))))
      (is (= :invalid-generated-program (:error (ex-data program-error)))))))

(deftest ^:parallel field-options-temporal-unit-parity-test
  (testing "`[\"field\" id {\"temporal-unit\" ...}]` is equivalent to `with-temporal-bucket`"
    (let [created-at (meta/field-metadata :orders :created-at)
          program    {:source     {:type "context" :ref "source"}
                      :operations [["aggregate" ["sum" ["field" (meta/id :orders :total)]]]
                                   ["breakout" ["field" (meta/id :orders :created-at)
                                                {"temporal-unit" "month"}]]
                                   ["order-by" ["field" (meta/id :orders :created-at)
                                                {"temporal-unit" "month"}] "asc"]]}
          expected   (-> (tu/query-for-table :orders)
                         (lib/aggregate (lib/sum (meta/field-metadata :orders :total)))
                         (lib/breakout (lib/with-temporal-bucket created-at :month))
                         (lib/order-by (lib/with-temporal-bucket created-at :month) :asc))]
      (is (= (tu/comparable-query expected)
             (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
                 tu/comparable-query))))))

(deftest ^:parallel field-options-binning-parity-test
  (testing "`[\"field\" id {\"binning\" ...}]` is equivalent to `with-binning`"
    (let [total    (meta/field-metadata :orders :total)
          binning  {:strategy :num-bins :num-bins 10}
          program  {:source     {:type "context" :ref "source"}
                    :operations [["aggregate" ["count"]]
                                 ["breakout" ["field" (meta/id :orders :total)
                                              {"binning" {"strategy" "num-bins"
                                                          "num-bins" 10}}]]]}
          expected (-> (tu/query-for-table :orders)
                       (lib/aggregate (lib/count))
                       (lib/breakout (lib/with-binning total binning)))]
      (is (= (tu/comparable-query expected)
             (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
                 tu/comparable-query))))))

(deftest ^:parallel field-options-combined-parity-test
  (testing "`[\"field\" id {temporal-unit ... binning ...}]` composes both wrappers"
    (let [created-at (meta/field-metadata :orders :created-at)
          program    {:source     {:type "context" :ref "source"}
                      :operations [["aggregate" ["count"]]
                                   ["breakout" ["field" (meta/id :orders :created-at)
                                                {"temporal-unit" "month"
                                                 "binning"       {"strategy" "default"}}]]]}
          expected   (-> (tu/query-for-table :orders)
                         (lib/aggregate (lib/count))
                         (lib/breakout (-> created-at
                                           (lib/with-temporal-bucket :month)
                                           (lib/with-binning {:strategy :default}))))]
      (is (= (tu/comparable-query expected)
             (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
                 tu/comparable-query))))))

(deftest ^:parallel field-like-map-breakout-and-order-by-vector-wrapper-parity-test
  (testing "field-like maps inside breakout and a vector-wrapped order-by yield canonical MBQL"
    (let [created-at (meta/field-metadata :orders :created-at)
          program    {:source     {:type "context" :ref "source"}
                      :operations [["aggregate" ["count"]]
                                   ["breakout" {"field_id"        (meta/id :orders :created-at)
                                                "temporal_bucket" "month"}]
                                   ["order-by" [["asc" {"field_id"        (meta/id :orders :created-at)
                                                        "temporal_bucket" "month"}]]]]}
          expected   (-> (tu/query-for-table :orders)
                         (lib/aggregate (lib/count))
                         (lib/breakout (lib/with-temporal-bucket created-at :month))
                         (lib/order-by (lib/with-temporal-bucket created-at :month) :asc))]
      (is (= (tu/comparable-query expected)
             (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
                 tu/comparable-query))))))

(deftest ^:parallel field-like-map-order-by-with-direction-key-parity-test
  (testing "an order-by field-like map with a `direction` key yields canonical MBQL"
    (let [created-at (meta/field-metadata :orders :created-at)
          program    {:source     {:type "context" :ref "source"}
                      :operations [["aggregate" ["count"]]
                                   ["breakout" {"field_id"        (meta/id :orders :created-at)
                                                "temporal_bucket" "month"}]
                                   ["order-by" {"field_id"        (meta/id :orders :created-at)
                                                "temporal_bucket" "month"
                                                "direction"       "asc"}]]}
          expected   (-> (tu/query-for-table :orders)
                         (lib/aggregate (lib/count))
                         (lib/breakout (lib/with-temporal-bucket created-at :month))
                         (lib/order-by (lib/with-temporal-bucket created-at :month) :asc))]
      (is (= (tu/comparable-query expected)
             (-> (program/evaluate-program program meta/metadata-provider (tu/table-context :orders))
                 tu/comparable-query))))))
