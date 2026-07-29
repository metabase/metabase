(ns metabase-enterprise.memoize-monitor.init-test
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.test :refer :all]
   [metabase-enterprise.memoize-monitor.init :as memoize-monitor]))

(set! *warn-on-reflection* true)

(deftest cache-object-test
  (testing "returns the backing cache of a clojure.core.memoize function (countable + measurable)"
    (let [f (memoize/memo (fn [x] (* x x)))]
      (f 1) (f 2) (f 2)
      (is (= 2 (count (#'memoize-monitor/cache-object f))))))
  (testing "returns nil for a function whose backing cache isn't reachable"
    (is (nil? (#'memoize-monitor/cache-object (fn [x] x))))
    (is (nil? (#'memoize-monitor/cache-object (clojure.core/memoize (fn [x] x)))))))

(deftest cache-stats-entries-test
  (let [stats     (#'memoize-monitor/all-cache-stats)
        by-cache  (into {} (map (juxt :cache identity)) stats)]
    (testing "one stat per monitored cache, keyed by the var's fully-qualified symbol"
      (is (= (count @#'memoize-monitor/monitored-cache-vars)
             (count stats)))
      (is (contains? by-cache "metabase.warehouse-schema.models.field/field-id->table-id"))
      (is (contains? by-cache "metabase-enterprise.serialization.dump/serialization-sorted-map")))
    (testing "entry counts are always reported"
      (doseq [{:keys [cache entries]} stats]
        (is (string? cache))
        (is (and (integer? entries) (not (neg? entries))) (str cache " entries"))))))
