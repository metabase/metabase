(ns metabase-enterprise.mcp.integration-test
  "End-to-end MCP workflow test."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.mcp.server :as mcp.server]
   [metabase-enterprise.mcp.tools :as mcp.tools]
   ;; Load tool namespaces
   [metabase-enterprise.mcp.tools.execution]
   [metabase-enterprise.mcp.tools.schema-discovery]
   [metabase-enterprise.mcp.tools.transforms]
   [metabase-enterprise.mcp.tools.workspace]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- mcp-call [method params]
  (mcp.server/handle-request
   mcp.tools/global-registry
   {:jsonrpc "2.0" :id 1 :method method :params params}))

(deftest full-lifecycle-test
  (mt/with-premium-features #{:agent-api :workspaces}
    (testing "1. Initialize"
      (let [resp (mcp-call "initialize" {})]
        (is (= "metabase-mcp" (get-in resp ["result" "serverInfo" "name"])))))

    (testing "2. List tools"
      (let [resp  (mcp-call "tools/list" {})
            tools (get-in resp ["result" "tools"])]
        (is (>= (count tools) 10))
        (is (some #(= "create_workspace" (get % "name")) tools))
        (is (some #(= "search" (get % "name")) tools))
        (is (some #(= "run_transforms" (get % "name")) tools))
        (is (some #(= "merge_workspace" (get % "name")) tools))))))
