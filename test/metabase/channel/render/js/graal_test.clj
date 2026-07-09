(ns metabase.channel.render.js.graal-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.render.js.graal :as graal]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest make-context-test
  (testing "can make a context that evaluates javascript"
    (let [context (graal/create-context)]
      (graal/load-js-string context "function plus (x, y) { return x + y }" "plus test")
      (is (= 3 (.asLong (graal/execute-fn-name context "plus" 1 2))))))
  (testing "can invoke closures return from that javascript"
    (let [context (graal/create-context)]
      (graal/load-js-string context "function curry_plus (x) { return function (y) { return x + y}}"
                            "curried function test")
      (let [curried (graal/execute-fn-name context "curry_plus" 1)]
        (is (= 3 (.asLong (graal/execute-fn curried 2))))))))

(deftest concurrent-execution-with-locking-test
  (testing "concurrent execution on a shared context is safe when callers hold its monitor"
    (let [context (graal/create-context)]
      (graal/load-js-string context "function plus (x, y) { return x + y }" "plus test")
      (is (= (repeat 10 2)
             (mt/repeat-concurrently 10
                                     #(locking context
                                        (.asLong (graal/execute-fn-name context "plus" 1 1)))))))))
