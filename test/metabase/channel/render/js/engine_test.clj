(ns metabase.channel.render.js.engine-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.render.js.engine :as js]
   [metabase.test :as mt])
  (:import
   (org.graalvm.polyglot Context PolyglotException Value)))

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

(deftest untrusted-plugin-context-denies-host-access-test
  (testing "the SandboxPolicy/UNTRUSTED isolate runs untrusted plugin JS with no host interop"
    (let [^Context context (js/untrusted-plugin-context)]
      (try
        (testing "ordinary JS still evaluates, so the sandbox isn't just broken"
          (is (= "3" (.asString ^Value (js/load-js-string context "'' + (1 + 2)" "ok.js")))))
        (testing "the `Java` host-interop global is absent"
          (is (= "undefined" (.asString ^Value (js/load-js-string context "typeof Java" "typeof.js")))))
        (testing "untrusted guest code cannot reach host classes (no sandbox escape)"
          (is (thrown? PolyglotException
                       (js/load-js-string context "Java.type('java.lang.System')" "escape.js"))))
        (finally
          (.close context true))))))
