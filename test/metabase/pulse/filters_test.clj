(ns metabase.pulse.filters-test
  (:require [clojure.test :refer :all]
            [metabase.config :as config]
            [metabase.pulse.filters :as filters]
            [metabase.test :as mt]))

(def ^:private test-subscription
  "A test dashboard subscription with only the :parameters field included. Has one filter which
  should override the default value of the filter set on the dashboard."
  {:parameters
   [{:name "State",
     :slug "state",
     :id "63e719d0",
     :default ["CA"],
     :type "string/=",
     :value ["CA" "NY" "IL"]}]})

(def ^:private test-dashboard
  "A test dashboard with only the :parameters field included."
  {:parameters
   [{:name "State",
     :slug "state",
     :id "63e719d0",
     :default ["CA"],
     :type "string/=",
     :sectionId "location"}
    ;; Filter without default, should not be included in subscription
    {:name "Product title contains",
     :slug "product_title_contains",
     :id "acd0dfab",
     :type "string/contains",
     :sectionId "string"}
    ;; Filter with default, should be included in subscription
    {:name "Quarter and Year",
     :slug "quarter_and_year",
     :id "a6db3d8b",
     :default "Q1-2021"
     :type "date/quarter-year",
     :sectionId "date"}]})

(deftest merge-filters-test
  (testing "On OSS builds, only default dashboard filters are applied"
    (with-redefs [config/ee-available? false]
      (is (= [{:name "State"} {:name "Quarter and Year"}]
             (map #(select-keys % [:name :value])
                  (filters/merge-filters test-subscription test-dashboard))))))

  (testing "On EE builds, subscription filters take precedence over default values for dashboard filters"
    (with-redefs [config/ee-available? true]
      (is (= [{:name "State", :value ["CA" "NY" "IL"]} {:name "Quarter and Year"}]
             (map #(select-keys % [:name :value])
                  (filters/merge-filters test-subscription test-dashboard)))))))

(deftest value-string-test
  (testing "If a filter has multiple values, they are concatenated into a comma-separated string"
    (is (= "CA, NY, IL"
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
          (is (= "https://metabase.com/dashboard/null?state=CA&state=NY&state=IL&quarter_and_year=Q1-2021"
                 (filters/dashboard-url test-subscription test-dashboard))))

        (testing "If no filters are set, the base dashboard url is returned"
          (is (= "https://metabase.com/dashboard/1"
               (filters/dashboard-url {} {:id 1})))))))
