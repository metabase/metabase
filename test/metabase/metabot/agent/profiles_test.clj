(ns metabase.metabot.agent.profiles-test
  (:require
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api-scope.core :as api-scope]
   [metabase.entity-retrieval.core :as entity-retrieval]
   ;; loaded so its `(mr/def ::profile-id …)` registers the schema the enum-acceptance test validates
   [metabase.metabot.agent.core]
   [metabase.metabot.agent.profiles :as profiles]
   [metabase.metabot.agent.prompts :as prompts]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.skills :as skills]
   [metabase.metabot.tools :as tools]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]))

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
        (is (contains? (tool-names profile) "search"))
        (is (contains? (tool-names profile) "create_chart"))
        (is (contains? (tool-names profile) "edit_chart"))))
    (testing "retrieves internal profile with default provider"
      (let [profile (profiles/get-profile :internal)]
        (is (some? profile))
        (is (= :internal (:name profile)))
        (is (= "anthropic/claude-sonnet-4-6" (:model profile)))
        (is (= 60 (:max-iterations profile)))
        (is (vector? (:tools profile)))
        ;; Should have more tools than embedding_next profile
        (is (> (count (:tools profile)) 5))
        (is (contains? (tool-names profile) "search"))
        (is (contains? (tool-names profile) "create_sql_query"))
        (is (contains? (tool-names profile) "create_chart"))))
    (testing "retrieves sql profile"
      (let [profile (profiles/get-profile :sql)]
        (is (=? {:name :sql
                 :model "anthropic/claude-sonnet-4-6"
                 :max-iterations int?
                 :required-tool-call? true}
                profile))
        (is (contains? (tool-names profile) "search"))
        (is (contains? (tool-names profile) "create_sql_query"))))
    (testing "retrieves nlq profile"
      (let [profile (profiles/get-profile :nlq)]
        (is (some? profile))
        ;; the :name stays :nlq even when redirected to the fallback, so telemetry/recents are unaffected
        (is (= :nlq (:name profile)))
        (is (= "anthropic/claude-sonnet-4-6" (:model profile)))
        (is (= 15 (:max-iterations profile)))
        ;; In tests the library index can't answer, so :nlq is transparently served the general-search
        ;; fallback; the curated/fallback swap by availability is covered by nlq-data-discovery-fallback-test.
        (is (contains? (tool-names profile) "search"))
        (is (not (contains? (tool-names profile) "retrieve_library_entities")))
        (is (contains? (tool-names profile) "construct_notebook_query"))))
    (testing "retrieves slackbot profile"
      (let [profile (profiles/get-profile :slackbot)]
        (is (some? profile))
        (is (= :slackbot (:name profile)))
        (is (= "anthropic/claude-sonnet-4-6" (:model profile)))
        (is (= 15 (:max-iterations profile)))
        (is (vector? (:tools profile)))
        (is (contains? (tool-names profile) "search"))
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
        (is (contains? tools "search"))
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
          (is (contains? tools "search") "search should always be available")
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
          (is (contains? tools "search"))
          (is (contains? tools "construct_notebook_query"))
          (is (contains? tools "create_sql_query")
              "create_sql_query should be available with permission:write_sql_queries")
          (is (contains? tools "edit_sql_query")
              "edit_sql_query should be available with permission:write_sql_queries")
          (is (contains? tools "replace_sql_query")
              "replace_sql_query should be available with permission:write_sql_queries")))
      (testing "empty capabilities should exclude all capability-gated tools"
        (let [tools (profiles/get-tools-for-profile :internal [])]
          (is (contains? tools "search") "ungated tools should remain")
          (is (not (contains? tools "create_sql_query"))
              "SQL tools should be gated by permission:write_sql_queries"))))))

(deftest embedding-next-matches-nlq-tools-test
  (testing "nlq-fallback matches embedding_next's general search; curated nlq swaps that for the library tool"
    (let [tool-names (fn [profile] (set (map #(:tool-name (meta %)) (:tools profile))))
          embedding  (tool-names (profiles/get-profile :embedding_next))
          fallback   (tool-names (profiles/get-profile :nlq-fallback))
          ;; force the curated nlq (no redirect) — get-profile :nlq otherwise falls back when the index can't answer
          curated    (mt/with-dynamic-fn-redefs [entity-retrieval/entity-retrieval-available? (constantly true)]
                       (tool-names (profiles/get-profile :nlq)))]
      ;; the fallback profile is embedding_next's discovery surface (general `search`)
      (is (= fallback embedding))
      ;; the curated profile is the same set with retrieve_library_entities in place of `search`
      (is (= curated (-> embedding (disj "search") (conj "retrieve_library_entities"))))))
  (binding [scope/*current-user-scope* api-scope/unrestricted]
    (testing "ungated tools are available with empty capabilities"
      (let [tools (profiles/get-tools-for-profile :embedding_next [])]
        (is (contains? tools "search"))
        (is (contains? tools "construct_notebook_query"))))))

(deftest nlq-data-discovery-fallback-test
  (testing "the :nlq profile always keeps a data-discovery tool, swapping by index availability"
    (binding [scope/*current-user-scope* api-scope/unrestricted]
      (testing "entity retrieval AVAILABLE -> curated library tool, no general-search fallback"
        (mt/with-dynamic-fn-redefs [entity-retrieval/entity-retrieval-available? (constantly true)]
          (let [tools (profiles/get-tools-for-profile :nlq [])]
            (is (contains? tools "retrieve_library_entities")
                "the curated library tool is offered when the index can serve queries")
            (is (not (contains? tools "search"))
                "the general-search fallback is filtered out when the library is available")
            (is (contains? tools "construct_notebook_query")))))
      (testing "entity retrieval UNAVAILABLE -> general-search fallback, no curated library tool"
        (mt/with-dynamic-fn-redefs [entity-retrieval/entity-retrieval-available? (constantly false)]
          (let [tools (profiles/get-tools-for-profile :nlq [])]
            (is (not (contains? tools "retrieve_library_entities"))
                "the curated library tool is gated out when the index can't serve queries")
            (is (contains? tools "search")
                "the general-search fallback keeps the agent from having zero discovery tools")
            (is (contains? tools "construct_notebook_query"))))))))

(deftest terminal-tools-test
  (testing "the :sql profile marks its SQL write tools AND clarification terminal"
    (is (= #{"create_sql_query" "edit_sql_query" "replace_sql_query" "ask_for_sql_clarification"}
           (:terminal-tools (profiles/get-profile :sql)))))
  (testing "the document profile ends the turn on a constructed chart, not on schema collection"
    (is (= #{"document_construct_model_chart" "document_construct_sql_chart"}
           (:terminal-tools (profiles/get-profile :document-generate-content)))))
  (testing "terminality is per-profile — profiles that share these tools don't inherit it"
    (is (nil? (:terminal-tools (profiles/get-profile :nlq)))))
  (testing ":internal ends the turn on ask_user, the one terminal tool it carries with the megabot tools"
    (is (= #{"ask_user"} (:terminal-tools (profiles/get-profile :internal))))))

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

(def ^:private megabot-tool-names
  #{"run_warehouse_sql" "run_warehouse_query" "query_app_db" "describe_app_db" "show_result" "save_result" "navigate"
    "call_api" "list_api_endpoints" "describe_api_endpoint"
    "write_note" "read_note" "delete_note"
    "todo_write" "todo_read" "ask_user"})

(def ^:private megabot-scoped-tool-names
  "Megabot reuses the shared todo tools as-is, so they carry their own :scope. Every other megabot tool is
  deliberately unguarded (no :scope)."
  #{"todo_write" "todo_read"})

(def ^:private megabot-tool-capabilities
  "The one megabot tool with `:capabilities`: run_warehouse_sql, so a user who can't write SQL anywhere isn't offered
  it and plans with run_warehouse_query instead."
  {"run_warehouse_sql" #{:permission-write-sql-queries}})

(deftest megabot-profile-test
  (testing "the :megabot profile registers with its query + memory + loop-hygiene tools and a big budget"
    (let [profile (profiles/get-profile :megabot)]
      (is (some? profile))
      (is (= :megabot (:name profile)))
      (is (= 1000 (:max-iterations profile)))
      (is (= megabot-tool-names
             (set (map #(:tool-name (meta %)) (:tools profile)))))
      (testing "loop-hygiene knobs are set: per-turn output cap, history compaction, terminal ask_user"
        (is (= 16384 (:max-output-tokens profile)))
        (is (true? (:compact-history? profile)))
        (is (= #{"ask_user"} (:terminal-tools profile))))
      (testing "persistent memory is injected via a :system-prompt-context hook"
        (is (ifn? (:system-prompt-context profile))))
      (testing "every tool except the reused todo tools is unguarded (no :scope), and only run_warehouse_sql needs a capability"
        (doseq [tool-var (:tools profile)
                :let     [tool-name (:tool-name (meta tool-var))]
                :when    (not (contains? megabot-scoped-tool-names tool-name))]
          (testing tool-name
            (is (nil? (:scope (meta tool-var))))
            (is (= (get megabot-tool-capabilities tool-name) (:capabilities (meta tool-var)))))))))
  (testing "with an unrestricted scope the tools resolve, plus load_skill from the always-on skills"
    (binding [scope/*current-user-scope* api-scope/unrestricted]
      (testing "a user who may write SQL gets every tool"
        (is (= (conj megabot-tool-names "load_skill")
               (set (keys (profiles/get-tools-for-profile :megabot ["permission:write_sql_queries"]))))))
      (testing "a user who may not gets every tool but run_warehouse_sql"
        (is (= (-> megabot-tool-names (disj "run_warehouse_sql") (conj "load_skill"))
               (set (keys (profiles/get-tools-for-profile :megabot []))))))))
  (testing "the structured-query skill is always on, and the operator catalog loads on demand"
    (let [profile  (profiles/get-profile :megabot)
          manifest (skills/build-skill-manifest profile (map #(:tool-name (meta %)) (:tools profile)) [])]
      (is (= [:megabot-discovery :megabot-query] (map :id (:always-on manifest))))
      (is (some #(= "megabot-query-operators" (:id %)) (:catalog manifest)))))
  (testing "megabot's skills follow their tools: a profile gets them only when the tool is active"
    (doseq [profile-id (keys @@#'profiles/*profiles)
            :let       [profile    (profiles/get-profile profile-id)
                        tool-names (map #(:tool-name (meta %)) (:tools profile))
                        megabot?   (fn [s] (str/starts-with? (name (:id s)) "megabot"))
                        relevant   (#'skills/skills-for-profile profile tool-names)]]
      (testing profile-id
        (if (some #{"run_warehouse_query" "call_api"} tool-names)
          (is (some megabot? relevant)
              "a profile holding the tools gets the skills that document them")
          (is (not-any? megabot? relevant)
              "a profile without the tools gets none of them")))))
  (testing "the megabot-discovery skill follows run_warehouse_query, not a profile name"
    (is (some #(= :megabot-discovery (:id %))
              (#'skills/skills-for-profile (profiles/get-profile :megabot) ["run_warehouse_query"]))
        "discovery skill is relevant wherever the tool is active")
    (is (not-any? #(= :megabot-discovery (:id %))
                  (#'skills/skills-for-profile (profiles/get-profile :internal) ["search"]))
        "discovery skill must NOT be relevant when the tool is not active"))
  (testing "the ::profile-id schema (enforced by run-agent-loop in dev/test) accepts :megabot"
    (is (mr/validate :metabase.metabot.agent.core/profile-id :megabot))))

(deftest megabot-prompt-text-names-only-megabot-tools-test
  (testing "megabot's tool descriptions, system prompt, and skills never name a tool the profile doesn't have"
    (let [all-tool-names (->> (ns-publics 'metabase.metabot.tools)
                              vals
                              (keep (comp :tool-name meta))
                              ;; plain words like `search` are also English; only snake_case names are unambiguous
                              (filter #(str/includes? % "_"))
                              set)
          allowed        (conj megabot-tool-names "load_skill")
          mentioned      (fn [text]
                           (set (filter #(re-find (re-pattern (str "\\b" % "\\b")) text) all-tool-names)))
          texts          (into {"megabot.selmer" (slurp (io/resource "metabot/prompts/system/megabot.selmer"))
                                "megabot-api.md" (slurp (io/resource "metabot/skills/megabot-api.md"))
                                "megabot-discovery.md" (slurp (io/resource "metabot/skills/megabot-discovery.md"))
                                "megabot-query.md" (slurp (io/resource "metabot/skills/megabot-query.md"))
                                "megabot-query-operators.md" (slurp (io/resource "metabot/skills/megabot-query-operators.md"))}
                               (for [tool-var (:tools (profiles/get-profile :megabot))]
                                 [(:tool-name (meta tool-var)) (:doc (meta tool-var))]))]
      (is (contains? all-tool-names "save_entity") "sanity: the other profiles' tools are in the checked set")
      (doseq [[source text] texts]
        (testing source
          (is (= #{} (set/difference (mentioned text) allowed))))))))

(deftest internal-carries-the-megabot-tools-test
  (testing "the in-app profile keeps its own tools and adds the megabot set"
    (let [profile    (profiles/get-profile :internal)
          tool-names (set (map #(:tool-name (meta %)) (:tools profile)))]
      (is (set/subset? megabot-tool-names tool-names)
          "every megabot tool is present")
      (is (set/subset? #{"search" "construct_notebook_query" "analyze_chart" "save_entity"} tool-names)
          ":internal keeps the tools it already had")
      (testing "the loop knobs that make the longer budget usable are set"
        (is (= 60 (:max-iterations profile)))
        (is (= 16384 (:max-output-tokens profile)))
        (is (true? (:compact-history? profile))))
      (testing "the primed app-db map, instance snapshot and note catalog are injected"
        (is (ifn? (:system-prompt-context profile))))))
  (binding [scope/*current-user-scope* api-scope/unrestricted]
    (testing "capability gating still applies to the tools that declare one"
      (let [without-sql (set (keys (profiles/get-tools-for-profile :internal [])))
            with-sql    (set (keys (profiles/get-tools-for-profile :internal ["permission:write_sql_queries"])))]
        (is (not (contains? without-sql "run_warehouse_sql"))
            "a user who may not write SQL is not offered run_warehouse_sql")
        (is (contains? with-sql "run_warehouse_sql"))
        (testing "the ungated megabot tools are there either way"
          (doseq [tool-name ["run_warehouse_query" "query_app_db" "call_api" "write_note" "ask_user"]]
            (testing tool-name
              (is (contains? without-sql tool-name)))))))
    (testing "the prompt gains the execution sections, and the cache breakpoint only when primed context is rendered"
      (let [profile  (profiles/get-profile :internal)
            tools    (profiles/profile->tools profile ["permission:write_sql_queries"])
            rendered (prompts/build-system-message-content profile {} tools ["permission:write_sql_queries"])]
        (is (str/includes? rendered "# Running queries and reading the results"))
        (is (str/includes? rendered "# Doing things in Metabase"))
        (is (not (str/includes? rendered "**You cannot create dashboards or documents.**"))
            "the prompt no longer claims it can't do what call_api does")
        (is (not (str/includes? rendered "<<<METABOT_CACHE_BREAKPOINT>>>"))
            "no breakpoint without the primed app-db map: nothing dynamic follows it")
        (testing "and the breakpoint appears once the profile's own context hook supplies the map"
          (let [primed (prompts/build-system-message-content
                        profile {:megabot_app_db_map "## App DB" :megabot_instance "## This instance"}
                        tools ["permission:write_sql_queries"])]
            (is (str/includes? primed "<<<METABOT_CACHE_BREAKPOINT>>>"))
            (is (< (.indexOf ^String primed "## App DB")
                   (.indexOf ^String primed "<<<METABOT_CACHE_BREAKPOINT>>>")
                   (.indexOf ^String primed "## This instance"))
                "static map before the breakpoint, per-user snapshot after it")))))
    (testing "the structured-query skills follow the tools into :internal"
      (let [profile  (profiles/get-profile :internal)
            manifest (skills/build-skill-manifest profile
                                                  (keys (profiles/profile->tools profile []))
                                                  [])]
        (is (= [:megabot-discovery :megabot-query] (map :id (:always-on manifest))))
        (is (some #(= "megabot-query-operators" (:id %)) (:catalog manifest)))
        (is (some #(= "megabot-api" (:id %)) (:catalog manifest)))))))

(deftest explorations-profile-disables-skills-test
  (binding [scope/*current-user-scope* api-scope/unrestricted]
    (testing "explorations opts out of skills so read_resource does not inject load_skill"
      (let [profile (profiles/get-profile :explorations)
            tools   (profiles/profile->tools profile [])]
        (is (false? (:skills? profile)))
        (is (contains? tools "read_resource")
            "precondition: read_resource is active (would otherwise match a skill)")
        (is (not (contains? tools "load_skill")))))))
