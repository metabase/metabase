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
