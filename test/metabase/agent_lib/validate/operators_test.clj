(ns metabase.agent-lib.validate.operators-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.agent-lib.validate.operators :as operators]))

(deftest ensure-arity-rejects-invalid-expression-reference-arity-test
  (try
    (operators/ensure-arity! [:operations 0] 'expression 1)
    (is false "expected invalid expression arity")
    (catch clojure.lang.ExceptionInfo e
      (is (= :invalid-generated-program (:error (ex-data e))))
      (is (re-find #"top-level operation" (:details (ex-data e)))))))

(deftest validate-operator-specific-rejects-bare-field-ids-in-aggregations-test
  (try
    (operators/validate-operator-specific! {:table-ids #{}
                                            :card-ids #{}
                                            :metric-ids #{}
                                            :measure-ids #{}
                                            :field-ids #{}}
                                           {:source-entity {:model "table" :id 1}}
                                           [:operations 0 1]
                                           ["sum" 42])
    (is false "expected bare field id validation failure")
    (catch clojure.lang.ExceptionInfo e
      (is (= :invalid-generated-program (:error (ex-data e))))
      (is (= :field-wrapper (:retry-category (ex-data e)))))))

(deftest validate-operator-specific-rejects-source-metric-as-measure-test
  (try
    (operators/validate-operator-specific! {:table-ids #{}
                                            :card-ids #{}
                                            :metric-ids #{}
                                            :measure-ids #{118}
                                            :field-ids #{}}
                                           {:source-entity {:model "metric" :id 118}}
                                           [:operations 0 1]
                                           ["measure" 118])
    (is false "expected source-metric measure validation failure")
    (catch clojure.lang.ExceptionInfo e
      (is (= :invalid-generated-program (:error (ex-data e))))
      (is (re-find #"Metric ids are not measure ids" (:details (ex-data e)))))))

(deftest validate-top-level-operation-rejects-non-aggregation-aggregate-args-test
  (try
    (operators/validate-top-level-operation! (fn [path arg depth state]
                                               (assoc state :visited [path arg depth]))
                                             [:operations 0]
                                             ["aggregate" ["field" 10]]
                                             {:node-count 0})
    (is false "expected aggregate validation failure")
    (catch clojure.lang.ExceptionInfo e
      (is (= :invalid-generated-program (:error (ex-data e))))
      (is (re-find #"require aggregation helpers" (:details (ex-data e)))))))
