(ns metabase.search.core-metrics-test
  (:require
   [clojure.test :refer :all]
   [metabase.analytics-interface.core :as analytics]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.core :as search]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest reindex-stamps-freshness-gauge-test
  (let [gauges (atom [])]
    (mt/with-dynamic-fn-redefs [analytics/set-gauge! (fn [metric labels value]
                                                       (swap! gauges conj [metric labels value]))]
      (search.tu/with-temp-index-table
        (search/reindex! {:async? false :in-place? true})
        (let [[metric labels value]
              (first (filter #(= :metabase-search/last-successful-reindex-timestamp-seconds (first %))
                             @gauges))]
          (is (= :metabase-search/last-successful-reindex-timestamp-seconds metric))
          (is (= {:engine "appdb"} labels))
          (is (< (- (/ (System/currentTimeMillis) 1000.0) 60) value)
              "stamped with the current time"))))))

(deftest empty-rebuild-still-reports-test
  (testing "a completed rebuild over zero documents returns an empty report, not nil, so freshness still stamps"
    (search.tu/with-temp-index-table
      (is (= {} (search.index/index-docs! :search/updating []))))))
