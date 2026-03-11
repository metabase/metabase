(ns metabase-enterprise.oauth-server.settings-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.oauth-server.settings :as oauth-settings]
   [metabase.test :as mt]))

(deftest settings-gated-behind-feature-flag-test
  (testing "oauth-server settings are gated behind :metabot-v3 feature flag"
    (testing "getter returns nil without feature flag"
      (mt/with-premium-features #{}
        (is (nil? (oauth-settings/oauth-server-signing-key)))))
    (testing "setter throws without feature flag"
      (mt/with-premium-features #{}
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"metabot-v3"
             (oauth-settings/oauth-server-signing-key! "test-key")))))
    (testing "getter and setter work with feature flag"
      (mt/with-premium-features #{:metabot-v3}
        (mt/with-temporary-setting-values [oauth-server-signing-key nil]
          (is (nil? (oauth-settings/oauth-server-signing-key)))
          (oauth-settings/oauth-server-signing-key! "test-key")
          (is (= "test-key" (oauth-settings/oauth-server-signing-key))))))))
