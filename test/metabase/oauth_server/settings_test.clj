(ns metabase.oauth-server.settings-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.oauth-server.settings :as oauth-settings]
   [metabase.test :as mt]))

(deftest settings-work-without-feature-flag-test
  (testing "oauth-server settings work without any premium feature flag"
    (mt/with-temporary-setting-values [oauth-server-signing-key nil]
      (is (nil? (oauth-settings/oauth-server-signing-key)))
      (oauth-settings/oauth-server-signing-key! "test-key")
      (is (= "test-key" (oauth-settings/oauth-server-signing-key))))))
