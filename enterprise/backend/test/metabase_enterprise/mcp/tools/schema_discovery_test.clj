(ns metabase-enterprise.mcp.tools.schema-discovery-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.mcp.tools :as mcp.tools]
   [metabase-enterprise.mcp.tools.schema-discovery]))

(deftest search-tool-registered-test
  (testing "search tool is in the global registry"
    (is (contains? @mcp.tools/global-registry "search"))))

(deftest get-table-details-tool-registered-test
  (testing "get_table_details tool is in the global registry"
    (is (contains? @mcp.tools/global-registry "get_table_details"))))
