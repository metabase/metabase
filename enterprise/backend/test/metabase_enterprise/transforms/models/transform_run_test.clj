(ns metabase-enterprise.transforms.models.transform-run-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.models.transform-run :as transform-run]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(defn- approx=
  ([expected actual]
   (approx= expected actual 0.001))
  ([expected actual epsilon]
   (< (abs (- actual expected)) epsilon)))

(deftest transform-run-outcome-metrics-test
  (testing "Transform run outcome metrics are recorded correctly"
    (mt/with-prometheus-system! [_ system]
      (mt/with-temp [:model/Transform transform {}]
        (let [transform-id (:id transform)]

          (testing "succeeded run increments counter with correct labels"
            (let [run (transform-run/start-run! transform-id {:run_method :manual})
                  _   (transform-run/succeed-started-run! (:id run))]
              (is (approx= 1 (mt/metric-value system :metabase-transforms/transform-run-outcomes
                                              {:status "succeeded" :run-method "manual"})))))

          (testing "failed run increments counter with correct labels"
            (let [run (transform-run/start-run! transform-id {:run_method :scheduled})
                  _   (transform-run/fail-started-run! (:id run) {:message "Test failure"})]
              (is (approx= 1 (mt/metric-value system :metabase-transforms/transform-run-outcomes
                                              {:status "failed" :run-method "scheduled"})))))

          (testing "canceled run increments counter with correct labels"
            (let [run (transform-run/start-run! transform-id {:run_method :api})
                  _   (transform-run/cancel-run! (:id run))]
              (is (approx= 1 (mt/metric-value system :metabase-transforms/transform-run-outcomes
                                              {:status "canceled" :run-method "api"})))))

          (testing "timeout run increments counter with correct labels"
            (let [run (transform-run/start-run! transform-id {:run_method :manual})
                  _   (transform-run/timeout-run! (:id run))]
              (is (approx= 1 (mt/metric-value system :metabase-transforms/transform-run-outcomes
                                              {:status "timeout" :run-method "manual"}))))))))))

(deftest transform-run-outcome-metrics-accumulate-test
  (testing "Transform run outcome metrics accumulate across multiple runs"
    (mt/with-prometheus-system! [_ system]
      (mt/with-temp [:model/Transform transform {}]
        (let [transform-id (:id transform)]
          (dotimes [_ 3]
            (let [run (transform-run/start-run! transform-id {:run_method :scheduled})]
              (transform-run/succeed-started-run! (:id run))))
          (is (approx= 3 (mt/metric-value system :metabase-transforms/transform-run-outcomes
                                          {:status "succeeded" :run-method "scheduled"}))))))))
