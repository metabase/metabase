(ns metabase.util.timer-cache-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.timer-cache :as timer-cache]))

(set! *warn-on-reflection* true)

(def ^:private window-ms 60000)

(def ^:private past-the-window
  "A [[metabase.util/since-ms]] stub that makes every cached timer look older than the window."
  (constantly (inc window-ms)))

(deftest record-if-due!-throttles-test
  (let [cache (timer-cache/cache)]
    (testing "the first time a key is seen it is due"
      (is (true? (timer-cache/record-if-due! cache window-ms "a"))))
    (testing "and not again inside the window"
      (is (false? (timer-cache/record-if-due! cache window-ms "a"))))
    (testing "but it is once the window has passed"
      (mt/with-dynamic-fn-redefs [u/since-ms past-the-window]
        (is (true? (timer-cache/record-if-due! cache window-ms "a")))))
    (testing "keys are throttled independently, so a busy one cannot hold back a quiet one"
      (is (true? (timer-cache/record-if-due! cache window-ms "b"))))))

(deftest prune!-test
  (let [cache (timer-cache/cache)]
    (timer-cache/record-if-due! cache window-ms "a")
    (testing "a key inside the window is kept, since it is still throttling"
      (timer-cache/prune! cache window-ms)
      (is (contains? @cache "a")))
    (testing "a key outside it is dropped"
      (mt/with-dynamic-fn-redefs [u/since-ms past-the-window]
        (timer-cache/prune! cache window-ms))
      (is (not (contains? @cache "a"))))))

(deftest clear!-test
  (let [cache (timer-cache/cache)]
    (timer-cache/record-if-due! cache window-ms "a")
    (timer-cache/clear! cache)
    (testing "a cleared key is due again"
      (is (empty? @cache))
      (is (true? (timer-cache/record-if-due! cache window-ms "a"))))))

(deftest caches-are-independent-test
  (testing "two caches throttle the same key separately, so one feature's window cannot close another's"
    (let [one (timer-cache/cache)
          two (timer-cache/cache)]
      (is (true? (timer-cache/record-if-due! one window-ms "a")))
      (is (true? (timer-cache/record-if-due! two window-ms "a"))))))
