(ns metabase.channel.render.js.graal-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.render.js.graal :as graal]
   [metabase.test :as mt])
  (:import
   (java.util.concurrent TimeUnit)))

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

(deftest thread-safe-execute-fn-name-test
  (testing "execute-fn-name is thread safe"
    (let [context (graal/create-context)]
      (graal/load-js-string context "function plus (x, y) { return x + y }" "plus test")
      (is (= (repeat 10 2)
             (mt/repeat-concurrently 10
                                     #(.asLong (graal/execute-fn-name context "plus" 1 1))))))))

(deftest generate-pool-entry-serializes-context-creation-test
  (testing "no two static-viz context creations run concurrently (#GHY-4077)"
    (let [in-flight     (atom 0)
          max-in-flight (atom 0)
          fake-context  (Object.)]
      (mt/with-dynamic-fn-redefs [graal/create-static-viz-context
                                  (fn []
                                    (let [n (swap! in-flight inc)]
                                      (swap! max-in-flight max n)
                                      (Thread/sleep 50)
                                      (swap! in-flight dec)
                                      fake-context))]
        (let [entries (->> (repeatedly 4 #(future (#'graal/generate-pool-entry)))
                           doall
                           (mapv deref))]
          (is (= 1 @max-in-flight))
          (testing "every entry is a [context expiry-timestamp] tuple"
            (doseq [[ctx expiry-ts] entries]
              (is (identical? fake-context ctx))
              (is (int? expiry-ts)))))))))

(deftest expiry-timestamp-jitter-test
  (testing "expiry is ~10 minutes out with ±3 minutes of jitter"
    (let [now      (System/nanoTime)
          expiries (repeatedly 100 #(#'graal/expiry-timestamp))]
      (doseq [expiry expiries
              :let   [delta (- expiry now)]]
        (is (<= (.toNanos TimeUnit/MINUTES 7) delta (.toNanos TimeUnit/MINUTES 14)))))))
