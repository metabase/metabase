(ns metabase.util.log.throttle-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.util.log.throttle :as log.throttle]))

(deftest allow?-test
  (testing "the first call for a key is allowed, then suppressed until the interval elapses"
    (let [k (str (gensym "k"))]
      (swap! log.throttle/state dissoc k)
      (testing "first call within a fresh window is allowed"
        (is (true? (log.throttle/allow? k 60000))))
      (testing "subsequent calls within the window are suppressed"
        (is (false? (log.throttle/allow? k 60000)))
        (is (false? (log.throttle/allow? k 60000))))
      (testing "once the window has elapsed (stale timestamp), the next call is allowed again"
        (swap! log.throttle/state dissoc k)
        (is (true? (log.throttle/allow? k 60000))))))
  (testing "different keys throttle independently"
    (let [k1 (str (gensym "k")) k2 (str (gensym "k"))]
      (swap! log.throttle/state dissoc k1)
      (swap! log.throttle/state dissoc k2)
      (is (true? (log.throttle/allow? k1 60000)))
      (is (true? (log.throttle/allow? k2 60000)))
      (is (false? (log.throttle/allow? k1 60000)))))
  (testing "a zero interval always allows"
    (let [k (str (gensym "k"))]
      (swap! log.throttle/state dissoc k)
      (is (true? (log.throttle/allow? k 0)))
      (is (true? (log.throttle/allow? k 0))))))
