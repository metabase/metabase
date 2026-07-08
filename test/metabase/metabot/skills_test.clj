(ns metabase.metabot.skills-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.agent.prompts :as prompts]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.skills :as skills]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest ^:parallel skill-loadable?-capability-gate-test
  (testing "load_skill applies the same capability gate as the catalog, so a capability-gated
           skill hidden from the manifest is not loadable by id either"
    (let [gated {:id :x :title "x" :description "x" :body "x"
                 :capabilities [:permission-write-sql-queries]}]
      (testing "loadable when the request carries the capability"
        (binding [scope/*current-user-capabilities* ["permission:write_sql_queries"]]
          (is (skills/skill-loadable? gated))))
      (testing "not loadable when the request lacks it"
        (binding [scope/*current-user-capabilities* #{}]
          (is (not (skills/skill-loadable? gated)))))))
  (testing "an ungated skill is loadable regardless of capabilities"
    (binding [scope/*current-user-capabilities* #{}]
      (is (skills/skill-loadable? {:id :y :title "y" :description "y" :body "y"})))))

(deftest ^:parallel skill-loadable?-manifest-gate-test
  (testing "when a request manifest has been tracked, load_skill is limited to ids from that manifest"
    (let [allowed-skill (skills/get-skill :construct-notebook-query-core)
          hidden-skill  (skills/get-skill :read-resource)]
      (binding [scope/*current-loadable-skill-ids* (atom #{:construct-notebook-query-core})]
        (is (skills/skill-loadable? allowed-skill))
        (is (not (skills/skill-loadable? hidden-skill)))))))

(deftest ^:parallel registry-populated-test
  (testing "markdown skills and dialect skills are registered at load"
    (let [ids (set (map :id (skills/all-skills)))]
      (is (contains? ids :construct-notebook-query-core))
      (is (contains? ids :read-resource))
      (is (contains? ids :sql-dialect-postgresql)))
    (testing "construct monolith is split into three skills"
      (is (every? (set (map :id (skills/all-skills)))
                  [:construct-notebook-query-core
                   :construct-notebook-query-advanced
                   :construct-notebook-query-operators])))))

(deftest ^:parallel get-skill-by-id-string-test
  (testing "resolves a known skill by its string id"
    (is (= :construct-notebook-query-core
           (:id (skills/get-skill-by-id-string "construct-notebook-query-core")))))
  (testing "an unknown id returns nil without interning a keyword"
    (let [unseen "load-skill-never-seen-id-xyz"]
      (is (nil? (find-keyword unseen)) "precondition: id is not yet interned")
      (is (nil? (skills/get-skill-by-id-string unseen)))
      (is (nil? (find-keyword unseen)) "lookup must not have interned the id"))))

(deftest ^:parallel skill-shape-test
  (testing "a parsed markdown skill has frontmatter + body"
    (let [s (skills/get-skill :construct-notebook-query-core)]
      (is (= "construct-notebook-query-core" (name (:id s))))
      (is (string? (:title s)))
      (is (str/includes? (:description s) "construct_notebook_query"))
      (is (= ["construct_notebook_query"] (:tools s)))
      (is (str/includes? (:body s) "Universal clause shape"))
      ;; the YAML frontmatter delimiter must not leak into the body
      (is (not (str/starts-with? (:body s) "---"))))))

(deftest ^:parallel skills-for-tool-test
  (testing "all three construct skills associate with the construct tool"
    (is (= #{:construct-notebook-query-core
             :construct-notebook-query-advanced
             :construct-notebook-query-operators}
           (set (map :id (skills/skills-for-tool "construct_notebook_query"))))))
  (testing "dialect skills are never returned by tool association"
    (is (empty? (filter :dialect (skills/skills-for-tool "construct_notebook_query"))))))

(deftest ^:parallel skills-for-profile-test
  (let [profile {:name :internal}]
    (testing "tool-associated skills surface for active tools"
      (let [ids (set (map :id (skills/skills-for-profile profile ["construct_notebook_query"])))]
        (is (contains? ids :construct-notebook-query-core))
        (is (not (contains? ids :read-resource)))))
    (testing "no skills for tools the profile is not using"
      (is (empty? (skills/skills-for-profile profile []))))
    (testing "dialect skills are excluded even though they have no tools"
      (is (empty? (filter :dialect (skills/skills-for-profile profile ["construct_notebook_query"])))))))

(deftest ^:parallel build-skill-manifest-test
  ;; :internal declares no :always-on-skills, so every relevant skill is on-demand (catalog).
  (let [profile  {:name :internal}
        manifest (skills/build-skill-manifest
                  profile
                  ["construct_notebook_query" "read_resource"]
                  [])]
    (testing "catalog lists available on-demand skills with string ids"
      (let [ids (map :id (:catalog manifest))]
        (is (every? string? ids))
        (is (some #{"construct-notebook-query-core"} ids))
        (is (some #{"read-resource"} ids)
            "without :always-on-skills, read-resource is on-demand for this profile")))
    (testing "catalog entries are display-only (id/title/description), no body"
      (is (every? #(= #{:id :title :description} (set (keys %))) (:catalog manifest))))
    (testing "catalog is sorted by descending priority then id"
      ;; core has priority 60, the rest 50, operators 40 -> core first, operators last
      (is (= "construct-notebook-query-core" (:id (first (:catalog manifest))))))
    (testing "no always-on skills when the profile declares none"
      (is (empty? (:always-on manifest))))))

(deftest ^:parallel build-skill-manifest-always-on-is-per-profile-test
  (testing "a skill listed in the profile's :always-on-skills is inlined (body) and removed from
           the catalog, while the same skill is on-demand for a profile that doesn't list it"
    (let [tools     ["read_resource"]
          inlined   (skills/build-skill-manifest
                     {:name :sql :always-on-skills [:read-resource]} tools [])
          on-demand (skills/build-skill-manifest
                     {:name :internal} tools [])]
      (testing "profile that opts in -> always-on with body, absent from catalog"
        (is (= ["read-resource"] (map (comp name :id) (:always-on inlined))))
        (is (every? :body (:always-on inlined)))
        (is (not (some #{"read-resource"} (map :id (:catalog inlined))))))
      (testing "profile that opts out -> on-demand in catalog, not always-on"
        (is (empty? (:always-on on-demand)))
        (is (some #{"read-resource"} (map :id (:catalog on-demand))))))))

(deftest ^:parallel always-on-skill-body-is-in-system-prompt-test
  ;; A "marker" line lifted verbatim from the read-resource skill body. If the skill is inlined,
  ;; this text appears in the rendered system prompt; if it is on-demand, only its one-line catalog
  ;; description appears (which does not contain this phrase).
  (let [marker     "Drill, don't re-search"
        tools      {"read_resource" nil}
        render     (fn [profile]
                     (binding [scope/*current-user-metabot-permissions*
                               {:permission/metabot-sql-generation :yes
                                :permission/metabot-nlq            :no
                                :permission/metabot-other-tools    :no}]
                       (prompts/build-system-message-content
                        (assoc profile :prompt-template "sql-querying-only.selmer")
                        {:current_time "2026-06-19T12:00:00Z"}
                        tools
                        [])))]
    (testing "read-resource body IS present when the profile marks it always-on"
      (let [rendered (render {:name :sql :always-on-skills [:read-resource]})]
        (is (str/includes? rendered marker)
            "always-on skill body must be inlined into the system prompt")
        (is (str/includes? rendered (:body (skills/get-skill :read-resource)))
            "the full skill body is inlined, not just a fragment")
        (is (not (str/includes? rendered "# Available skills"))
            "an empty catalog must NOT render the load_skill header (would invite pointless loads)")))
    (testing "read-resource body is ABSENT when the profile leaves it on-demand"
      (let [rendered (render {:name :sql})]
        (is (not (str/includes? rendered marker))
            "an on-demand skill's body must not leak into the prompt prefix")
        (is (str/includes? rendered "# Available skills")
            "a non-empty catalog renders the load_skill header")
        (is (str/includes? rendered "read-resource")
            "the on-demand skill still appears as a one-line catalog entry")))))

(deftest ^:parallel build-skill-manifest-records-loadable-skill-ids-test
  (testing "building the manifest records the request's loadable skill ids"
    (binding [scope/*current-loadable-skill-ids* (atom #{})]
      (skills/build-skill-manifest {:name :internal} ["construct_notebook_query"] [])
      (is (contains? @scope/*current-loadable-skill-ids* :construct-notebook-query-core))
      (is (not (contains? @scope/*current-loadable-skill-ids* :read-resource)))))
  (testing "a profile's always-on skills are NOT loadable — their bodies are already inlined, so
           load_skill must not re-fetch them (a wasted iteration)"
    (binding [scope/*current-loadable-skill-ids* (atom #{})]
      (skills/build-skill-manifest
       {:name :sql :always-on-skills [:read-resource]} ["read_resource"] [])
      (is (not (contains? @scope/*current-loadable-skill-ids* :read-resource))
          "an always-on skill must be excluded from the loadable set")
      (is (not (skills/skill-loadable? (skills/get-skill :read-resource)))
          "skill-loadable? rejects an always-on skill once a manifest is tracked"))))

(deftest ^:parallel dialect-preload-parts-test
  (testing "resolves a synthetic load_skill pair when the dialect is known"
    (let [parts (skills/dialect-preload-parts "postgresql")]
      (is (= 2 (count parts)))
      (is (= :tool-input (:type (first parts))))
      (is (= "load_skill" (:function (first parts))))
      (is (= ["sql-dialect-postgresql"] (get-in (first parts) [:arguments :ids])))
      (is (= :tool-output (:type (second parts))))
      (is (str/includes? (get-in (second parts) [:result :output]) "PostgreSQL"))
      (testing "the tool-input and tool-output share an id"
        (is (= (:id (first parts)) (:id (second parts)))))))
  (testing "resolves a raw driver name through driver/llm-sql-dialect-resource"
    ;; the FE sends the driver name (`postgres`), not the dialect file's name (`postgresql`)
    (let [parts (skills/dialect-preload-parts "postgres")]
      (is (= ["sql-dialect-postgresql"] (get-in (first parts) [:arguments :ids])))))
  (testing "a bare dialect name resolves from the registry without touching the driver system"
    (mt/with-dynamic-fn-redefs [skills/engine->dialect
                                (fn [engine]
                                  (throw (ex-info "driver lookup should not run" {:engine engine})))]
      (is (= ["sql-dialect-postgresql"]
             (get-in (first (skills/dialect-preload-parts "postgresql")) [:arguments :ids])))))
  (testing "returns empty when no dialect is given"
    (is (= [] (skills/dialect-preload-parts nil))))
  (testing "returns empty when the dialect has no registered skill"
    (is (= [] (skills/dialect-preload-parts "nonexistent-engine")))))
