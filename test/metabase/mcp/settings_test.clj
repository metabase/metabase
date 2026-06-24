(ns metabase.mcp.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.test :as mt]))

(deftest mcp-apps-cors-custom-origins-path-validation-test
  (testing "Should reject an origin with a real path (#75839)"
    (mt/with-temporary-setting-values [mcp.settings/mcp-apps-cors-custom-origins ""]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"CORS origins must not include a path"
           (mcp.settings/mcp-apps-cors-custom-origins! "http://localhost:6274/sse")))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"CORS origins must not include a path"
           (mcp.settings/mcp-apps-cors-custom-origins! "http://localhost:6274 https://example.com/path")))
      (testing "the setting is left unchanged after a rejected save"
        (is (= "" (mcp.settings/mcp-apps-cors-custom-origins))))))
  (testing "Should accept a bare trailing slash"
    (mt/with-temporary-setting-values [mcp.settings/mcp-apps-cors-custom-origins ""]
      (mcp.settings/mcp-apps-cors-custom-origins! "http://localhost:6274/")
      (is (= "http://localhost:6274/" (mcp.settings/mcp-apps-cors-custom-origins)))))
  (testing "Should accept an origin with no path at all"
    (mt/with-temporary-setting-values [mcp.settings/mcp-apps-cors-custom-origins ""]
      (mcp.settings/mcp-apps-cors-custom-origins! "http://localhost:6274 electron://example.com")
      (is (= "http://localhost:6274 electron://example.com" (mcp.settings/mcp-apps-cors-custom-origins))))))
