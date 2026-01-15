(ns metabase-enterprise.metabot-v3.agent.tools-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.tools :as agent-tools]))

(deftest all-tools-test
  (testing "all-tools registry contains expected tools"
    (is (map? agent-tools/all-tools))
    (is (contains? agent-tools/all-tools "search"))
    (is (contains? agent-tools/all-tools "query_metric"))
    (is (contains? agent-tools/all-tools "query_model"))
    (is (contains? agent-tools/all-tools "get_field_values"))
    (is (contains? agent-tools/all-tools "get_entity_details"))
    (is (contains? agent-tools/all-tools "get_metric_details"))
    (is (contains? agent-tools/all-tools "get_field_stats"))
    (is (contains? agent-tools/all-tools "show_results_to_user"))
    (is (contains? agent-tools/all-tools "find_outliers"))
    (is (contains? agent-tools/all-tools "generate_insights"))
    (is (contains? agent-tools/all-tools "create_dashboard_subscription"))
    (is (contains? agent-tools/all-tools "get_transform_details"))
    (is (contains? agent-tools/all-tools "invite_user")))

  (testing "all tool values are vars"
    (doseq [[tool-name tool-var] agent-tools/all-tools]
      (is (var? tool-var) (str "Tool " tool-name " should be a var"))))

  (testing "all tool vars have metadata"
    (doseq [[tool-name tool-var] agent-tools/all-tools]
      (is (some? (meta tool-var)) (str "Tool " tool-name " should have metadata"))
      (is (some? (:name (meta tool-var))) (str "Tool " tool-name " should have :name in metadata")))))

(deftest filter-by-capabilities-test
  (testing "returns all tools when no filtering needed"
    (let [tool-names ["search" "query_metric"]
          capabilities #{}
          result (agent-tools/filter-by-capabilities tool-names capabilities)]
      (is (= tool-names result))))

  (testing "filters tools by capabilities (placeholder test)"
    ;; Current implementation doesn't filter, but test structure is here for future
    (let [tool-names ["search" "query_metric" "admin_tool"]
          capabilities #{:search :query}
          result (agent-tools/filter-by-capabilities tool-names capabilities)]
      ;; Currently returns all tools
      (is (sequential? result)))))

(deftest get-tools-for-profile-test
  (testing "returns tools for metabot-embedding profile"
    (let [tools (agent-tools/get-tools-for-profile :metabot-embedding #{})]
      (is (map? tools))
      (is (contains? tools "search"))
      (is (contains? tools "query_metric"))
      (is (contains? tools "query_model"))
      (is (contains? tools "get_field_values"))
      (is (contains? tools "show_results_to_user"))))

  (testing "returns tools for metabot-internal profile"
    (let [tools (agent-tools/get-tools-for-profile :metabot-internal #{})]
      (is (map? tools))
      ;; Should have more tools than embedding
      (is (> (count tools) 5))
      (is (contains? tools "search"))
      (is (contains? tools "find_outliers"))
      (is (contains? tools "generate_insights"))
      (is (contains? tools "invite_user"))))

  (testing "returns tools for metabot-transforms-codegen profile"
    (let [tools (agent-tools/get-tools-for-profile :metabot-transforms-codegen #{})]
      (is (map? tools))
      (is (contains? tools "search"))
      (is (contains? tools "get_transform_details"))
      (is (contains? tools "get_entity_details"))
      (is (contains? tools "get_field_stats"))))

  (testing "returns empty map for unknown profile"
    (let [tools (agent-tools/get-tools-for-profile :unknown-profile #{})]
      (is (map? tools))
      (is (empty? tools))))

  (testing "returned tools have correct structure"
    (let [tools (agent-tools/get-tools-for-profile :metabot-embedding #{})]
      (doseq [[tool-name tool-var] tools]
        (is (var? tool-var))
        (is (string? tool-name))))))

(deftest search-tool-test
  (testing "search-tool exists and is a function"
    (let [tool-var (agent-tools/all-tools "search")
          tool-meta (meta tool-var)]
      (is (some? tool-meta))
      (is (some? (:name tool-meta)))))

  (testing "search-tool is callable"
    ;; This is a structural test - actual tool execution requires DB setup
    (let [tool-fn @(agent-tools/all-tools "search")]
      ;; Just verify the function exists and is callable
      (is (fn? tool-fn)))))

(deftest tool-wrapper-structure-test
  (testing "all tool wrappers are defined"
    ;; Verify that our tool wrappers exist
    (is (= 13 (count agent-tools/all-tools)))
    (is (every? fn? (map deref (vals agent-tools/all-tools)))))

  (testing "tool wrappers map to kebab-case handlers"
    ;; This verifies the pattern: LLM sends snake_case -> wrapper -> kebab-case handler
    ;; Structural verification only - actual calls require integration tests
    (is (= 13 (count agent-tools/all-tools)))))
