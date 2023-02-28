(ns metabase.pulse.render.js-engine-test
  (:require
   [clojure.test :refer :all]
   [metabase.pulse.render.js-engine :as js]))

(set! *warn-on-reflection* true)

(deftest make-context-test
  (testing "can make a context that evaluates javascript"
    (let [context (js/context)]
      (js/load-js-string context "function plus (x, y) { return x + y }" "plus test")
      (is (= 3 (.asLong (js/execute-fn-name context "plus" 1 2))))))
  (testing "can invoke closures return from that javascript"
    (let [context (js/context)]
      (js/load-js-string context "function curry_plus (x) { return function (y) { return x + y}}"
                         "curried function test")
      (let [curried (js/execute-fn-name context "curry_plus" 1)]
        (is (= 3 (.asLong (js/execute-fn curried 2))))))))
