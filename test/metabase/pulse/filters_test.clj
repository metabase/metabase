(ns metabase.pulse.filters-test
  (:require [clojure.test :refer :all]
            [metabase.pulse.filters :as filters]))

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
  (testing "Default filters on the dashboard are merged into filters on the subscription"
    (is (= ["State" "Quarter and Year"]
           (map :name (filters/merge-filters test-subscription test-dashboard))))))

(deftest value-string-test
  (testing "If a filter has multiple values, they are concatenated into a comma-separated string"
    (is (= "CA, NY, IL"
           (filters/value-string (-> test-subscription :parameters first)))))
  (testing "If a filter has a single default value, it is returned unmodified"
    (is (= "CA"
           (filters/value-string (-> test-dashboard :parameters first))))
    (is (= "Q1-2021"
           (filters/value-string (-> test-dashboard :parameters last))))))
