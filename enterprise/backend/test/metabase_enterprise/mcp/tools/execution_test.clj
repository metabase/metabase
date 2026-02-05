(ns metabase-enterprise.mcp.tools.execution-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.mcp.tools :as mcp.tools]
   [metabase-enterprise.mcp.tools.execution]))

(deftest execution-tools-registered-test
  (testing "execution tools are in the global registry"
    (is (contains? @mcp.tools/global-registry "run_transforms"))
    (is (contains? @mcp.tools/global-registry "get_problems"))
    (is (contains? @mcp.tools/global-registry "merge_workspace"))))
