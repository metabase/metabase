(ns metabase-enterprise.mcp.api-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.mcp.api :as mcp.api]
   [metabase.request.core :as request]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json])
  (:import
   (java.io ByteArrayInputStream)))

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- make-ring-request
  "Create a minimal Ring request map for the MCP endpoint."
  [body-map]
  {:body           (ByteArrayInputStream. (.getBytes (json/encode body-map) "UTF-8"))
   :headers        {"content-type" "application/json"}
   :request-method :post
   :uri            "/api/ee/mcp"})

(defn- call-mcp-handler
  "Call the MCP Ring handler directly (bypassing auth) with the given user and body."
  [user-kw body-map]
  (let [result  (promise)
        user-id (mt/user->id user-kw)]
    (request/with-current-user user-id
      (mcp.api/routes
       (assoc (make-ring-request body-map) :metabase-user-id user-id)
       (fn [response] (deliver result response))
       (fn [error] (deliver result {:error error}))))
    (let [resp (deref result 5000 {:error :timeout})]
      (when (:body resp)
        (json/decode (:body resp))))))

(deftest mcp-handler-initialize-test
  (mt/with-premium-features #{:agent-api}
    (testing "authenticated initialize returns server info"
      (let [resp (call-mcp-handler :crowberto {"jsonrpc" "2.0" "id" 1 "method" "initialize" "params" {}})]
        (is (contains? resp "result"))
        (is (= "metabase-mcp" (get-in resp ["result" "serverInfo" "name"])))))))

(deftest mcp-handler-tools-list-test
  (mt/with-premium-features #{:agent-api}
    (testing "tools/list returns available tools"
      (let [resp (call-mcp-handler :crowberto {"jsonrpc" "2.0" "id" 2 "method" "tools/list" "params" {}})]
        (is (vector? (get-in resp ["result" "tools"])))))))

(deftest mcp-handler-invalid-request-test
  (mt/with-premium-features #{:agent-api}
    (testing "invalid JSON-RPC returns error"
      (let [resp (call-mcp-handler :crowberto {"id" 1 "method" "initialize"})]
        (is (contains? resp "error"))
        (is (= -32600 (get-in resp ["error" "code"])))))))

(deftest mcp-handler-unknown-method-test
  (mt/with-premium-features #{:agent-api}
    (testing "unknown method returns -32601"
      (let [resp (call-mcp-handler :crowberto {"jsonrpc" "2.0" "id" 1 "method" "foo/bar" "params" {}})]
        (is (= -32601 (get-in resp ["error" "code"])))))))
