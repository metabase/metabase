(ns metabase-enterprise.remote-sync.settings-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.remote-sync.settings :as settings]
            [metabase.settings.core :as setting]
            [metabase.test :as mt]))

(deftest check-and-update-remote-settings
  (let [full-token "full_token_value"
        other-token "other_token_value"
        obfuscated-token (setting/obfuscate-value full-token)
        default-settings
        {:remote-sync-url     "file://my/url.git"
         :remote-sync-type    :production
         :remote-sync-branch  "test-branch"
         :remote-sync-enabled "true"
         :remote-sync-token   nil}]
    (with-redefs [settings/check-git-settings (fn [{:keys [remote-sync-token]}]
                                                ;; git should always be checked with a nil or full token
                                                (is (or (nil? remote-sync-token) (#{full-token other-token} remote-sync-token)))
                                                true)]
      (mt/with-temporary-setting-values [:remote-sync-token nil
                                         :remote-sync-url nil
                                         :remote-sync-type nil
                                         :remote-sync-branch nil
                                         :remote-sync-enabled nil]
        (testing "Allows setting with no token"
          (settings/check-and-update-remote-settings! (assoc default-settings :remote-sync-token nil))
          (is (= "file://my/url.git" (settings/remote-sync-url)))
          (is (= :production (settings/remote-sync-type)))
          (is (= "test-branch" (settings/remote-sync-branch)))
          (is (true? (settings/remote-sync-enabled)))
          (is (= nil (settings/remote-sync-token))))
        (testing "Updating with a full token saves it"
          (settings/check-and-update-remote-settings! (assoc default-settings :remote-sync-token full-token))
          (is (= full-token (settings/remote-sync-token))))
        (testing "Updating with an obfuscated token does not update it"
          (settings/check-and-update-remote-settings! (assoc default-settings :remote-sync-token obfuscated-token))
          (is (= full-token (settings/remote-sync-token))))
        (testing "Updating with nil token does not change it (the UI doesn't send the token back if it doesn't change)"
          (settings/check-and-update-remote-settings! (assoc default-settings :remote-sync-token nil))
          (is (= full-token (settings/remote-sync-token))))
        (testing "Updating with a different full token saves it"
          (settings/check-and-update-remote-settings! (assoc default-settings :remote-sync-token other-token))
          (is (= other-token (settings/remote-sync-token))))))))

(deftest cannot-set-remote-sync-type-to-invalid-value)
(mt/with-temporary-setting-values [:remote-sync-type :production]
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"Remote-sync-type set to an unsupported value"
                        (setting/set-value-of-type! :keyword :remote-sync-type :invalid-type))))
