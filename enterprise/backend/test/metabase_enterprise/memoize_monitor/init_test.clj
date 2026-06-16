(ns metabase-enterprise.memoize-monitor.init-test
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.test :refer :all]
   [metabase-enterprise.memoize-monitor.init :as memoize-monitor]))

(deftest cache-size-test
  (testing "reads the entry count of a clojure.core.memoize cache without copying it"
    (let [f (memoize/memo (fn [x] (* x x)))]
      (is (= 0 (#'memoize-monitor/cache-size f)))
      (f 1) (f 2) (f 2)
      (is (= 2 (#'memoize-monitor/cache-size f)))))
  (testing "returns nil for a function whose cache isn't readable"
    (is (nil? (#'memoize-monitor/cache-size (fn [x] x))))
    (is (nil? (#'memoize-monitor/cache-size (clojure.core/memoize (fn [x] x)))))))

(deftest cache-sizes-test
  (testing "reports every monitored cache by its fully-qualified var name, with non-negative counts"
    (let [sizes (#'memoize-monitor/cache-sizes)]
      (is (= (count @#'memoize-monitor/monitored-cache-vars)
             (count sizes))
          "all monitored caches are clojure.core.memoize-backed and therefore readable")
      (is (contains? sizes "metabase.warehouse-schema.models.field/field-id->table-id"))
      (is (contains? sizes "metabase-enterprise.serialization.dump/serialization-sorted-map"))
      (is (every? string? (keys sizes)))
      (is (every? (every-pred integer? (complement neg?)) (vals sizes))))))
