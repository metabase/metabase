(ns metabase-enterprise.mcp.tools.transforms-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.mcp.tools :as mcp.tools]
   [metabase-enterprise.mcp.tools.transforms]))

(deftest transform-tools-registered-test
  (testing "transform tools are in the global registry"
    (is (contains? @mcp.tools/global-registry "create_transforms"))
    (is (contains? @mcp.tools/global-registry "list_transforms"))
    (is (contains? @mcp.tools/global-registry "get_transform"))
    (is (contains? @mcp.tools/global-registry "delete_transform"))))
