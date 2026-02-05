(ns metabase-enterprise.mcp.tools-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.mcp.tools :as mcp.tools]))

(deftest tool-registry-test
  (testing "register and list tools"
    (let [registry (atom {})]
      (mcp.tools/register-tool! registry
                                {:name        "test_tool"
                                 :description "A test tool"
                                 :input-schema {:type "object"
                                                :properties {"name" {:type "string"}}
                                                :required ["name"]}
                                 :handler     (fn [params] {:content [{:type "text" :text (str "Hello " (get params "name"))}]})})
      (is (= 1 (count @registry)))
      (is (contains? @registry "test_tool"))))

  (testing "list-tools returns MCP tool format"
    (let [registry (atom {})]
      (mcp.tools/register-tool! registry
                                {:name        "my_tool"
                                 :description "Does things"
                                 :input-schema {:type "object" :properties {}}
                                 :handler     (fn [_] {:content [{:type "text" :text "ok"}]})})
      (let [tools (mcp.tools/list-tools registry)]
        (is (= [{"name"        "my_tool"
                 "description" "Does things"
                 "inputSchema" {:type "object" :properties {}}}]
               tools)))))

  (testing "call-tool executes handler"
    (let [registry (atom {})]
      (mcp.tools/register-tool! registry
                                {:name        "greet"
                                 :description "Greet someone"
                                 :input-schema {:type "object" :properties {"name" {:type "string"}}}
                                 :handler     (fn [params] {:content [{:type "text" :text (str "Hi " (get params "name"))}]})})
      (is (= {"content" [{"type" "text" "text" "Hi Alice"}]}
             (mcp.tools/call-tool registry "greet" {"name" "Alice"}))))))
