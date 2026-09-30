(ns metabase.metabot.agent.profiles-test
  (:require
   [clojure.test :refer :all]
   [metabase.api-scope.core :as api-scope]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.metabot.agent.profiles :as profiles]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools :as tools]
   [metabase.search.engine :as search.engine]
   [metabase.test :as mt]))

(defn- keyword-search-tool-name
  "The keyword search tool this instance advertises: full-text on a Postgres app DB, else substring."
  []
  (if (= :fulltext (search.engine/keyword-flavour)) "fulltext_search" "substring_search"))

(deftest get-profile-test
  (letfn [(tool-names [profile]
            (set (map #(:tool-name (meta %)) (:tools profile))))]
    (testing "retrieves embedding_next profile with default provider"
      (let [profile (profiles/get-profile :embedding_next)]
        (is (some? profile))
        (is (= :embedding_next (:name profile)))
        (is (= "anthropic/claude-sonnet-4-6" (:model profile)))
        (is (= 15 (:max-iterations profile)))
        (is (vector? (:tools profile)))
        (is (contains? (tool-names profile) "construct_notebook_query"))
        (is (contains? (tool-names profile) "fulltext_search"))
        (is (contains? (tool-names profile) "create_chart"))
        (is (contains? (tool-names profile) "edit_chart"))))
    (testing "retrieves internal profile with default provider"
      (let [profile (profiles/get-profile :internal)]
        (is (some? profile))
        (is (= :internal (:name profile)))
        (is (= "anthropic/claude-sonnet-4-6" (:model profile)))
        (is (= 15 (:max-iterations profile)))
        (is (vector? (:tools profile)))
        ;; Should have more tools than embedding_next profile
        (is (> (count (:tools profile)) 5))
        (is (contains? (tool-names profile) "fulltext_search"))
        (is (contains? (tool-names profile) "create_sql_query"))
        (is (contains? (tool-names profile) "create_chart"))))
    (testing "retrieves sql profile"
      (let [profile (profiles/get-profile :sql)]
        (is (=? {:name :sql
                 :model "anthropic/claude-sonnet-4-6"
                 :max-iterations int?
                 :required-tool-call? true}
                profile))
        (is (contains? (tool-names profile) "fulltext_search"))
        (is (contains? (tool-names profile) "create_sql_query"))))
    (testing "retrieves nlq profile"
      (let [profile (profiles/get-profile :nlq)]
        (is (some? profile))
        ;; the :name stays :nlq even when redirected to the fallback, so telemetry/recents are unaffected
        (is (= :nlq (:name profile)))
        (is (= "anthropic/claude-sonnet-4-6" (:model profile)))
        (is (= 15 (:max-iterations profile)))
        ;; library retrieval sits beside the search tools; which are offered each turn is covered by
        ;; nlq-data-discovery-test
        (is (contains? (tool-names profile) "fulltext_search"))
        (is (contains? (tool-names profile) "retrieve_library_entities"))
        (is (contains? (tool-names profile) "construct_notebook_query"))))
    (testing "retrieves slackbot profile"
      (let [profile (profiles/get-profile :slackbot)]
        (is (some? profile))
        (is (= :slackbot (:name profile)))
        (is (= "anthropic/claude-sonnet-4-6" (:model profile)))
        (is (= 15 (:max-iterations profile)))
        (is (vector? (:tools profile)))
        (is (contains? (tool-names profile) "fulltext_search"))
        (is (contains? (tool-names profile) "construct_notebook_query"))
        (is (contains? (tool-names profile) "static_viz"))
        (is (contains? (tool-names profile) "create_alert"))
        (is (contains? (tool-names profile) "create_dashboard_subscription"))))
    (testing "returns nil for unknown profile"
      (is (nil? (profiles/get-profile :unknown-profile))))
    (testing "profile-registered? distinguishes registered profiles from unknown ones"
      (is (true? (profiles/profile-registered? :embedding_next)))
      (is (true? (profiles/profile-registered? :explorations)))
      (is (false? (profiles/profile-registered? :unknown-profile))))
    (testing "all profiles have required keys"
      (doseq [profile-id [:embedding_next :internal :sql :nlq :slackbot]]
        (let [profile (profiles/get-profile profile-id)]
          (is (= profile-id (:name profile)))
          (is (contains? profile :model))
          (is (contains? profile :max-iterations))
          (is (contains? profile :tools))
          (is (every? var? (:tools profile))))))))

(deftest get-profile-respects-provider-setting-test
  (testing "model reflects llm-metabot-provider setting"
    (mt/with-temporary-setting-values [llm-metabot-provider "openai/gpt-4.1-mini"]
      (is (= "openai/gpt-4.1-mini" (:model (profiles/get-profile :internal)))))
    (mt/with-temporary-setting-values [llm-metabot-provider "openrouter/google/gemini-2.5-flash"]
      (is (= "openrouter/google/gemini-2.5-flash" (:model (profiles/get-profile :embedding_next)))))))

(deftest get-tools-for-profile-excludes-capability-gated-tools-test
  (binding [scope/*current-user-scope* api-scope/unrestricted]
    (testing "empty capabilities excludes capability-gated tools but includes ungated tools"
      (let [tools (profiles/get-tools-for-profile :internal [])]
        ;; Ungated tools should always be available
        (is (contains? tools (keyword-search-tool-name)))
        (is (contains? tools "create_autogenerated_dashboard"))
        ;; Capability-gated tools should be excluded
        (is (not (contains? tools "create_sql_query")))))))

(deftest get-tools-for-profile-includes-capability-gated-tools-test
  (binding [scope/*current-user-scope* api-scope/unrestricted]
    (testing "providing a capability includes tools gated by that capability"
      (let [tools (profiles/get-tools-for-profile :internal [:permission-write-sql-queries])]
        (is (contains? tools "create_sql_query"))))))

(deftest get-tools-for-profile-string-capabilities-test
  (binding [scope/*current-user-scope* api-scope/unrestricted]
    (testing "capabilities as strings (as sent by the API / benchmark client)"
      (testing "NLQ-only capabilities should exclude SQL tools but include ungated tools"
        (let [;; This is what the NLQ benchmark actually sends via the API:
              nlq-capabilities ["permission:save_questions"]
              tools (profiles/get-tools-for-profile :internal nlq-capabilities)]
          (is (contains? tools (keyword-search-tool-name)) "search should always be available")
          (is (contains? tools "construct_notebook_query") "notebook queries should be available")
          (is (contains? tools "read_resource") "read_resource should always be available")
          (is (not (contains? tools "create_sql_query"))
              "create_sql_query should NOT be available without permission:write_sql_queries")
          (is (not (contains? tools "edit_sql_query"))
              "edit_sql_query should NOT be available without permission:write_sql_queries")
          (is (not (contains? tools "replace_sql_query"))
              "replace_sql_query should NOT be available without permission:write_sql_queries")))
      (testing "full capabilities including SQL write permission should include SQL tools"
        (let [full-capabilities ["permission:save_questions"
                                 "permission:write_sql_queries"]
              tools (profiles/get-tools-for-profile :internal full-capabilities)]
          (is (contains? tools (keyword-search-tool-name)))
          (is (contains? tools "construct_notebook_query"))
          (is (contains? tools "create_sql_query")
              "create_sql_query should be available with permission:write_sql_queries")
          (is (contains? tools "edit_sql_query")
              "edit_sql_query should be available with permission:write_sql_queries")
          (is (contains? tools "replace_sql_query")
              "replace_sql_query should be available with permission:write_sql_queries")))
      (testing "empty capabilities should exclude all capability-gated tools"
        (let [tools (profiles/get-tools-for-profile :internal [])]
          (is (contains? tools (keyword-search-tool-name)) "ungated tools should remain")
          (is (not (contains? tools "create_sql_query"))
              "SQL tools should be gated by permission:write_sql_queries"))))))

(deftest embedding-next-matches-nlq-tools-test
  (testing "nlq and embedding_next discover data the same way: library retrieval beside the search tools"
    (let [tool-names (fn [profile] (set (map #(:tool-name (meta %)) (:tools profile))))]
      (is (= (tool-names (profiles/get-profile :nlq))
             (tool-names (profiles/get-profile :embedding_next))))))
  (binding [scope/*current-user-scope* api-scope/unrestricted]
    (testing "ungated tools are available with empty capabilities"
      (let [tools (profiles/get-tools-for-profile :embedding_next [])]
        (is (contains? tools (keyword-search-tool-name)))
        (is (contains? tools "construct_notebook_query"))))))

(deftest nlq-data-discovery-test
  (testing "library retrieval is offered beside the search tools whenever it can serve"
    (binding [scope/*current-user-scope* api-scope/unrestricted]
      (testing "index available -> library retrieval and a keyword search tool"
        (mt/with-dynamic-fn-redefs [entity-retrieval/entity-retrieval-available? (constantly true)]
          (let [tools (profiles/get-tools-for-profile :nlq [])]
            (is (contains? tools "retrieve_library_entities"))
            (is (contains? tools (keyword-search-tool-name))))))
      (testing "index unavailable -> only the search tools, and the prompt says why the library is missing"
        (mt/with-dynamic-fn-redefs [entity-retrieval/entity-retrieval-available? (constantly false)]
          (let [profile (profiles/get-profile :nlq)
                tools   (profiles/profile->tools profile [])]
            (is (not (contains? tools "retrieve_library_entities")))
            (is (contains? tools (keyword-search-tool-name)))
            (is (=? [{:name "retrieve_library_entities" :reason "library search isn't set up on this instance"}]
                    (filter #(= "retrieve_library_entities" (:name %))
                            (profiles/unavailable-tools profile []))))))))))

(deftest library-withheld-where-it-cannot-honour-limits-test
  (testing "library retrieval is withheld from a metabot confined to a collection, or limited to curated content"
    (binding [scope/*current-user-scope* api-scope/unrestricted]
      (mt/with-dynamic-fn-redefs [entity-retrieval/entity-retrieval-available? (constantly true)]
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Scope"}
                       :model/Metabot    {confined :entity_id} {:name "confined bot" :collection_id coll-id}
                       :model/Metabot    {curated :entity_id}  {:name "curated bot" :use_verified_content true}
                       :model/Metabot    {open :entity_id}     {:name "open bot"}]
          (let [offered? (fn [metabot-id profile-id]
                           (contains? (profiles/profile->tools (profiles/get-profile profile-id) []
                                                               {:metabot-id metabot-id :profile-id profile-id})
                                      "retrieve_library_entities"))]
            (is (not (offered? confined :nlq)) "confined to a collection")
            (is (offered? confined :internal) "the internal profile isn't confined")
            (is (not (offered? curated :internal)) "limited to curated content")
            (is (offered? open :nlq))))))))

(deftest terminal-tools-test
  (testing "the :sql profile marks its SQL write tools AND clarification terminal"
    (is (= #{"create_sql_query" "edit_sql_query" "replace_sql_query" "ask_for_sql_clarification"}
           (:terminal-tools (profiles/get-profile :sql)))))
  (testing "the document profile ends the turn on a constructed chart, not on schema collection"
    (is (= #{"document_construct_model_chart" "document_construct_sql_chart"}
           (:terminal-tools (profiles/get-profile :document-generate-content)))))
  (testing "terminality is per-profile — profiles that share these tools don't inherit it"
    (is (nil? (:terminal-tools (profiles/get-profile :internal))))
    (is (nil? (:terminal-tools (profiles/get-profile :nlq))))))

(deftest register-profile-validation-test
  (let [base {:name            :scratch
              :prompt-template "internal.selmer"
              :max-iterations  10
              :tools           [#'tools/read-resource-tool]}]
    (testing "rejects :always-on-skills that don't resolve to a registered skill"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"unknown always-on skill"
                            (#'profiles/register-profile!
                             (assoc base :always-on-skills [:no-such-skill])))))
    (testing "rejects :terminal-tools the profile does not expose"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"terminal tools it does not expose"
                            (#'profiles/register-profile!
                             (assoc base :terminal-tools #{"nonexistent_tool"})))))
    (testing "rejects :skills? false combined with :always-on-skills"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"disables skills but lists"
                            (#'profiles/register-profile!
                             (assoc base :skills? false :always-on-skills [:read-resource])))))))

(deftest explorations-profile-disables-skills-test
  (binding [scope/*current-user-scope* api-scope/unrestricted]
    (testing "explorations opts out of skills so read_resource does not inject load_skill"
      (let [profile (profiles/get-profile :explorations)
            tools   (profiles/profile->tools profile [])]
        (is (false? (:skills? profile)))
        (is (contains? tools "read_resource")
            "precondition: read_resource is active (would otherwise match a skill)")
        (is (not (contains? tools "load_skill")))))))

(deftest search-tool-availability-test
  (binding [scope/*current-user-scope* api-scope/unrestricted]
    (testing "the keyword search tool follows the keyword engine's flavour"
      (doseq [[flavour tool-name tool-var] [[:fulltext "fulltext_search" #'tools/fulltext-search-tool]
                                            [:substring-or "substring_search" #'tools/substring-or-search-tool]
                                            [:substring-and "substring_search" #'tools/substring-and-search-tool]]]
        (mt/with-dynamic-fn-redefs [search.engine/keyword-flavour (constantly flavour)]
          (let [tools (profiles/get-tools-for-profile :internal [])]
            (is (= tool-var (get tools tool-name)) (str flavour))
            (is (= 1 (count (filter #{"fulltext_search" "substring_search"} (keys tools)))) (str flavour))))))
    (testing "semantic_search is offered only when the semantic engine can serve"
      (mt/with-dynamic-fn-redefs [search.engine/engine-status (fn [engine] (if (= engine :search.engine/semantic) :ok :unknown))]
        (is (contains? (profiles/get-tools-for-profile :internal []) "semantic_search")))
      (mt/with-dynamic-fn-redefs [search.engine/engine-status (constantly :inactive)]
        (is (not (contains? (profiles/get-tools-for-profile :internal []) "semantic_search")))))))

(deftest unavailable-tools-test
  (binding [scope/*current-user-scope* api-scope/unrestricted]
    (testing "a tool that can't serve and describes itself is listed with its reason"
      (mt/with-dynamic-fn-redefs [search.engine/engine-status (constantly :inactive)]
        (is (=? [{:name       "semantic_search"
                  :purpose    string?
                  :reason     "semantic search isn't set up on this instance"
                  :workaround string?}]
                (filter #(= "semantic_search" (:name %))
                        (profiles/unavailable-tools (profiles/get-profile :internal) []))))))
    (testing "an available tool, or a keyword variant whose sibling serves, is not listed"
      (mt/with-dynamic-fn-redefs [search.engine/engine-status (constantly :ok)]
        (is (not-any? #(#{"semantic_search" "fulltext_search" "substring_search"} (:name %))
                      (profiles/unavailable-tools (profiles/get-profile :internal) [])))))))

(deftest register-profile-alternatives-test
  (testing "tools may share a name only as alternatives that each declare :available?"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Duplicate tool names"
                          (#'profiles/register-profile! {:name            ::duplicate
                                                         :prompt-template "internal.selmer"
                                                         :max-iterations  1
                                                         :tools           [#'tools/read-resource-tool
                                                                           #'tools/read-resource-tool]})))
    (try
      (#'profiles/register-profile! {:name            ::alternatives
                                     :prompt-template "internal.selmer"
                                     :max-iterations  1
                                     :tools           [#'tools/substring-or-search-tool
                                                       #'tools/substring-and-search-tool]})
      (is (some? (profiles/get-profile ::alternatives)))
      (finally
        (swap! @#'profiles/*profiles dissoc ::alternatives)))))
