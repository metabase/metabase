(ns metabase.pulse.render.js-engine-test
  (:require
   [clojure.test :refer :all]
   [metabase.pulse.render.js-engine :as js]
   [metabase.test :as mt]))

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

(deftest thread-safe-execute-fn-name-test
  (testing "execute-fn-name is thread safe"
    (let [context (js/context)]
      (js/load-js-string context "function plus (x, y) { return x + y }" "plus test")
      (is (= (repeat 10 2)
             (mt/repeat-concurrently 10
              #(.asLong (js/execute-fn-name context "plus" 1 1))))))))
