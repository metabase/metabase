(ns metabase-enterprise.remote-sync.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source.git :as git]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]))

(deftest check-and-update-remote-settings
  (let [full-token "full_token_value"
        other-token "other_token_value"
        obfuscated-token (setting/obfuscate-value full-token)
        default-settings
        {:remote-sync-url     "file://my/url.git"
         :remote-sync-type    :read-only
         :remote-sync-branch  "test-branch"
         :remote-sync-token   nil}]
    (with-redefs [settings/check-git-settings! (fn [{:keys [remote-sync-token]}]
                                                 ;; git should always be checked with a nil or full token
                                                 (is (or (nil? remote-sync-token) (#{full-token other-token} remote-sync-token)))
                                                 true)]
      (mt/with-temporary-setting-values [:remote-sync-token nil
                                         :remote-sync-url nil
                                         :remote-sync-type nil
                                         :remote-sync-branch nil]
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
          (is (= nil (settings/remote-sync-token))))))))

(deftest check-and-update-remote-settings-partial-updates
  (testing "Partial updates for non-git settings do not trigger git validation"
    (let [git-check-called? (atom false)]
      (with-redefs [settings/check-git-settings! (fn [_]
                                                   (reset! git-check-called? true)
                                                   true)]
        (mt/with-temporary-setting-values [:remote-sync-transforms false
                                           :remote-sync-auto-import false]
          (testing "Updating only remote-sync-transforms does not check git settings"
            (reset! git-check-called? false)
            (settings/check-and-update-remote-settings! {:remote-sync-transforms true})
            (is (false? @git-check-called?) "Git validation should not be called for transforms-only update")
            (is (true? (settings/remote-sync-transforms))))

          (testing "Updating only remote-sync-auto-import does not check git settings"
            (reset! git-check-called? false)
            (settings/check-and-update-remote-settings! {:remote-sync-auto-import true})
            (is (false? @git-check-called?) "Git validation should not be called for auto-import-only update")
            (is (true? (settings/remote-sync-auto-import))))

          (testing "Updating both non-git settings does not check git settings"
            (reset! git-check-called? false)
            (settings/check-and-update-remote-settings! {:remote-sync-transforms false
                                                         :remote-sync-auto-import false})
            (is (false? @git-check-called?) "Git validation should not be called for non-git settings")
            (is (false? (settings/remote-sync-transforms)))
            (is (false? (settings/remote-sync-auto-import))))))))

  (testing "Partial updates with git-related settings do trigger git validation"
    (let [git-check-called? (atom false)]
      (with-redefs [settings/check-git-settings! (fn [_]
                                                   (reset! git-check-called? true)
                                                   true)]
        (mt/with-temporary-setting-values [:remote-sync-url "file://my/url.git"
                                           :remote-sync-type :read-only
                                           :remote-sync-branch "main"]
          (testing "Updating remote-sync-type triggers git validation"
            (reset! git-check-called? false)
            (settings/check-and-update-remote-settings! {:remote-sync-type :read-write})
            (is (true? @git-check-called?) "Git validation should be called when updating type")
            (is (= :read-write (settings/remote-sync-type))))

          (testing "Updating remote-sync-branch triggers git validation"
            (reset! git-check-called? false)
            (settings/check-and-update-remote-settings! {:remote-sync-branch "develop"})
            (is (true? @git-check-called?) "Git validation should be called when updating branch")
            (is (= "develop" (settings/remote-sync-branch)))))))))

(deftest check-git-settings-rejects-non-https-urls
  (testing "git:// URLs are rejected with a helpful error message"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Invalid repository URL: only HTTPS URLs are supported"
                          (settings/check-git-settings! {:remote-sync-url   "git://github.com/foo/bar.git"
                                                         :remote-sync-token nil
                                                         :remote-sync-branch "main"
                                                         :remote-sync-type  :read-only}))))
  (testing "ssh:// URLs are rejected with a helpful error message"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Invalid repository URL: only HTTPS URLs are supported"
                          (settings/check-git-settings! {:remote-sync-url   "ssh://git@github.com/foo/bar.git"
                                                         :remote-sync-token nil
                                                         :remote-sync-branch "main"
                                                         :remote-sync-type  :read-only}))))
  (testing "Non-GitHub HTTPS URLs are accepted"
    (with-redefs [git/git-source (fn [& _] nil)
                  git/branches   (fn [_] ["main"])]
      (is (nil? (settings/check-git-settings! {:remote-sync-url   "https://gitlab.com/foo/bar.git"
                                               :remote-sync-token nil
                                               :remote-sync-branch "main"
                                               :remote-sync-type  :read-only}))
          "GitLab HTTPS URLs should be accepted")
      (is (nil? (settings/check-git-settings! {:remote-sync-url   "https://bitbucket.org/foo/bar.git"
                                               :remote-sync-token nil
                                               :remote-sync-branch "main"
                                               :remote-sync-type  :read-only}))
          "Bitbucket HTTPS URLs should be accepted")
      (is (nil? (settings/check-git-settings! {:remote-sync-url   "https://dev.azure.com/org/project/_git/repo"
                                               :remote-sync-token nil
                                               :remote-sync-branch "main"
                                               :remote-sync-type  :read-only}))
          "Azure DevOps HTTPS URLs should be accepted"))))

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
