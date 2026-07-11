(ns metabase.mcp.toolsets-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.agent-api.api]
   [metabase.api-scope.core :as api-scope]
   [metabase.mcp.core :as mcp.core]
   [metabase.mcp.scope :as mcp.scope]
   [metabase.mcp.toolsets :as toolsets]))

(deftest ^:parallel registry-shape-test
  (testing "7 toolsets covering 24 tools, each with a risk level and a group scope"
    (is (= 7 (count toolsets/toolsets)))
    (is (= 24 (count (toolsets/all-tools))))
    (is (= 24 (count (distinct (toolsets/all-tools))))
        "no tool belongs to two toolsets")
    (is (every? (fn [{:keys [risk scope tools]}]
                  (and (#{:read :write} risk)
                       (string? scope)
                       (seq tools)))
                toolsets/toolsets)))
  (testing "the catalog matches the design: 5 discover, 3 query, 6 author, 3 curate, 3 definitions, 2 notify, 2 ui"
    (is (= {:discover 5 :query 3 :author 6 :curate 3 :definitions 3 :notify 2 :ui 2}
           (into {} (map (juxt :toolset (comp count :tools))) toolsets/toolsets)))))

(deftest ^:parallel tool->toolset-test
  (is (= :discover (toolsets/tool->toolset "search")))
  (is (= :query (toolsets/tool->toolset "execute_sql")))
  (is (= :author (toolsets/tool->toolset "dashboard_write")))
  (is (= :curate (toolsets/tool->toolset "revert_content")))
  (is (= :definitions (toolsets/tool->toolset "segment_write")))
  (is (= :notify (toolsets/tool->toolset "alert_write")))
  (is (= :ui (toolsets/tool->toolset "visualize_query")))
  (is (nil? (toolsets/tool->toolset "not_a_tool"))))

(deftest ^:parallel group-scopes-registered-test
  (testing "each new group scope is a registered scope"
    (doseq [s (toolsets/group-scopes)]
      (is (api-scope/registered-scope? s) (str s " should be registered"))))
  (testing "the six new group scopes are exactly the read/write toolset scopes (ui excluded)"
    (is (= #{"agent:discover:read" "agent:query:read" "agent:author:write"
             "agent:curate:write" "agent:definitions:write" "agent:notify:write"}
           (set (toolsets/group-scopes))))))

(deftest ^:parallel group-scope-matches-members-denies-non-members-test
  (testing "a token carrying only one group scope matches that group and denies the others"
    (doseq [{:keys [scope toolset]} toolsets/toolsets
            :when (not= :ui toolset)]
      (let [granted #{scope}]
        (is (mcp.scope/matches? granted scope)
            (str granted " should grant " scope))
        (doseq [other (toolsets/group-scopes)
                :when (not= other scope)]
          (is (not (mcp.scope/matches? granted other))
              (str granted " must not grant " other)))))))

(deftest ^:parallel group-wildcard-covers-write-scope-test
  (testing "a category wildcard covers its concrete scope, and ui's wildcard covers both viz scopes"
    (is (api-scope/scope-matches? #{"agent:author:*"} "agent:author:write"))
    (is (api-scope/scope-matches? #{(toolsets/toolset-scope :ui)} "agent:viz:mcp-ui:query"))
    (is (api-scope/scope-matches? #{(toolsets/toolset-scope :ui)} "agent:viz:mcp-ui:drill-through"))))

(deftest ^:parallel default-toolsets-test
  (testing "all 7 toolsets ship on by default"
    (is (= 7 (count toolsets/default-toolsets)))
    (is (= (set (map :toolset toolsets/toolsets))
           (set toolsets/default-toolsets)))))

(deftest ^:parallel grant->scopes-test
  (testing "granting toolsets yields their group scopes"
    (is (= #{"agent:discover:read" "agent:query:read"}
           (toolsets/grant->scopes [:discover :query] false)))
    (is (= #{"agent:author:write"}
           (toolsets/grant->scopes [:author] false))))
  (testing "unknown toolset keywords are ignored"
    (is (= #{"agent:discover:read"}
           (toolsets/grant->scopes [:discover :nope] false))))
  (testing "read-only? drops write toolsets even when granted"
    (is (= #{"agent:discover:read" "agent:query:read" (toolsets/toolset-scope :ui)}
           (toolsets/grant->scopes [:discover :query :author :notify :ui] true)))
    (is (empty? (toolsets/grant->scopes [:author :curate :definitions :notify] true))))
  (testing "a read-only grant lists no write tools"
    (let [scopes (toolsets/grant->scopes toolsets/default-toolsets true)]
      (doseq [{:keys [risk tools]} toolsets/toolsets
              :when (= :write risk)
              tool  tools]
        (is (not (mcp.scope/matches? scopes (toolsets/toolset-scope (toolsets/tool->toolset tool))))
            (str "read-only grant must not enable write tool " tool))))))

(deftest ^:parallel all-scopes-advertises-group-scopes-test
  (testing "mcp.core/all-scopes advertises every new group scope for the OAuth server"
    (let [advertised (set (mcp.core/all-scopes))]
      (doseq [s (toolsets/group-scopes)]
        (is (contains? advertised s) (str s " should be advertised"))))))

(deftest ^:parallel v1->v2-migration-targets-are-valid-test
  (testing "every non-nil migration target is a known v2 scope (a group scope or a ui scope)"
    (let [valid (into (set (toolsets/group-scopes))
                      ["agent:viz:mcp-ui:query" "agent:viz:mcp-ui:drill-through"])]
      (doseq [[v1 v2] toolsets/v1->v2-scope-migration]
        (is (string? v1))
        (when (some? v2)
          (is (contains? valid v2) (str v1 " maps to unknown target " v2)))))))
