(ns metabase.lib-be.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.settings :as lib-be.settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest start-of-week-test
  (mt/discard-setting-changes [start-of-week]
    (testing "Error on invalid value"
      (is (thrown-with-msg?
           Throwable
           #"Invalid day of week: :fraturday"
           (lib-be.settings/start-of-week! :fraturday))))
    (mt/with-temp-env-var-value! [start-of-week nil]
      (testing "Should default to Sunday"
        (is (= :sunday
               (lib-be.settings/start-of-week))))
      (testing "Sanity check: make sure we're setting the env var value correctly for the assertion after this"
        (mt/with-temp-env-var-value! [:mb-start-of-week "monday"]
          (is (= :monday
                 (lib-be.settings/start-of-week)))))
      (testing "Fall back to default if value is invalid"
        (mt/with-temp-env-var-value! [:mb-start-of-week "fraturday"]
          (is (= :sunday
                 (lib-be.settings/start-of-week))))))))

(deftest chart-max-series-test
  (mt/discard-setting-changes [:chart-max-series]
    (testing "default value"
      (is (= 100 (lib-be.settings/chart-max-series))))
    (testing "env var override"
      (mt/with-temp-env-var-value! [:mb-chart-max-series "250"]
        (is (= 250 (lib-be.settings/chart-max-series)))))
    (testing "values above hard max are clamped"
      (mt/with-temp-env-var-value! [:mb-chart-max-series "20000"]
        (is (= 10000 (lib-be.settings/chart-max-series)))))))
