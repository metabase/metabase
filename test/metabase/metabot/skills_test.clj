(ns metabase.metabot.skills-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.skills :as skills]
   [metabase.metabot.skills.init]))

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
  (let [profile {:name :internal}
        manifest (skills/build-skill-manifest
                  profile
                  ["construct_notebook_query" "read_resource"]
                  [])]
    (testing "catalog lists available skills with string ids"
      (let [ids (map :id (:catalog manifest))]
        (is (every? string? ids))
        (is (some #{"construct-notebook-query-core"} ids))
        (is (some #{"read-resource"} ids))))
    (testing "catalog entries are display-only (id/title/description), no body"
      (is (every? #(= #{:id :title :description} (set (keys %))) (:catalog manifest))))
    (testing "catalog is sorted by descending priority then id"
      ;; core has priority 60, the rest 50, operators 40 -> core first, operators last
      (is (= "construct-notebook-query-core" (:id (first (:catalog manifest))))))
    (testing "no always-on skills in this migration"
      (is (empty? (:always-on manifest))))))

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
  (testing "returns empty when no dialect is given"
    (is (= [] (skills/dialect-preload-parts nil))))
  (testing "returns empty when the dialect has no registered skill"
    (is (= [] (skills/dialect-preload-parts "nonexistent-engine")))))
