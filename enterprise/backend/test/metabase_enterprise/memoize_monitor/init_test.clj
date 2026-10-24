(ns metabase-enterprise.memoize-monitor.init-test
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.test :refer :all]
   [metabase-enterprise.memoize-monitor.init :as memoize-monitor]
   ;; loaded so its self-registered cache is present in the registry for the assertions below
   [metabase.driver.util :as driver.u]
   [metabase.util.memoize :as u.memo]))

(comment driver.u/keep-me)

(set! *warn-on-reflection* true)

(deftest cache-object-test
  (testing "returns the backing cache of a clojure.core.memoize function (countable + measurable)"
    (let [f (memoize/memo (fn [x] (* x x)))]
      (f 1) (f 2) (f 2)
      (is (= 2 (count (#'memoize-monitor/cache-object f))))))
  (testing "returns nil for a function whose backing cache isn't reachable"
    (is (nil? (#'memoize-monitor/cache-object (fn [x] x))))
    (is (nil? (#'memoize-monitor/cache-object (clojure.core/memoize (fn [x] x)))))))

(deftest registered-cache-stats-test
  (testing "self-registered caches are measured via their count fn"
    (u.memo/register-monitored-cache! "memoize-monitor.init-test/synthetic" (constantly 7))
    (try
      (is (contains? (set (#'memoize-monitor/registered-cache-stats))
                     {:cache "memoize-monitor.init-test/synthetic", :entries 7}))
      (finally
        (swap! @#'u.memo/cache-registry dissoc "memoize-monitor.init-test/synthetic")))))

(deftest cache-stats-entries-test
  (let [stats     (#'memoize-monitor/all-cache-stats)
        by-cache  (into {} (map (juxt :cache identity)) stats)]
    (testing "one stat per monitored cache — curated vars plus the self-registered ones"
      (is (= (+ (count @#'memoize-monitor/monitored-cache-vars)
                (count (u.memo/monitored-caches)))
             (count stats)))
      (is (contains? by-cache "metabase.warehouse-schema.models.field/field-id->table-id"))
      (is (contains? by-cache "metabase.driver.util/db-feature-sets"))
      (is (contains? by-cache "metabase-enterprise.serialization.dump/serialization-sorted-map")))
    (testing "entry counts are always reported"
      (doseq [{:keys [cache entries]} stats]
        (is (string? cache))
        (is (and (integer? entries) (not (neg? entries))) (str cache " entries"))))))
