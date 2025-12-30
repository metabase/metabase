(ns metabase-enterprise.remote-sync.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source.git :as git]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]))

(deftest check-and-update-remote-settings
  (let [full-token "full_token_value"
        other-token "other_token_value"
        obfuscated-token (setting/obfuscate-value full-token)
        default-settings
        {:remote-sync-url         "file://my/url.git"
         :remote-sync-type        :read-only
         :remote-sync-branch      "test-branch"
         :remote-sync-token       nil
         :remote-sync-auth-method :token
         :remote-sync-username    nil}]
    (with-redefs [settings/check-git-settings! (fn [{:keys [remote-sync-token]}]
                                                 ;; git should always be checked with a nil or full token
                                                 (is (or (nil? remote-sync-token) (#{full-token other-token} remote-sync-token)))
                                                 true)]
      (mt/with-temporary-setting-values [:remote-sync-token nil
                                         :remote-sync-url nil
                                         :remote-sync-type nil
                                         :remote-sync-branch nil
                                         :remote-sync-auth-method nil
                                         :remote-sync-username nil]
        (testing "Allows setting with no token"
          (settings/check-and-update-remote-settings! (assoc default-settings :remote-sync-token nil))
          (is (= "file://my/url.git" (settings/remote-sync-url)))
          (is (= :read-only (settings/remote-sync-type)))
          (is (= "test-branch" (settings/remote-sync-branch)))
          (is (true? (settings/remote-sync-enabled)))
          (is (= nil (settings/remote-sync-token))))
        (testing "Updating with a full token saves it"
          (settings/check-and-update-remote-settings! (assoc default-settings :remote-sync-token full-token))
          (is (= full-token (settings/remote-sync-token))))
        (testing "Updating with an obfuscated token does not update it"
          (settings/check-and-update-remote-settings! (assoc default-settings :remote-sync-token obfuscated-token))
          (is (= full-token (settings/remote-sync-token))))
        (testing "Updating with a different full token saves it"
          (settings/check-and-update-remote-settings! (assoc default-settings :remote-sync-token other-token))
          (is (= other-token (settings/remote-sync-token))))
        (testing "Updating with nil token clears it out"
          (settings/check-and-update-remote-settings! (assoc default-settings :remote-sync-token nil))
          (is (= nil (settings/remote-sync-token))))
        (testing "Auth method and username are saved"
          (settings/check-and-update-remote-settings! (assoc default-settings
                                                             :remote-sync-auth-method :basic
                                                             :remote-sync-username "my-user"))
          (is (= :basic (settings/remote-sync-auth-method)))
          (is (= "my-user" (settings/remote-sync-username))))))))

(deftest cannot-set-remote-sync-type-to-invalid-value
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"Remote-sync-type set to an unsupported value"
                        (settings/remote-sync-type! :invalid-type))))

(deftest remote-sync-enabled-test
  (mt/with-temporary-setting-values [:remote-sync-url nil]
    (is (false? (settings/remote-sync-enabled))))
  (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"]
    (is (true? (settings/remote-sync-enabled)))))

;;; ------------------------------------------------- Root Collection Remote Sync -------------------------------------------------

(deftest root-collection-is-not-remote-synced-test
  (testing "Root collection for shared-tenant-collection namespace is never remote-synced (individual children can be toggled)"
    (let [root-coll (collection.root/root-collection-with-ui-details :shared-tenant-collection)]
      (is (false? (:is_remote_synced root-coll)))))
  (testing "Root collection for default namespace is not remote-synced"
    (let [root-coll (collection.root/root-collection-with-ui-details nil)]
      (is (false? (:is_remote_synced root-coll)))))
  (testing "Root collection for snippets namespace is not remote-synced"
    (let [root-coll (collection.root/root-collection-with-ui-details :snippets)]
      (is (false? (:is_remote_synced root-coll))))))

;;; ------------------------------------------------- make-credentials tests -------------------------------------------------

(deftest make-credentials-test
  (testing ":token auth method returns token string directly"
    (is (= "my-token" (settings/make-credentials :token "my-token" nil)))
    (is (= "my-token" (settings/make-credentials :token "my-token" "ignored-username"))))

  (testing ":basic auth method returns map with username and password"
    (is (= {:username "my-user" :password "my-token"}
           (settings/make-credentials :basic "my-token" "my-user"))))

  (testing "default (unknown) auth method returns token directly"
    (is (= "my-token" (settings/make-credentials :unknown "my-token" "user")))))

;;; ------------------------------------------------- URL validation tests -------------------------------------------------

(deftest check-git-settings-url-validation-test
  (testing "Valid URL formats are accepted"
    (doseq [url ["file://my/local/repo.git"
                 "http://example.com/repo.git"
                 "https://example.com/repo.git"
                 "https://github.com/org/repo.git"
                 "https://gitlab.com/org/repo.git"
                 "https://bitbucket.org/org/repo.git"
                 "https://my-gitea-server.example.com/org/repo.git"
                 "https://self-hosted.internal/repo.git"
                 "my-repo"]]  ; no colon means it's treated as a path
      (testing (str "URL: " url)
        ;; We just verify it doesn't throw on URL validation
        ;; The actual git connection will fail but that's fine for this test
        (with-redefs [git/git-source
                      (fn [_url _branch _auth-method _credentials]
                        (reify source.p/Source
                          (branches [_] ["main"])
                          (default-branch [_] "main")))]
          (is (nil? (settings/check-git-settings! {:remote-sync-url url
                                                   :remote-sync-token nil
                                                   :remote-sync-auth-method :token
                                                   :remote-sync-username nil
                                                   :remote-sync-branch nil
                                                   :remote-sync-type :read-only})))))))

  (testing "Invalid URL formats are rejected"
    (doseq [url ["ftp://example.com/repo.git"
                 "ssh://git@example.com/repo.git"
                 "git@github.com:org/repo.git"]]
      (testing (str "URL: " url)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"Invalid Repository URL format"
                              (settings/check-git-settings! {:remote-sync-url url
                                                             :remote-sync-token nil
                                                             :remote-sync-auth-method :token
                                                             :remote-sync-username nil
                                                             :remote-sync-branch nil
                                                             :remote-sync-type :read-only})))))))
