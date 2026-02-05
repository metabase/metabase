(ns metabase-enterprise.mcp.tools.urls-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.mcp.tools :as mcp.tools]
   [metabase-enterprise.mcp.tools.urls]))

(deftest get-entity-url-tool-registered-test
  (testing "get_entity_url tool is in the global registry"
    (is (contains? @mcp.tools/global-registry "get_entity_url"))))
