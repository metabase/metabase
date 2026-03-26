(ns metabase.agent-lib.repair-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.agent-lib.repair :as repair]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel repair-program-normalization-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["aggregate" ["count"] ["variance" ["field" (meta/id :orders :total)]]]
                              ["with-fields" [["field" (meta/id :orders :id)]
                                              ["expression" "Net Total" ["-" ["field" (meta/id :orders :total)] 10]]]]
                              ["filter" ["is-not" ["field" (meta/id :orders :total)] "null"]]
                              ["filter" ["=" ["field" (meta/id :orders :product-id)] ["1" "2"]]]
                              ["breakout"
                               ["with-temporal-bucket" ["field" (meta/id :orders :created-at)] "day-of-week"]]
                              ["order-by" ["field" (meta/id :orders :created-at)]
                               ["desc" ["field" (meta/id :orders :total)]]]]}
        expected {:source     {:type "context" :ref "source"}
                  :operations [["aggregate" ["count"]]
                               ["aggregate" ["var" ["field" (meta/id :orders :total)]]]
                               ["expression" "Net Total" ["-" ["field" (meta/id :orders :total)] 10]]
                               ["with-fields" [["field" (meta/id :orders :id)]
                                               ["expression-ref" "Net Total"]]]
                               ["filter" ["not-null" ["field" (meta/id :orders :total)]]]
                               ["filter" ["in" ["field" (meta/id :orders :product-id)] ["1" "2"]]]
                               ["breakout" ["get-day-of-week" ["field" (meta/id :orders :created-at)]]]
                               ["order-by" ["field" (meta/id :orders :created-at)]]
                               ["order-by" ["desc" ["field" (meta/id :orders :total)]]]]}]
    (is (= expected (repair/repair-program program)))))

(deftest ^:parallel repair-program-quarter-and-diff-normalization-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["filter" ["="
                                         ["with-temporal-bucket"
                                          ["field" (meta/id :orders :created-at)] "quarter"]
                                         "Q1"]]
                              ["breakout"
                               ["with-temporal-bucket"
                                ["field" (meta/id :orders :created-at)] "hour-of-day"]]
                              ["expression" "Quarter Number"
                               ["quarter-of-year" ["field" (meta/id :orders :created-at)]]]
                              ["expression" "Days Open"
                               ["temporal-diff" ["now"]
                                ["field" (meta/id :orders :created-at)] "day"]]]}
        expected {:source     {:type "context" :ref "source"}
                  :operations [["filter" ["="
                                          ["with-temporal-bucket"
                                           ["field" (meta/id :orders :created-at)] "quarter"]
                                          1]]
                               ["breakout"
                                ["get-hour" ["field" (meta/id :orders :created-at)]]]
                               ["expression" "Quarter Number"
                                ["get-quarter" ["field" (meta/id :orders :created-at)]]]
                               ["expression" "Days Open"
                                ["datetime-diff" ["now"]
                                 ["field" (meta/id :orders :created-at)] "day"]]]}]
    (is (= expected (repair/repair-program program)))))

(deftest ^:parallel repair-program-normalizes-if-and-between-bounds-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["filter" ["between"
                                         ["field" (meta/id :orders :created-at)]
                                         ["relative-datetime" -3 "month"]
                                         "2025-09-30"]]
                              ["expression" "Accepted Count"
                               ["if" ["=" ["field" (meta/id :orders :user-id)] 1] 1 0]]]}
        expected {:source     {:type "context" :ref "source"}
                  :operations [["filter" ["between"
                                          ["field" (meta/id :orders :created-at)]
                                          ["relative-datetime" -3 "month"]
                                          ["absolute-datetime" "2025-09-30" "day"]]]
                               ["expression" "Accepted Count"
                                ["case" [[["=" ["field" (meta/id :orders :user-id)] 1] 1]] 0]]]}]
    (is (= expected (repair/repair-program program)))))

(deftest ^:parallel repair-program-normalizes-now-bounds-case-ternaries-and-text-filter-flags-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["filter" ["contains" ["field" (meta/id :orders :product-id)] "friend" false]]
                              ["filter" ["between"
                                         ["field" (meta/id :orders :created-at)]
                                         ["relative-datetime" -3 "month"]
                                         "now"]]
                              ["expression" "Accepted Count"
                               ["case" [["true" ["field" (meta/id :orders :user-id)]]
                                        1
                                        0]]]]}
        expected {:source     {:type "context" :ref "source"}
                  :operations [["filter" ["contains" ["field" (meta/id :orders :product-id)] "friend"]]
                               ["filter" ["between"
                                          ["field" (meta/id :orders :created-at)]
                                          ["relative-datetime" -3 "month"]
                                          ["now"]]]
                               ["expression" "Accepted Count"
                                ["case" [[["field" (meta/id :orders :user-id)] 1]] 0]]]}]
    (is (= expected (repair/repair-program program)))))

(deftest ^:parallel repair-program-unwraps-join-condition-wrapper-test
  (let [wrapped-conditions [[["="
                              ["field" (meta/id :venues :category-id)]
                              ["field" (meta/id :categories :id)]]]]
        expected-conditions [["="
                              ["field" (meta/id :venues :category-id)]
                              ["field" (meta/id :categories :id)]]]
        program             {:source     {:type "context" :ref "source"}
                             :operations [["join"
                                           ["with-join-conditions"
                                            ["join-clause" ["table" (meta/id :categories)]]
                                            wrapped-conditions]]]}
        expected            {:source     {:type "context" :ref "source"}
                             :operations [["join"
                                           ["with-join-conditions"
                                            ["join-clause" ["table" (meta/id :categories)]]
                                            expected-conditions]]]}]
    (is (= expected (repair/repair-program program)))))

(deftest ^:parallel repair-program-rewrites-aggregation-expression-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["expression" "Total Opportunities" ["count"]]
                              ["expression" "Won" ["count-if" ["field" (meta/id :orders :discount)]]]]}
        expected {:source     {:type "context" :ref "source"}
                  :operations [["aggregate" ["count"]]
                               ["aggregate" ["count-where" ["field" (meta/id :orders :discount)]]]]}]
    (is (= expected (repair/repair-program program)))))

(deftest ^:parallel repair-program-drops-stray-bare-aggregation-ref-in-aggregate-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["aggregate" ["count"] ["aggregation-ref" 0]]]}
        expected {:source     {:type "context" :ref "source"}
                  :operations [["aggregate" ["count"]]]}]
    (is (= expected (repair/repair-program program)))))

(deftest ^:parallel repair-program-normalizes-percentile-scale-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["aggregate" ["percentile" ["field" (meta/id :orders :total)] 90]]]}
        expected {:source     {:type "context" :ref "source"}
                  :operations [["aggregate" ["percentile" ["field" (meta/id :orders :total)] 0.9]]]}]
    (is (= expected (repair/repair-program program)))))

(deftest ^:parallel repair-program-inserts-append-stage-before-aggregate-on-aggregation-ref-test
  (let [program {:source     {:type "program"
                              :program {:source     {:type "context" :ref "source"}
                                        :operations [["aggregate" ["sum" ["field" (meta/id :orders :total)]]]
                                                     ["breakout" ["field" (meta/id :orders :created-at)]]]}}
                 :operations [["aggregate" ["stddev" ["aggregation-ref" 0]]]]}
        expected {:source     {:type "program"
                               :program {:source     {:type "context" :ref "source"}
                                         :operations [["aggregate" ["sum" ["field" (meta/id :orders :total)]]]
                                                      ["breakout" ["field" (meta/id :orders :created-at)]]]}}
                  :operations [["append-stage"]
                               ["aggregate" ["stddev" ["aggregation-ref" 0]]]]}]
    (is (= expected (repair/repair-program program)))))

(deftest ^:parallel repair-program-for-context-drops-source-stage-aggregates-for-metric-sources-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["aggregate" ["avg" ["field" (meta/id :orders :total)]]]
                              ["breakout" ["field" (meta/id :orders :product-id)]]
                              ["append-stage"]
                              ["aggregate" ["avg" ["aggregation-ref" 0]]]]}
        context {:source-entity       {:model "metric" :id 42}
                 :referenced-entities []
                 :surrounding-tables  []
                 :join-edges          []}
        expected {:source     {:type "context" :ref "source"}
                  :operations [["breakout" ["field" (meta/id :orders :product-id)]]
                               ["append-stage"]
                               ["aggregate" ["avg" ["aggregation-ref" 0]]]]}]
    (is (= expected (repair/repair-program-for-context program context)))))

(deftest ^:parallel repair-program-for-context-drops-source-stage-with-fields-over-aggregation-ref-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["filter" ["=" ["field" (meta/id :products :category)] "Gizmo"]]
                              ["with-fields" [["field" (meta/id :products :category)]
                                              ["aggregation-ref" 0]]]]}
        context {:source-entity       {:model "metric" :id 83}
                 :referenced-entities []
                 :surrounding-tables  []
                 :measure-ids         []}
        expected {:source     {:type "context" :ref "source"}
                  :operations [["filter" ["=" ["field" (meta/id :products :category)] "Gizmo"]]]}]
    (is (= expected (repair/repair-program-for-context program context)))))

(deftest ^:parallel repair-program-for-context-normalizes-last-quarter-metric-window-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["filter" ["between"
                                         ["field" (meta/id :orders :created-at)]
                                         ["relative-datetime" -3 "month"]
                                         "now"]]
                              ["aggregate" ["count"]]]}
        context {:source-entity       {:model "metric" :id 42}
                 :referenced-entities []
                 :surrounding-tables  []
                 :measure-ids         []}
        expected {:source     {:type "context" :ref "source"}
                  :operations [["filter" ["between"
                                          ["field" (meta/id :orders :created-at)]
                                          ["relative-datetime" -1 "quarter"]
                                          ["relative-datetime" 0 "quarter"]]]]}]
    (is (= expected
           (repair/repair-program-for-context (repair/repair-program program) context)))))
