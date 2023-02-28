(ns metabase.pulse.parameters-test
  (:require
   [clojure.test :refer :all]
   [metabase.pulse.parameters :as params]
   [metabase.pulse.test-util :refer [test-dashboard]]
   [metabase.test :as mt]))

(deftest value-string-test
  (testing "If a filter has multiple values, they are concatenated into a comma-separated string"
    (is (= "CA, NY, and NJ"
           (params/value-string (-> test-dashboard :parameters first)))))

  (testing "If a filter has a single default value, it is formatted appropriately"
    (is (= "Q1, 2021"
           (params/value-string (-> test-dashboard :parameters second))))))

(deftest dashboard-url-test
  (mt/with-temporary-setting-values [site-url "https://metabase.com"]
    (testing "A valid dashboard URL can be generated with filters included"
      (is (= "https://metabase.com/dashboard/1?state=CA&state=NY&state=NJ&quarter_and_year=Q1-2021"
             (params/dashboard-url 1 (:parameters test-dashboard)))))

    (testing "If no filters are set, the base dashboard url is returned"
      (is (= "https://metabase.com/dashboard/1"
             (params/dashboard-url 1 {}))))

    (testing "Filters slugs and values are encoded properly for the URL"
      (is (= "https://metabase.com/dashboard/1?%26=contains%3F"
             (params/dashboard-url 1 [{:value "contains?", :slug "&"}]))))))
