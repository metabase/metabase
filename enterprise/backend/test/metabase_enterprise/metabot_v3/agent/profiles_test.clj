(ns metabase-enterprise.metabot-v3.agent.profiles-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.profiles :as profiles]))

(deftest get-profile-test
  (letfn [(tool-names [profile]
            (set (map (comp :tool-name meta) (:tools profile))))]
    (testing "retrieves embedding_next profile"
      (let [profile (profiles/get-profile :embedding_next)]
        (is (some? profile))
        (is (= "claude-haiku-4-5" (:model profile)))
        (is (= 10 (:max-iterations profile)))
        (is (= 0.3 (:temperature profile)))
        (is (vector? (:tools profile)))
        (is (contains? (tool-names profile) "construct_notebook_query"))
        (is (contains? (tool-names profile) "list_available_data_sources"))))

    (testing "retrieves internal profile"
      (let [profile (profiles/get-profile :internal)]
        (is (some? profile))
        (is (= "claude-haiku-4-5" (:model profile)))
        (is (= 10 (:max-iterations profile)))
        (is (= 0.3 (:temperature profile)))
        (is (vector? (:tools profile)))
      ;; Should have more tools than embedding_next profile
        (is (> (count (:tools profile)) 5))
        (is (contains? (tool-names profile) "search"))
        (is (contains? (tool-names profile) "create_sql_query"))
        (is (contains? (tool-names profile) "create_chart"))))

    (testing "retrieves transforms_codegen profile"
      (let [profile (profiles/get-profile :transforms_codegen)]
        (is (some? profile))
        (is (= "claude-haiku-4-5" (:model profile)))
        (is (= 30 (:max-iterations profile)))
        (is (= 0.3 (:temperature profile)))
        (is (vector? (:tools profile)))
        (is (contains? (tool-names profile) "search"))
        (is (contains? (tool-names profile) "get_transform_details"))
        (is (contains? (tool-names profile) "list_available_fields"))))

    (testing "retrieves sql profile"
      (let [profile (profiles/get-profile :sql)]
        (is (some? profile))
        (is (= "claude-haiku-4-5" (:model profile)))
        (is (= 10 (:max-iterations profile)))
        (is (= 0.3 (:temperature profile)))
        (is (contains? (tool-names profile) "search"))
        (is (contains? (tool-names profile) "create_sql_query"))))

    (testing "retrieves nlq profile"
      (let [profile (profiles/get-profile :nlq)]
        (is (some? profile))
        (is (= "claude-haiku-4-5" (:model profile)))
        (is (= 10 (:max-iterations profile)))
        (is (= 0.3 (:temperature profile)))
        (is (contains? (tool-names profile) "search"))
        (is (contains? (tool-names profile) "construct_notebook_query"))))

    (testing "returns nil for unknown profile"
      (is (nil? (profiles/get-profile :unknown-profile))))

    (testing "all profiles have required keys"
      (doseq [profile-id [:embedding_next :internal :transforms_codegen :sql :nlq]]
        (let [profile (profiles/get-profile profile-id)]
          (is (contains? profile :model))
          (is (contains? profile :max-iterations))
          (is (contains? profile :temperature))
          (is (contains? profile :tools))
          (is (every? var? (:tools profile))))))))
