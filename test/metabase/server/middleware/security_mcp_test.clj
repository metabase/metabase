(ns metabase.server.middleware.security-mcp-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.server.middleware.security :as mw.security]
   [metabase.test :as mt]))

(defn- get-cors-origin-header
  "Returns the Access-Control-Allow-Origin header value for a given request origin."
  [request-origin]
  (let [wrapped-handler (mw.security/add-security-headers
                         (fn [_request respond _raise]
                           (respond {:status 200 :headers {} :body "ok"})))
        response (wrapped-handler {:headers {"origin" request-origin}
                                   :uri "/api/dashboard/1"}
                                  identity identity)]
    (get-in response [:headers "Access-Control-Allow-Origin"])))

(defn- assert-cors-allowed!
  "Asserts that the given origin is allowed (header echoes the origin back)."
  [origin]
  (is (= origin (get-cors-origin-header origin))))

(defn- assert-cors-blocked!
  "Asserts that the given origin is blocked (no Access-Control-Allow-Origin header)."
  [origin]
  (is (nil? (get-cors-origin-header origin))))

(deftest test-mcp-common-cors-origins
  (testing "Claude sandbox origins should be allowed when claude is enabled"
    (mt/with-temporary-setting-values [mcp-apps-cors-enabled-clients ["claude"]]
      (assert-cors-allowed! "https://abc.claudemcpcontent.com")))

  (testing "ChatGPT sandbox origins should be allowed when chatgpt is enabled"
    (mt/with-temporary-setting-values [mcp-apps-cors-enabled-clients ["chatgpt"]]
      (assert-cors-allowed! "https://abc.web-sandbox.oaiusercontent.com")))

  (testing "Claude sandbox origins should NOT be allowed when only chatgpt is enabled"
    (mt/with-temporary-setting-values [mcp-apps-cors-enabled-clients ["chatgpt"]]
      (assert-cors-blocked! "https://abc.claudemcpcontent.com")))

  (testing "Multiple MCP clients can be enabled simultaneously"
    (mt/with-temporary-setting-values [mcp-apps-cors-enabled-clients ["claude" "chatgpt"]]
      (assert-cors-allowed! "https://abc.claudemcpcontent.com")
      (assert-cors-allowed! "https://xyz.web-sandbox.oaiusercontent.com"))))

(deftest test-mcp-vscode-webview-origin
  (testing "vscode-webview:// origins should be allowed when vscode is enabled"
    (mt/with-temporary-setting-values [mcp-apps-cors-enabled-clients ["cursor-vscode"]]
      (assert-cors-allowed! "vscode-webview://abc123")))

  (testing "vscode-webview:// origins should NOT be allowed when vscode is not enabled"
    (mt/with-temporary-setting-values [mcp-apps-cors-enabled-clients ["claude"]]
      (assert-cors-blocked! "vscode-webview://abc123"))))

(deftest test-mcp-custom-cors-origins
  (testing "Custom MCP origins should be allowed"
    (mt/with-temporary-setting-values [mcp-apps-cors-custom-origins "https://my-librechat.example.com"]
      (assert-cors-allowed! "https://my-librechat.example.com")))

  (testing "Custom MCP origins should work alongside common MCP origins"
    (mt/with-temporary-setting-values [mcp-apps-cors-enabled-clients  ["claude"]
                                       mcp-apps-cors-custom-origins "https://my-librechat.example.com"]
      (assert-cors-allowed! "https://abc.claudemcpcontent.com")
      (assert-cors-allowed! "https://my-librechat.example.com"))))

(deftest test-mcp-cors-merged-with-embedding
  (testing "MCP origins and embedding origins should both work"
    (mt/with-temporary-setting-values [mcp-apps-cors-enabled-clients  ["claude"]
                                       embedding-app-origins-sdk "https://my-app.example.com"]
      (assert-cors-allowed! "https://my-app.example.com")
      (assert-cors-allowed! "https://abc.claudemcpcontent.com"))))

(deftest test-mcp-settings-helper
  (testing "mcp-apps-cors-origins returns space-separated origins for enabled clients"
    (mt/with-temporary-setting-values [mcp-apps-cors-enabled-clients ["claude" "chatgpt"]]
      (let [origins (mcp.settings/mcp-apps-cors-origins)]
        (is (str/includes? origins "*.claudemcpcontent.com"))
        (is (str/includes? origins "*.web-sandbox.oaiusercontent.com")))))

  (testing "mcp-apps-cors-origins includes custom origins"
    (mt/with-temporary-setting-values [mcp-apps-cors-enabled-clients  ["claude"]
                                       mcp-apps-cors-custom-origins "https://custom.example.com"]
      (let [origins (mcp.settings/mcp-apps-cors-origins)]
        (is (str/includes? origins "*.claudemcpcontent.com"))
        (is (str/includes? origins "https://custom.example.com")))))

  (testing "mcp-apps-cors-origins returns empty string when nothing is configured"
    (mt/with-temporary-setting-values [mcp-apps-cors-enabled-clients  []
                                       mcp-apps-cors-custom-origins ""]
      (is (= "" (mcp.settings/mcp-apps-cors-origins))))))
