(ns metabase-enterprise.transforms.core-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.models.transforms.transform-run :as transform-run]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest transform-stats-rolling-to-yesterday-test
  (testing "completed runs appear in rolling stats, then move to yesterday's stats when end_time is backdated"
    (mt/with-temp [:model/Transform {native-id :id} {}
                   :model/Transform {python-id :id} {:source {:type            "python"
                                                              :source-database (mt/id)}
                                                     :target {:type     "table"
                                                              :name     (str "test_python_" (random-uuid))
                                                              :database (mt/id)}}]
      (let [stats-before          (premium-features/transform-stats)
            native-before         (:transform-native-runs stats-before)
            rolling-native-before (:transform-rolling-native-runs stats-before)
            python-before         (:transform-python-runs stats-before)
            rolling-python-before (:transform-rolling-python-runs stats-before)
            yesterday-utc         (t/minus (t/offset-date-time (t/zone-offset "+00")) (t/days 1))]

        (testing "native"
          (let [{run-id :id} (transform-run/start-run! native-id {:run_method "manual"})]
            (transform-run/succeed-started-run! run-id)

            (testing "completed run appears in rolling stats only"
              (let [stats (premium-features/transform-stats)]
                (is (= (inc rolling-native-before) (:transform-rolling-native-runs stats)))
                (is (= native-before               (:transform-native-runs stats)))))

            (testing "a run for yesterday is visible under yesterday's stats only"
              (t2/update! :model/TransformRun :id run-id {:end_time yesterday-utc})
              (let [stats (premium-features/transform-stats)]
                (is (= rolling-native-before (:transform-rolling-native-runs stats)))
                (is (= (inc native-before)   (:transform-native-runs stats)))))))

        (testing "python stats not modified by native runs"
          (let [stats (premium-features/transform-stats)]
            (is (= python-before (:transform-python-runs stats)))
            (is (= rolling-python-before (:transform-rolling-python-runs stats)))))

        (testing "python"
          (let [{run-id :id} (transform-run/start-run! python-id {:run_method "manual"})]
            (transform-run/succeed-started-run! run-id)

            (testing "completed run appears in rolling stats only"
              (let [stats (premium-features/transform-stats)]
                (is (= (inc rolling-python-before)  (:transform-rolling-python-runs stats)))
                (is (= python-before                (:transform-python-runs stats)))))

            (testing "a run for yesterday is visible under yesterday's state only"
              (t2/update! :model/TransformRun :id run-id {:end_time yesterday-utc})
              (let [stats (premium-features/transform-stats)]
                (is (= rolling-python-before (:transform-rolling-python-runs stats)))
                (is (= (inc python-before)   (:transform-python-runs stats)))))))))))
