(ns metabase.llm.costs-test
  (:require
   [clojure.test :refer :all]
   [mb.hawk.assert-exprs.approximately-equal :as =?]
   [metabase.llm.costs :as costs]))

(set! *warn-on-reflection* true)

(deftest ^:parallel estimate-sanity-test
  (testing "known models calculate correct costs"
    (is (=? (=?/approx [0.030 0.0001])
            (costs/estimate {:model "anthropic/claude-opus-4-5"
                             :prompt 1000
                             :completion 1000})))
    (is (=? (=?/approx [0.018 0.0001])
            (costs/estimate {:model "anthropic/claude-sonnet-4-5"
                             :prompt 1000
                             :completion 1000})))))

(deftest ^:parallel estimate-zero-tokens-test
  (testing "zero tokens returns zero cost"
    (is (= 0.0
           (costs/estimate {:model "anthropic/claude-sonnet-4-5"
                            :prompt 0
                            :completion 0})))))

(deftest ^:parallel estimate-unknown-model-test
  (testing "unknown model returns 0.0"
    (is (= 0.0
           (costs/estimate {:model "unknown-model-xyz"
                            :prompt 1000
                            :completion 1000})))))

(deftest ^:parallel estimate-nil-model-test
  (testing "nil model returns 0.0"
    (is (= 0.0
           (costs/estimate {:model nil
                            :prompt 1000
                            :completion 1000})))))

(deftest ^:parallel estimate-all-models-test
  (testing "all known models have valid pricing"
    (doseq [model (keys @#'costs/model-pricing)]
      (testing (str "model: " model)
        (is (pos? (costs/estimate {:model model
                                   :prompt 1000
                                   :completion 1000}))
            "should have positive cost for non-zero tokens")
        (is (= 0.0 (costs/estimate {:model model
                                    :prompt 0
                                    :completion 0}))
            "should have zero cost for zero tokens")))))
