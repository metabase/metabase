(ns ^:mb/once metabase.pulse.parameters-test
  (:require
   [clojure.test :refer :all]
   [metabase.pulse.parameters :as pulse-params]
   [metabase.pulse.test-util :refer [test-dashboard]]
   [metabase.test :as mt]))

(deftest ^:parallel value-string-test
  (testing "If a filter has multiple values, they are concatenated into a comma-separated string"
    (is (= "CA, NY, and NJ"
           (pulse-params/value-string (-> test-dashboard :parameters first)))))

  (testing "If a filter has a single default value, it is formatted appropriately"
    (is (= "Q1, 2021"
           (pulse-params/value-string (-> test-dashboard :parameters second))))))

(deftest dashboard-url-test
  (mt/with-temporary-setting-values [site-url "https://metabase.com"]
    (testing "A valid dashboard URL can be generated with filters included"
      (is (= "https://metabase.com/dashboard/1?state=CA&state=NY&state=NJ&quarter_and_year=Q1-2021"
             (pulse-params/dashboard-url 1 (:parameters test-dashboard)))))

    (testing "If no filters are set, the base dashboard url is returned"
      (is (= "https://metabase.com/dashboard/1"
             (pulse-params/dashboard-url 1 {}))))

    (testing "Filters slugs and values are encoded properly for the URL"
      (is (= "https://metabase.com/dashboard/1?%26=contains%3F"
             (pulse-params/dashboard-url 1 [{:value "contains?", :slug "&"}]))))))

(deftest param-val-or-default-test
  (let [param-val-or-default #'pulse-params/param-val-or-default]
    (testing "When the parameter’s :value key is missing, fallback to the :default key"
      (is (= "my default value"
             (param-val-or-default {:default "my default value"}))))
    (testing "When the parameter’s :value is explicitly nil (i.e. for no-op filters), do not fallback to the :default key"
      (is (nil? (param-val-or-default {:value nil :default "my default value"}))))))
