(ns metabase.util.malli.fn-skip-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.config :as config]
   [metabase.util.malli.fn :as mu.fn]))

(deftest checks-happen-iff-skip-ns-decision-fn-returns-true
  ;; Careful not to use binding for *skip-ns-decision-fn*, because the fn macro will evaluate it before it gets bound!
  (testing "when skip-ns-decision-fn returns true, deparameterized form is emitted"
    (alter-var-root #'mu.fn/*skip-ns-decision-fn* (constantly (fn [_ns] true)))
    (let [f (mu.fn/fn :- :int [] "schemas aren't checked if this is returned")]
      (is (= "schemas aren't checked if this is returned" (f))))))

(deftest checks-skipped-iff-skip-ns-decision-fn-returns-false
  ;; Careful not to use binding for *skip-ns-decision-fn*, because the fn macro will evaluate it before it gets bound!
  (testing "when skip-ns-decision-fn returns false, parameterized form is emitted"
    (alter-var-root #'mu.fn/*skip-ns-decision-fn* (constantly (fn [_ns] false)))
    (let [f (mu.fn/fn :- :int [] "schemas aren't checked if this is returned")]
      (is (thrown-with-msg? Exception #"Invalid output" (f))))))
