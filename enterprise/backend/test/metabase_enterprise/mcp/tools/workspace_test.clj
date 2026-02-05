(ns metabase-enterprise.mcp.tools.workspace-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.mcp.tools :as mcp.tools]
   [metabase-enterprise.mcp.tools.workspace]))

(deftest workspace-tools-registered-test
  (testing "workspace tools are in the global registry"
    (is (contains? @mcp.tools/global-registry "list_workspaces"))
    (is (contains? @mcp.tools/global-registry "create_workspace"))
    (is (contains? @mcp.tools/global-registry "get_workspace_state"))
    (is (contains? @mcp.tools/global-registry "archive_workspace"))))
