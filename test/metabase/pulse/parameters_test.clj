(ns metabase.pulse.parameters-test
  (:require [clojure.test :refer :all]
            [metabase.pulse.parameters :as params]
            [metabase.pulse.test-util :refer :all]
            [metabase.test :as mt]))

(deftest value-string-test
  (testing "If a filter has multiple values, they are concatenated into a comma-separated string"
    (is (= "CA, NY"
           (params/value-string (-> test-subscription :parameters first)))))

  (testing "If a filter has a single default value, it is returned unmodified"
    (is (= "CA"
           (params/value-string (-> test-dashboard :parameters first))))
    (is (= "Q1-2021"
           (params/value-string (-> test-dashboard :parameters last))))))

(deftest dashboard-url-test
  (mt/with-temporary-setting-values [site-url "https://metabase.com"]
    (testing "A valid dashboard URL can be generated with filters included"
      (is (= "https://metabase.com/dashboard/null?state=CA&state=NY&quarter_and_year=Q1-2021"
             (params/dashboard-url test-subscription test-dashboard))

        (testing "If no filters are set, the base dashboard url is returned"
          (is (= "https://metabase.com/dashboard/1"
               (params/dashboard-url {} {:id 1}))))))))
