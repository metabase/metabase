(ns metabase-enterprise.metabot-v3.agent.profiles-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.profiles :as profiles]))

(deftest get-profile-test
  (testing "retrieves embedding profile"
    (let [profile (profiles/get-profile :embedding)]
      (is (some? profile))
      (is (= "claude-sonnet-4-5-20250929" (:model profile)))
      (is (= 6 (:max-iterations profile)))
      (is (= 0.3 (:temperature profile)))
      (is (vector? (:tools profile)))
      (is (contains? (set (:tools profile)) "search"))
      (is (contains? (set (:tools profile)) "query_metric"))))

  (testing "retrieves internal profile"
    (let [profile (profiles/get-profile :internal)]
      (is (some? profile))
      (is (= "claude-sonnet-4-5-20250929" (:model profile)))
      (is (= 10 (:max-iterations profile)))
      (is (= 0.3 (:temperature profile)))
      (is (vector? (:tools profile)))
      ;; Should have more tools than embedding profile
      (is (> (count (:tools profile)) 5))
      (is (contains? (set (:tools profile)) "search"))
      (is (contains? (set (:tools profile)) "find_outliers"))
      (is (contains? (set (:tools profile)) "generate_insights"))))

  (testing "retrieves transforms-codegen profile"
    (let [profile (profiles/get-profile :transforms-codegen)]
      (is (some? profile))
      (is (= "claude-sonnet-4-5-20250929" (:model profile)))
      (is (= 30 (:max-iterations profile)))
      (is (= 0.3 (:temperature profile)))
      (is (vector? (:tools profile)))
      (is (contains? (set (:tools profile)) "search"))
      (is (contains? (set (:tools profile)) "get_transform_details"))))

  (testing "returns nil for unknown profile"
    (is (nil? (profiles/get-profile :unknown-profile))))

  (testing "all profiles have required keys"
    (doseq [profile-id [:embedding :internal :transforms-codegen :sql-only :nlq-only :next :beta-customer]]
      (let [profile (profiles/get-profile profile-id)]
        (is (contains? profile :model))
        (is (contains? profile :max-iterations))
        (is (contains? profile :temperature))
        (is (contains? profile :tools))))))
