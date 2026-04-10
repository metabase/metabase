(ns metabase.metabot.agent.profiles-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.agent.profiles :as profiles]
   [metabase.metabot.tools.transforms :as tools.transforms]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]))

(deftest get-profile-test
  (letfn [(tool-names [profile]
            (set (map #(:tool-name (meta %)) (:tools profile))))]
    (testing "retrieves embedding_next profile with default provider"
      (let [profile (profiles/get-profile :embedding_next)]
        (is (some? profile))
        (is (= :embedding_next (:name profile)))
        (is (= "anthropic/claude-sonnet-4-6" (:model profile)))
        (is (= 10 (:max-iterations profile)))
        (is (= 0.3 (:temperature profile)))
        (is (vector? (:tools profile)))
        (is (contains? (tool-names profile) "construct_notebook_query"))
        (is (contains? (tool-names profile) "list_available_data_sources"))))

    (testing "retrieves internal profile with default provider"
      (let [profile (profiles/get-profile :internal)]
        (is (some? profile))
        (is (= :internal (:name profile)))
        (is (= "anthropic/claude-sonnet-4-6" (:model profile)))
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
        (is (= :transforms_codegen (:name profile)))
        (is (= "anthropic/claude-sonnet-4-6" (:model profile)))
        (is (= 30 (:max-iterations profile)))
        (is (= 0.3 (:temperature profile)))
        (is (vector? (:tools profile)))
        (is (contains? (tool-names profile) "search"))
        (is (contains? (tool-names profile) "list_available_fields"))))

    (testing "retrieves sql profile"
      (let [profile (profiles/get-profile :sql)]
        (is (=? {:name :sql
                 :model "anthropic/claude-sonnet-4-6"
                 :max-iterations int?
                 :temperature pos?
                 :required-tool-call? true}
                profile))
        (is (contains? (tool-names profile) "search"))
        (is (contains? (tool-names profile) "create_sql_query"))))

    (testing "retrieves nlq profile"
      (let [profile (profiles/get-profile :nlq)]
        (is (some? profile))
        (is (= :nlq (:name profile)))
        (is (= "anthropic/claude-sonnet-4-6" (:model profile)))
        (is (= 10 (:max-iterations profile)))
        (is (= 0.3 (:temperature profile)))
        (is (contains? (tool-names profile) "search"))
        (is (contains? (tool-names profile) "construct_notebook_query"))))

    (testing "retrieves slackbot profile"
      (let [profile (profiles/get-profile :slackbot)]
        (is (some? profile))
        (is (= :slackbot (:name profile)))
        (is (= "anthropic/claude-sonnet-4-6" (:model profile)))
        (is (= 10 (:max-iterations profile)))
        (is (= 0.3 (:temperature profile)))
        (is (vector? (:tools profile)))
        (is (contains? (tool-names profile) "search"))
        (is (contains? (tool-names profile) "construct_notebook_query"))
        (is (contains? (tool-names profile) "static_viz"))
        (is (contains? (tool-names profile) "create_alert"))
        (is (contains? (tool-names profile) "create_dashboard_subscription"))))

    (testing "returns nil for unknown profile"
      (is (nil? (profiles/get-profile :unknown-profile))))

    (testing "all profiles have required keys"
      (doseq [profile-id [:embedding_next :internal :transforms_codegen :sql :nlq :slackbot]]
        (let [profile (profiles/get-profile profile-id)]
          (is (= profile-id (:name profile)))
          (is (contains? profile :model))
          (is (contains? profile :max-iterations))
          (is (contains? profile :temperature))
          (is (contains? profile :tools))
          (is (every? var? (:tools profile))))))))

(deftest get-profile-respects-provider-setting-test
  (testing "model reflects llm-metabot-provider setting"
    (mt/with-temporary-setting-values [llm-metabot-provider "openai/gpt-4.1-mini"]
      (is (= "openai/gpt-4.1-mini" (:model (profiles/get-profile :internal)))))
    (mt/with-temporary-setting-values [llm-metabot-provider "openrouter/google/gemini-2.5-flash"]
      (is (= "openrouter/google/gemini-2.5-flash" (:model (profiles/get-profile :embedding_next)))))))

(deftest get-tools-for-profile-capabilities-test
  (testing "filters tools by capabilities"
    (testing "empty capabilities excludes capability-gated tools but includes ungated tools"
      (let [tools (profiles/get-tools-for-profile :internal [])]
        ;; Ungated tools should always be available
        (is (contains? tools "search"))
        (is (contains? tools "create_autogenerated_dashboard"))
        ;; Capability-gated tools should be excluded
        (is (not (contains? tools "navigate_user")))))

    (testing "providing a capability includes tools gated by that capability"
      (let [tools (profiles/get-tools-for-profile :internal [:frontend-navigate-user-v1])]
        (is (contains? tools "navigate_user"))))))

(deftest get-tools-for-profile-string-capabilities-test
  (testing "capabilities as strings (as sent by the API / benchmark client)"
    (testing "NLQ-only capabilities should exclude SQL tools and include navigate_user"
      (let [;; This is what the NLQ benchmark actually sends via the API:
            nlq-capabilities ["frontend:navigate_user_v1"
                              "permission:save_questions"]
            tools (profiles/get-tools-for-profile :internal nlq-capabilities)]
        (is (contains? tools "search") "search should always be available")
        (is (contains? tools "construct_notebook_query") "notebook queries should be available")
        (is (contains? tools "read_resource") "read_resource should always be available")
        (is (contains? tools "navigate_user")
            "navigate_user should be available when frontend:navigate_user_v1 is in capabilities")
        (is (not (contains? tools "create_sql_query"))
            "create_sql_query should NOT be available without permission:write_sql_queries")
        (is (not (contains? tools "edit_sql_query"))
            "edit_sql_query should NOT be available without permission:write_sql_queries")
        (is (not (contains? tools "replace_sql_query"))
            "replace_sql_query should NOT be available without permission:write_sql_queries")))

    (testing "full capabilities including SQL write permission should include SQL tools"
      (let [full-capabilities ["frontend:navigate_user_v1"
                               "permission:save_questions"
                               "permission:write_sql_queries"]
            tools (profiles/get-tools-for-profile :internal full-capabilities)]
        (is (contains? tools "search"))
        (is (contains? tools "construct_notebook_query"))
        (is (contains? tools "navigate_user")
            "navigate_user should be available with frontend:navigate_user_v1")
        (is (contains? tools "create_sql_query")
            "create_sql_query should be available with permission:write_sql_queries")
        (is (contains? tools "edit_sql_query")
            "edit_sql_query should be available with permission:write_sql_queries")
        (is (contains? tools "replace_sql_query")
            "replace_sql_query should be available with permission:write_sql_queries")))

    (testing "empty capabilities should exclude all capability-gated tools"
      (let [tools (profiles/get-tools-for-profile :internal [])]
        (is (contains? tools "search") "ungated tools should remain")
        (is (not (contains? tools "navigate_user")))
        (is (not (contains? tools "create_sql_query"))
            "SQL tools should be gated by permission:write_sql_queries")))))

(deftest transform-feature-capabilities-test
  (let [orig-has-feature premium-features/has-feature?
        transform-tools #{#'tools.transforms/write-transform-sql-tool
                          #'tools.transforms/write-transform-python-tool}]
    (testing "Available with features present"
      (with-redefs [premium-features/has-feature? (fn [feat]
                                                    (if (#{:transforms-basic :transforms-python} feat)
                                                      true
                                                      (orig-has-feature feat)))]
        (is (= transform-tools
               (set (#'profiles/filter-by-capabilities transform-tools
                                                       ["permission:write_transforms"]))))))
    (testing "Not available with missing features"
      (with-redefs [premium-features/is-hosted? (constantly true)
                    premium-features/has-feature? (fn [feat]
                                                    (if (#{:transforms-basic :transforms-python} feat)
                                                      false
                                                      (orig-has-feature feat)))]
        (is (= #{}
               (set (#'profiles/filter-by-capabilities transform-tools
                                                       ["permission:write_transforms"]))))))
    (testing "Sql tool available on self hosted instances"
      (with-redefs [premium-features/is-hosted? (constantly false)
                    premium-features/has-feature? (fn [feat]
                                                    (if (#{:transforms-basic :transforms-python} feat)
                                                      false
                                                      (orig-has-feature feat)))]
        (is (= #{#'tools.transforms/write-transform-sql-tool}
               (set (#'profiles/filter-by-capabilities transform-tools
                                                       ["permission:write_transforms"]))))))
    (testing "Python transform tools not available when basic transforms are not available"
      (with-redefs [premium-features/is-hosted? (constantly true)
                    premium-features/has-feature? (fn [feat]
                                                    (cond
                                                      (#{:transforms-basic} feat)
                                                      false

                                                      (#{:transforms-python} feat)
                                                      true

                                                      :else
                                                      (orig-has-feature feat)))]
        (is (= #{}
               (set (#'profiles/filter-by-capabilities transform-tools
                                                       ["permission:write_transforms"]))))))))
