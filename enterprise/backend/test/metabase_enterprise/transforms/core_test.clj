(ns metabase-enterprise.transforms.core-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.transforms.models.transform-run :as transform-run]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest transform-stats-tier-based-metering-test
  (testing "all runs are bucketed into basic or advanced based on the transforms-python feature flag"
    (mt/with-temp [:model/Transform {native-id :id} {}
                   :model/Transform {python-id :id} {:source {:type            "python"
                                                              :source-database (mt/id)}
                                                     :target {:type     "table"
                                                              :name     (str "test_python_" (random-uuid))
                                                              :database (mt/id)}}]
      (let [stats-before    (premium-features/transform-stats)
            basic-before    (:transform-basic-runs stats-before)
            advanced-before (:transform-advanced-runs stats-before)
            rolling-basic-before    (:transform-rolling-basic-runs stats-before)
            rolling-advanced-before (:transform-rolling-advanced-runs stats-before)
            yesterday-utc   (t/minus (t/offset-date-time (t/zone-offset "+00")) (t/days 1))]

        (testing "without advanced add-on, all runs go to basic-runs"
          ;; run a native transform
          (let [{run-id :id} (transform-run/start-run! native-id {:run_method "manual"})]
            (transform-run/succeed-started-run! run-id)

            (testing "completed run appears in rolling-basic-runs"
              (let [stats (premium-features/transform-stats)]
                (is (= (inc rolling-basic-before)    (:transform-rolling-basic-runs stats)))
                (is (= rolling-advanced-before        (:transform-rolling-advanced-runs stats)))
                (is (= basic-before                   (:transform-basic-runs stats)))))

            (testing "backdated run appears in basic-runs"
              (t2/update! :model/TransformRun :id run-id {:end_time yesterday-utc})
              (let [stats (premium-features/transform-stats)]
                (is (= rolling-basic-before (:transform-rolling-basic-runs stats)))
                (is (= (inc basic-before)   (:transform-basic-runs stats)))
                (is (= advanced-before      (:transform-advanced-runs stats)))))))

        (testing "with advanced add-on, all runs go to advanced-runs"
          (mt/with-premium-features #{:transforms-basic :transforms-python}
            ;; run a python transform
            (let [{run-id :id} (transform-run/start-run! python-id {:run_method "manual"})]
              (transform-run/succeed-started-run! run-id)

              (testing "completed run appears in rolling-advanced-runs"
                (let [stats (premium-features/transform-stats)]
                  (is (= 0 (:transform-rolling-basic-runs stats)))
                  (is (pos? (:transform-rolling-advanced-runs stats)))))

              (testing "backdated run appears in advanced-runs"
                (t2/update! :model/TransformRun :id run-id {:end_time yesterday-utc})
                (let [stats (premium-features/transform-stats)]
                  (is (= 0     (:transform-basic-runs stats)))
                  (is (pos?    (:transform-advanced-runs stats))))))))))))
