(ns metabase.oauth-server.settings-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.oauth-server.settings :as oauth-settings]
   [metabase.test :as mt]))

(deftest settings-work-without-feature-flag-test
  (testing "oauth-server settings work without any premium feature flag"
    (mt/with-temporary-setting-values [oauth-server-access-token-ttl 3600]
      (is (= 3600 (oauth-settings/oauth-server-access-token-ttl)))
      (oauth-settings/oauth-server-access-token-ttl! 7200)
      (is (= 7200 (oauth-settings/oauth-server-access-token-ttl))))))

(deftest refresh-token-ttl-setting-test
  (testing "oauth-server-refresh-token-ttl defaults to 30 days and can be changed"
    (mt/with-temporary-setting-values [oauth-server-refresh-token-ttl 2592000]
      (is (= 2592000 (oauth-settings/oauth-server-refresh-token-ttl)))
      (oauth-settings/oauth-server-refresh-token-ttl! 86400)
      (is (= 86400 (oauth-settings/oauth-server-refresh-token-ttl))))))

(deftest dynamic-registration-tracks-mcp-test
  (testing "oauth-server-dynamic-registration-enabled is AND-composed with mcp-enabled?"
    (testing "MCP off, override true → false (MCP gate wins)"
      (mt/with-temporary-setting-values [mcp-enabled?                              false
                                         oauth-server-dynamic-registration-enabled true]
        (is (false? (oauth-settings/oauth-server-dynamic-registration-enabled)))))
    (testing "MCP off, override false → false"
      (mt/with-temporary-setting-values [mcp-enabled?                              false
                                         oauth-server-dynamic-registration-enabled false]
        (is (false? (oauth-settings/oauth-server-dynamic-registration-enabled)))))
    (testing "MCP on, override true → true"
      (mt/with-temporary-setting-values [mcp-enabled?                              true
                                         oauth-server-dynamic-registration-enabled true]
        (is (true? (oauth-settings/oauth-server-dynamic-registration-enabled)))))
    (testing "MCP on, override false → false (lockdown override preserved)"
      (mt/with-temporary-setting-values [mcp-enabled?                              true
                                         oauth-server-dynamic-registration-enabled false]
        (is (false? (oauth-settings/oauth-server-dynamic-registration-enabled)))))))
