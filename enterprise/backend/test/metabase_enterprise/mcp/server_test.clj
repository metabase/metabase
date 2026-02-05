(ns metabase-enterprise.mcp.server-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.mcp.server :as mcp.server]
   [metabase-enterprise.mcp.tools :as mcp.tools]))

(deftest parse-jsonrpc-request-test
  (testing "valid request"
    (is (= {:jsonrpc "2.0" :id 1 :method "initialize" :params {}}
           (mcp.server/parse-request {"jsonrpc" "2.0" "id" 1 "method" "initialize" "params" {}}))))
  (testing "missing jsonrpc version"
    (is (= {:error {:code -32600 :message "Invalid Request: missing or invalid jsonrpc version"}}
           (mcp.server/parse-request {"id" 1 "method" "initialize"}))))
  (testing "missing method"
    (is (= {:error {:code -32600 :message "Invalid Request: missing method"}}
           (mcp.server/parse-request {"jsonrpc" "2.0" "id" 1})))))

(deftest format-jsonrpc-response-test
  (testing "success response"
    (is (= {"jsonrpc" "2.0" "id" 1 "result" {"key" "value"}}
           (mcp.server/success-response 1 {"key" "value"}))))
  (testing "error response"
    (is (= {"jsonrpc" "2.0" "id" 1 "error" {"code" -32600 "message" "bad request"}}
           (mcp.server/error-response 1 -32600 "bad request")))))

(deftest handle-request-test
  (let [registry (atom {})]
    (mcp.tools/register-tool! registry
                              {:name        "ping"
                               :description "Ping"
                               :input-schema {:type "object" :properties {}}
                               :handler     (fn [_] {:content [{:type "text" :text "pong"}]})})

    (testing "initialize returns server info and capabilities"
      (let [resp (mcp.server/handle-request registry
                                            {:jsonrpc "2.0" :id 1 :method "initialize" :params {}})]
        (is (= "2.0" (get resp "jsonrpc")))
        (is (= 1 (get resp "id")))
        (is (contains? (get resp "result") "serverInfo"))
        (is (contains? (get resp "result") "capabilities"))))

    (testing "tools/list returns registered tools"
      (let [resp (mcp.server/handle-request registry
                                            {:jsonrpc "2.0" :id 2 :method "tools/list" :params {}})]
        (is (= 1 (count (get-in resp ["result" "tools"]))))))

    (testing "tools/call executes tool"
      (let [resp (mcp.server/handle-request registry
                                            {:jsonrpc "2.0" :id 3 :method "tools/call"
                                             :params {"name" "ping" "arguments" {}}})]
        (is (= [{"type" "text" "text" "pong"}]
               (get-in resp ["result" "content"])))))

    (testing "unknown method returns error"
      (let [resp (mcp.server/handle-request registry
                                            {:jsonrpc "2.0" :id 4 :method "unknown/method" :params {}})]
        (is (= -32601 (get-in resp ["error" "code"])))))))
