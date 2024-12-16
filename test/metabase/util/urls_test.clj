(ns metabase.util.urls-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.util.urls :as urls]))

(deftest dashboard-url-test
  (mt/with-temporary-setting-values [site-url "https://metabase.com"]
    (testing "A valid dashboard URL can be generated without filters"
      (is (= "https://metabase.com/dashboard/1"
             (urls/dashboard-url 1))))
    (testing "A valid dashboard URL can be generated with filters included"
      (is (= "https://metabase.com/dashboard/1?state=CA&state=NY&state=NJ&quarter_and_year=Q1-2021"
             (urls/dashboard-url 1 [{:name "State",
                                     :slug "state",
                                     :id "63e719d0",
                                     :default ["CA", "NY", "NJ"],
                                     :type "string/=",
                                     :sectionId "location"}
                                    {:name "Quarter and Year",
                                     :slug "quarter_and_year",
                                     :id "a6db3d8b",
                                     :default "Q1-2021"
                                     :type "date/quarter-year",
                                     :sectionId "date"}
                                    ;; Filter without default, should not be included in subscription
                                    {:name "Product title contains",
                                     :slug "product_title_contains",
                                     :id "acd0dfab",
                                     :type "string/contains",
                                     :sectionId "string"}]))))

    (testing "If no filters are set, the base dashboard url is returned"
      (is (= "https://metabase.com/dashboard/1"
             (urls/dashboard-url 1 {}))))

    (testing "Filters slugs and values are encoded properly for the URL"
      (is (= "https://metabase.com/dashboard/1?%26=contains%3F"
             (urls/dashboard-url 1 [{:value "contains?", :slug "&"}]))))))
