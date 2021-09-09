(ns metabase.pulse.filters-test
  (:require [clojure.test :refer :all]
            [metabase.config :as config]
            [metabase.pulse.filters :as filters]
            [metabase.pulse.test-util :refer :all]
            [metabase.test :as mt]))

(deftest merge-filters-test
  (testing "On OSS builds, only default dashboard filters are applied"
    (with-redefs [config/ee-available? false]
      (is (= [{:name "State"} {:name "Quarter and Year"}]
             (map #(select-keys % [:name :value])
                  (filters/merge-filters test-subscription test-dashboard))))))

  (testing "On EE builds, subscription filters take precedence over default values for dashboard filters"
    (with-redefs [config/ee-available? true]
      (is (= [{:name "State", :value ["CA" "NY"]} {:name "Quarter and Year"}]
             (map #(select-keys % [:name :value])
                  (filters/merge-filters test-subscription test-dashboard)))))))

(deftest value-string-test
  (testing "If a filter has multiple values, they are concatenated into a comma-separated string"
    (is (= "CA, NY"
           (filters/value-string (-> test-subscription :parameters first)))))

  (testing "If a filter has a single default value, it is returned unmodified"
    (is (= "CA"
           (filters/value-string (-> test-dashboard :parameters first))))
    (is (= "Q1-2021"
           (filters/value-string (-> test-dashboard :parameters last))))))

(deftest dashboard-url-test
    (with-redefs [config/ee-available? true]
      (mt/with-temporary-setting-values [site-url "https://metabase.com"]
        (testing "A valid dashboard URL can be generated with filters included"
          (is (= "https://metabase.com/dashboard/null?state=CA&state=NY&quarter_and_year=Q1-2021"
                 (filters/dashboard-url test-subscription test-dashboard))))

        (testing "If no filters are set, the base dashboard url is returned"
          (is (= "https://metabase.com/dashboard/1"
               (filters/dashboard-url {} {:id 1})))))))
