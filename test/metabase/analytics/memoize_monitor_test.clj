(ns metabase.analytics.memoize-monitor-test
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.test :refer :all]
   [metabase.analytics.memoize-monitor :as memoize-monitor]))

(deftest cache-size-test
  (testing "reads the entry count of a clojure.core.memoize cache without copying it"
    (let [f (memoize/memo (fn [x] (* x x)))]
      (is (= 0 (#'memoize-monitor/cache-size f)))
      (f 1) (f 2) (f 2)
      (is (= 2 (#'memoize-monitor/cache-size f)))))
  (testing "returns nil for a function that isn't a clojure.core.memoize cache"
    (is (nil? (#'memoize-monitor/cache-size (fn [x] x))))
    (is (nil? (#'memoize-monitor/cache-size (clojure.core/memoize (fn [x] x)))))))

(deftest cache-sizes-test
  (testing "returns a map of monitored-cache-name -> non-negative entry count"
    (let [sizes (memoize-monitor/cache-sizes)]
      (is (map? sizes))
      (is (seq sizes) "at least some monitored caches should be resolvable")
      (is (every? string? (keys sizes)))
      (is (every? (every-pred integer? (complement neg?)) (vals sizes))))))
