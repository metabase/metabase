(ns metabase.agent-lib.eval.args-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.agent-lib.eval.args :as eval.args]))

(deftest ^:parallel normalize-helper-args-flattens-in-lists-test
  (is (= [["field" 10] "a" "b"]
         (eval.args/normalize-helper-args [:operations 0 1]
                                          'in
                                          [["field" 10] ["a" "b"]]))))

(deftest ^:parallel normalize-helper-args-normalizes-enums-test
  (is (= [["aggregation-ref" 0] :desc]
         (eval.args/normalize-helper-args [:operations 1]
                                          'order-by
                                          [["aggregation-ref" 0] "desc"])))
  (is (= [["field" 10] -30 :day 0 :day]
         (eval.args/normalize-helper-args [:operations 2]
                                          'relative-time-interval
                                          [["field" 10] -30 "day" 0 "day"]))))

(deftest ^:parallel normalize-helper-args-normalizes-percentiles-and-join-fields-test
  (is (= [["field" 12] 0.9]
         (eval.args/normalize-helper-args [:operations 3]
                                          'percentile
                                          [["field" 12] 90])))
  (is (= [["join-clause" ["table" 1]] :all]
         (eval.args/normalize-helper-args [:operations 4]
                                          'with-join-fields
                                          [["join-clause" ["table" 1]] "all"]))))
