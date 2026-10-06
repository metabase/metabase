(ns metabase-enterprise.remote-sync.settings-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.guards :as guards]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source.git :as git]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.settings.core :as setting]
   [metabase.test :as mt])
  (:import
   (java.io File)
   (org.apache.commons.io FileUtils)
   (org.eclipse.jgit.api Git)))

(set! *warn-on-reflection* true)

(deftest check-and-update-remote-settings
  (let [full-token "full_token_value"
        other-token "other_token_value"
        obfuscated-token (setting/obfuscate-value full-token)
        default-settings
        {:remote-sync-url     "file://my/url.git"
         :remote-sync-type    :read-only
         :remote-sync-branch  "test-branch"
         :remote-sync-token   nil}]
    (mt/with-dynamic-fn-redefs [settings/check-git-settings! (fn [{:keys [remote-sync-token]}]
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
      (mt/with-dynamic-fn-redefs [settings/check-git-settings! (fn [_]
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
      (mt/with-dynamic-fn-redefs [settings/check-git-settings! (fn [_]
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
    (mt/with-dynamic-fn-redefs [git/branches (fn [_] ["main"])]
      (is (some? (settings/check-git-settings! {:remote-sync-url   "https://gitlab.com/foo/bar.git"
                                                :remote-sync-token nil
                                                :remote-sync-branch "main"
                                                :remote-sync-type  :read-only}))
          "GitLab HTTPS URLs should be accepted")
      (is (some? (settings/check-git-settings! {:remote-sync-url   "https://bitbucket.org/foo/bar.git"
                                                :remote-sync-token nil
                                                :remote-sync-branch "main"
                                                :remote-sync-type  :read-only}))
          "Bitbucket HTTPS URLs should be accepted")
      (is (some? (settings/check-git-settings! {:remote-sync-url   "https://dev.azure.com/org/project/_git/repo"
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

(deftest deactivate-clears-remote-sync-with-blank-url-test
  (testing "Setting a blank remote-sync-url clears all git settings and disables remote sync"
    (mt/with-dynamic-fn-redefs [settings/check-git-settings! (constantly true)]
      (mt/with-temporary-setting-values [:remote-sync-url    "file://my/repo.git"
                                         :remote-sync-token  "secret-token"
                                         :remote-sync-branch "main"
                                         :remote-sync-type   :read-write]
        (is (true? (settings/remote-sync-enabled)))
        (settings/check-and-update-remote-settings! {:remote-sync-url ""})
        (is (false? (settings/remote-sync-enabled)))
        (is (nil? (settings/remote-sync-url)))
        (is (nil? (settings/remote-sync-token)))
        (is (nil? (settings/remote-sync-branch)))))))

;;; ------------------------------------------------- Root Collection Remote Sync -------------------------------------------------

(deftest check-and-update-remote-settings-env-var-aware-test
  (testing "Settings sourced from env vars are not overwritten by check-and-update-remote-settings!"
    (mt/with-dynamic-fn-redefs [settings/check-git-settings! (constantly true)]
      (mt/with-temp-env-var-value! [mb-remote-sync-url "file://env/url.git"
                                    mb-remote-sync-token "env-token"
                                    mb-remote-sync-branch "env-branch"]
        (testing "Updating URL, token, and branch via API has no effect when sourced from env"
          (settings/check-and-update-remote-settings!
           {:remote-sync-url    "file://api/url.git"
            :remote-sync-token  "api-token"
            :remote-sync-branch "api-branch"
            :remote-sync-type   :read-only})
          (is (= "file://env/url.git" (settings/remote-sync-url)))
          (is (= "env-token" (settings/remote-sync-token)))
          (is (= "env-branch" (settings/remote-sync-branch))))
        (testing "Clearing URL (blank) does not wipe env-backed URL/token/branch"
          (settings/check-and-update-remote-settings! {:remote-sync-url ""})
          (is (= "file://env/url.git" (settings/remote-sync-url)))
          (is (= "env-token" (settings/remote-sync-token)))
          (is (= "env-branch" (settings/remote-sync-branch)))))))
  (testing "Non-env-sourced settings are still updated normally"
    (mt/with-dynamic-fn-redefs [settings/check-git-settings! (constantly true)]
      (mt/with-temporary-setting-values [:remote-sync-url nil
                                         :remote-sync-token nil
                                         :remote-sync-branch nil
                                         :remote-sync-type nil]
        (settings/check-and-update-remote-settings!
         {:remote-sync-url    "file://api/url.git"
          :remote-sync-token  "api-token"
          :remote-sync-branch "api-branch"
          :remote-sync-type   :read-only})
        (is (= "file://api/url.git" (settings/remote-sync-url)))
        (is (= "api-token" (settings/remote-sync-token)))
        (is (= "api-branch" (settings/remote-sync-branch)))))))

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

;; ---------- Guard contract for settings mutations -----------------------------------------------
;;
;; check-and-update-remote-settings! consults `guards/task-running?` and refuses if a task is
;; in flight.

(deftest check-and-update-remote-settings!-refuses-while-task-running-test
  (testing "check-and-update-remote-settings! must refuse when guards/task-running? returns true,
            without changing any settings or calling git"
    (let [check-git-call-count (atom 0)]
      (mt/with-dynamic-fn-redefs [guards/task-running?         (constantly true)
                                  settings/check-git-settings! (fn [_] (swap! check-git-call-count inc) true)]
        (mt/with-temporary-setting-values [:remote-sync-url    "file://my/repo.git"
                                           :remote-sync-token  nil
                                           :remote-sync-type   :read-only
                                           :remote-sync-branch "main"]
          (is (thrown-with-msg? Exception #"Remote sync task in progress"
                                (settings/check-and-update-remote-settings!
                                 {:remote-sync-url    "file://different.git"
                                  :remote-sync-type   :read-only
                                  :remote-sync-branch "feature-x"
                                  :remote-sync-token  nil})))
          (is (= "file://my/repo.git" (settings/remote-sync-url))
              "remote-sync-url must remain unchanged when the guard fires")
          (is (= "main" (settings/remote-sync-branch))
              "remote-sync-branch must remain unchanged when the guard fires")
          (is (zero? @check-git-call-count)
              "check-git-settings! must not be called when the guard fires"))))))

(deftest check-git-settings-does-not-clone-test
  (testing "validating git settings lists the remote's branches without cloning it"
    (mt/with-temp-dir [remote-dir nil]
      (let [url                (test-helpers/init-local-git-remote! remote-dir :branches ["develop"])
            ^File clone-dir    (#'git/repo-path {:remote-url url})
            check!             (fn [branch]
                                 (settings/check-git-settings! {:remote-sync-url    url
                                                                :remote-sync-token  nil
                                                                :remote-sync-branch branch
                                                                :remote-sync-type   :read-only}))]
        (is (not (.exists clone-dir)) "Precondition: no local clone yet")
        (is (some? (check! "develop")))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid branch name" (check! "nope")))
        (is (not (.exists clone-dir)) "Checking settings must not clone the repository")))))

(deftest check-git-settings-rejects-empty-repository-test
  (testing "An uninitialized remote (no branches) is still rejected, as it was when the check cloned"
    (mt/with-temp-dir [remote-dir nil]
      (let [url (test-helpers/init-local-git-remote! remote-dir :empty? true)]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot connect to uninitialized repository"
                              (settings/check-git-settings! {:remote-sync-url   url
                                                             :remote-sync-token nil})))))))

(defn- init-no-head-remote!
  "Creates a git repo in `dir` that has only the `branches` (default: main), and whose HEAD names the missing branch
  master. Returns its file:// URL. A bare repository that `git init --bare` makes with the initial branch master,
  followed by a push of other branches only, is in this state."
  [^String dir & {:keys [branches] :or {branches ["main"]}}]
  (let [url (test-helpers/init-local-git-remote! dir :branches branches)]
    (with-open [remote-git (Git/open (io/file dir))]
      (let [remote-repo (.getRepository remote-git)
            link-head!  (fn [^String target] (.link (.updateRef remote-repo "HEAD") target))]
        (link-head! (str "refs/heads/" (first branches)))
        (-> (.updateRef remote-repo "refs/heads/master") (doto (.setForceUpdate true)) (.delete))
        (link-head! "refs/heads/master")
        (is (nil? (.resolve remote-repo "HEAD")) "Precondition: the remote HEAD resolves to no commit")))
    (is (= (sort branches) (git/branches {:remote-url url})) "Precondition: the remote has only the given branches")
    url))

(defn- forget-clone!
  "Closes and removes the cached Git instance of `url` and deletes its clone directory, so that a test leaves no
  clone."
  [url]
  (let [^File path (#'git/repo-path {:remote-url url})]
    (some-> ^Git (get @@#'git/jgit (.getPath path)) .close)
    (swap! @#'git/jgit dissoc (.getPath path))
    (FileUtils/deleteQuietly path)))

(deftest check-git-settings-accepts-only-cloneable-remote-without-head-test
  (testing "a remote whose HEAD names a missing branch is either rejected by the check or can be cloned"
    (mt/with-temp-dir [remote-dir nil]
      (let [url (init-no-head-remote! remote-dir)]
        (try
          (let [accepted?   (try
                              (settings/check-git-settings! {:remote-sync-url    url
                                                             :remote-sync-token  nil
                                                             :remote-sync-branch "main"
                                                             :remote-sync-type   :read-write})
                              true
                              (catch clojure.lang.ExceptionInfo _ false))
                clone-error (when accepted?
                              (try
                                (git/git-source url "main" nil nil)
                                nil
                                (catch Exception e (ex-message e))))]
            (is (nil? clone-error) "A remote that the settings check accepts can be cloned"))
          (finally
            (forget-clone! url)))))))

(deftest blank-branch-read-only-save-of-remote-without-head-test
  (testing "a read-only save with a blank branch of a remote whose HEAD names a missing branch succeeds, and the setup
            fills in the branch that a clone of the remote gets"
    (mt/with-temp-dir [remote-dir nil]
      ;; With several branches, the test shows which branch the setup picks, not only that it picks one.
      (let [url (init-no-head-remote! remote-dir :branches ["zeta" "alpha" "main"])]
        (try
          (mt/with-temporary-setting-values [remote-sync-url    nil
                                             remote-sync-branch nil
                                             remote-sync-type   nil
                                             remote-sync-token  nil]
            (is (nil? (try
                        (settings/check-and-update-remote-settings! {:remote-sync-url    url
                                                                     :remote-sync-token  nil
                                                                     :remote-sync-branch ""
                                                                     :remote-sync-type   :read-only})
                        nil
                        (catch Exception e (ex-message e))))
                "The check accepts the remote")
            (is (nil? (try
                        (mt/with-dynamic-fn-redefs [impl/async-import! (constantly {:id 1})]
                          (impl/finish-remote-config!))
                        nil
                        (catch Exception e (ex-message e))))
                "The setup does not fail")
            (is (= "alpha" (settings/remote-sync-branch)) "The setup fills in the first branch of the remote")
            (is (= "refs/heads/alpha" (.getFullBranch (.getRepository ^Git (:git (git/git-source url "alpha" nil nil)))))
                "A clone of the remote gets the same branch"))
          (finally
            (forget-clone! url)))))))

(deftest settings-save-rejects-wrong-token-with-cached-clone-test
  (testing "a read-write settings save with a wrong token fails even when this process already holds a clone of the URL"
    ;; The clone directory does not depend on the token, so a cached clone must never stand in for authenticating
    ;; the new token. A file:// remote checks no credentials, so the remote command seam rejects any other token.
    (mt/with-temp-dir [remote-dir nil]
      (let [url                 (test-helpers/init-local-git-remote! remote-dir)
            ^File clone-dir     (#'git/repo-path {:remote-url url})
            good-token          "good-token"
            call-remote-command (mt/original-fn #'git/call-remote-command)]
        (mt/with-dynamic-fn-redefs [git/call-remote-command (fn [command {:keys [token] :as args}]
                                                              (when-not (= good-token token)
                                                                (throw (ex-info "Authentication failed" {:token token})))
                                                              (call-remote-command command args))]
          (try
            (git/git-source url "master" good-token nil)
            (is (contains? @@#'git/jgit (.getPath clone-dir))
                "Precondition: this process holds a clone of the URL")
            (mt/with-temporary-setting-values [:remote-sync-url    nil
                                               :remote-sync-token  nil
                                               :remote-sync-type   nil
                                               :remote-sync-branch nil]
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Authentication failed"
                                    (settings/check-and-update-remote-settings! {:remote-sync-url    url
                                                                                 :remote-sync-token  "wrong-token"
                                                                                 :remote-sync-type   :read-write
                                                                                 :remote-sync-branch ""})))
              (is (nil? (settings/remote-sync-url)) "The rejected settings are not saved")
              (is (nil? (settings/remote-sync-token)) "The rejected token is not saved"))
            (finally
              (forget-clone! url))))
        (testing "the test leaves no clone directory and no cached Git instance for the URL"
          (is (not (.exists clone-dir)))
          (is (not (contains? @@#'git/jgit (.getPath clone-dir)))))))))

(deftest blank-branch-save-asks-the-remote-once-test
  (testing "a settings save with a blank branch asks the remote one time, and saves the default branch of the remote"
    (mt/with-premium-features #{:remote-sync}
      (mt/with-temp-dir [remote-dir nil]
        ;; The default branch (HEAD, master) is not the first branch, so the test shows that the save reads HEAD.
        (let [url                 (test-helpers/init-local-git-remote! remote-dir :branches ["alpha" "develop"])
              commands            (atom [])
              call-remote-command (mt/original-fn #'git/call-remote-command)]
          (mt/with-temporary-setting-values [remote-sync-url    nil
                                             remote-sync-token  nil
                                             remote-sync-type   nil
                                             remote-sync-branch nil]
            (mt/with-dynamic-fn-redefs [git/call-remote-command (fn [command args]
                                                                  (swap! commands conj (.getSimpleName (class command)))
                                                                  (call-remote-command command args))]
              (is (= {:success true}
                     (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                           {:remote-sync-url    url
                                            :remote-sync-token  nil
                                            :remote-sync-type   :read-write
                                            :remote-sync-branch ""}))))
            (is (= {"LsRemoteCommand" 1} (frequencies @commands))
                "One lsRemote answers both the settings check and the default branch")
            (is (= "master" (settings/remote-sync-branch)) "The save stores the default branch of the remote")))))))

(deftest blank-branch-save-of-remote-without-default-branch-saves-nothing-test
  (testing "a save with a blank branch of a remote whose HEAD is detached (so it has no default branch) fails, and
            saves no setting"
    (mt/with-temp-dir [remote-dir nil]
      (let [url (test-helpers/init-local-git-remote! remote-dir :branches ["alpha"])]
        (with-open [remote-git (Git/open (io/file remote-dir))]
          (let [remote-repo (.getRepository remote-git)]
            (doto (.updateRef remote-repo "HEAD" true)
              (.setNewObjectId (.resolve remote-repo "master"))
              (.forceUpdate))))
        (mt/with-temporary-setting-values [remote-sync-url    nil
                                           remote-sync-token  nil
                                           remote-sync-type   nil
                                           remote-sync-branch nil]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Failed to get a default branch"
                                (settings/check-and-update-remote-settings! {:remote-sync-url    url
                                                                             :remote-sync-token  nil
                                                                             :remote-sync-type   :read-write
                                                                             :remote-sync-branch ""})))
          (is (nil? (settings/remote-sync-url)) "The rejected settings are not saved")
          (is (nil? (settings/remote-sync-branch))))))))
