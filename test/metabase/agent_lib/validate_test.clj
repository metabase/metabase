(ns metabase.agent-lib.validate-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.agent-lib.validate :as validate]))

(deftest ^:parallel validate-program-inserts-append-stage-for-context-metric-source-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["aggregate" ["avg" ["aggregation-ref" 0]]]]}
        context {:source-entity       {:model "metric" :id 42}
                 :source-metadata     nil
                 :referenced-entities []
                 :surrounding-tables  []
                 :measure-ids         []}
        expected {:source     {:type "context" :ref "source"}
                  :operations [["append-stage"]
                               ["aggregate" ["avg" ["aggregation-ref" 0]]]]}]
    (is (= expected (validate/validated-program program context)))))

(deftest ^:parallel validate-program-inserts-append-stage-for-expression-over-aggregation-ref-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["expression" "Churn Rate" ["*" ["aggregation-ref" 0] 100]]]}
        context {:source-entity       {:model "metric" :id 42}
                 :source-metadata     nil
                 :referenced-entities []
                 :surrounding-tables  []
                 :measure-ids         []}
        expected {:source     {:type "context" :ref "source"}
                  :operations [["append-stage"]
                               ["expression" "Churn Rate" ["*" ["aggregation-ref" 0] 100]]]}]
    (is (= expected (validate/validated-program program context)))))

(deftest ^:parallel metric-source-measure-guidance-test
  (let [program {:source     {:type "context" :ref "source"}
                 :operations [["aggregate" ["avg" ["measure" 118]]]]}
        context {:source-entity       {:model "metric" :id 118}
                 :referenced-entities []
                 :surrounding-tables  []
                 :measure-ids         []}]
    (try
      (validate/validated-program program context)
      (is false "expected metric/measure validation to fail")
      (catch clojure.lang.ExceptionInfo e
        (is (= :invalid-generated-program (:error (ex-data e))))
        (is (re-find #"Metric ids are not measure ids" (:details (ex-data e))))))))
