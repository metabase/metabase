(ns metabase-enterprise.library-branching.repository-test
  "The repository settings of library branching: the save plan (pure, with its laws), Test Connection and the save on
  remotes on disk. The saves run as tasks and change the settings, so these tests are not parallel."
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.repository-test-util/with-remote clojure.core/fn}}}
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   ;; loads the settings of remote sync, which library branching reuses
   [metabase-enterprise.core.init]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.repository :as repository]
   [metabase-enterprise.library-branching.repository-test-util :as rtu :refer [with-remote with-settings]]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase-enterprise.library-branching.store.jgit :as store.jgit]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase-enterprise.library-branching.tasks-test-util :as tasks.tu]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
   [toucan2.core :as t2])
  (:import
   (org.eclipse.jgit.errors TransportException)
   (org.eclipse.jgit.internal JGitText)
   (org.eclipse.jgit.transport URIish)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def ^:private url-key :remote-sync-url)
(def ^:private token-key :remote-sync-token)
(def ^:private branch-key :remote-sync-branch)

;;; ---------------------------------------------------- Save plan ----------------------------------------------------

(def ^:private saved-gen
  (gen/hash-map :remote-sync-url         (gen/elements [nil "file:///saved" "https://git.example.com/a.git"])
                :remote-sync-token       (gen/elements [nil "token-one" "token-two"])
                :remote-sync-type        (gen/elements [:read-only :read-write])
                :remote-sync-branch      (gen/elements [nil "main" "dev"])
                :remote-sync-auto-import gen/boolean))

(def ^:private env-gen
  (gen/fmap set (gen/vector (gen/elements [:remote-sync-url :remote-sync-token :remote-sync-branch :remote-sync-type])
                            0 4)))

(defn- body-values-gen
  "The values that a form can send, for each key of `repository/setting-keys`, when the saved token is `token`."
  [token]
  (gen/hash-map :remote-sync-url         (gen/elements [nil "" "  " "file:///new" "https://git.example.com/b.git"])
                :remote-sync-token       (gen/elements [nil (setting/obfuscate-value token) "token-three" token])
                :remote-sync-type        (gen/elements [:read-only :read-write])
                :remote-sync-branch      (gen/elements [nil "" "main" "feature"])
                :remote-sync-auto-import gen/boolean))

(def ^:private save-case-gen
  "A save: the saved values, the keys that come from an environment variable, and a body of some of the keys."
  (gen/let [saved  saved-gen
            env    env-gen
            ks     (gen/vector-distinct (gen/elements repository/setting-keys) {:max-elements 5})
            values (body-values-gen (:remote-sync-token saved))]
    {:saved saved :env env :body (select-keys values ks)}))

(defn- turns-off? [body]
  (and (contains? body url-key) (str/blank? (get body url-key))))

(defn- obfuscated-token? [body saved]
  (and (contains? body token-key) (= (get body token-key) (setting/obfuscate-value (get saved token-key)))))

(defn- connection-after [after]
  {:url    (:remote-sync-url after)
   :token  (:remote-sync-token after)
   :branch (:remote-sync-branch after)
   :type   (:remote-sync-type after)})

(defn- save-plan-laws
  "`{law boolean}`: the laws of `repository/save-plan` for one save."
  [{:keys [saved env body]}]
  (let [{:keys [writes check default-branch?]} (repository/save-plan body saved env)
        after                                  (merge saved writes)
        again                                  (merge after (:writes (repository/save-plan body after env)))]
    {:no-env-key-written (empty? (select-keys writes env))
     :written-keys       (= (set (keys writes))
                            (set (remove env (if (turns-off? body)
                                               [url-key token-key branch-key]
                                               (cond-> (keys body)
                                                 (obfuscated-token? body saved) (->> (remove #{token-key})))))))
     :turn-off-clears    (or (not (turns-off? body)) (every? nil? (vals writes)))
     :body-values        (or (turns-off? body) (= writes (select-keys body (keys writes))))
     :obfuscated-keeps   (or (not (obfuscated-token? body saved)) (= (get saved token-key) (get after token-key)))
     :check              (= check (when (and (not (turns-off? body)) (some repository/git-keys (keys body)))
                                    (connection-after after)))
     :default-branch     (= default-branch? (boolean (and check
                                                          (str/blank? (:branch check))
                                                          (not (contains? env branch-key)))))
     :idempotent         (= after again)}))

(deftest save-plan-examples-test
  (let [saved {:remote-sync-url "https://git.example.com/a.git" :remote-sync-token "token-one"
               :remote-sync-type :read-write :remote-sync-branch "main" :remote-sync-auto-import false}]
    (testing "a blank URL turns library branching off: it clears the URL, the token and the branch, and checks nothing"
      (is (= {:writes {url-key nil token-key nil branch-key nil} :check nil :default-branch? false}
             (repository/save-plan {url-key "" :remote-sync-type :read-only} saved #{}))))
    (testing "the obfuscated saved token keeps the saved token, and the check uses it"
      (is (= {:writes          {branch-key "dev"}
              :check           {:url "https://git.example.com/a.git" :token "token-one" :branch "dev" :type :read-write}
              :default-branch? false}
             (repository/save-plan {token-key (setting/obfuscate-value "token-one") branch-key "dev"} saved #{}))))
    (testing "a nil token clears the token"
      (is (= {token-key nil} (:writes (repository/save-plan {token-key nil} saved #{})))))
    (testing "a change of a setting that is not about git checks nothing"
      (is (= {:writes {:remote-sync-auto-import true} :check nil :default-branch? false}
             (repository/save-plan {:remote-sync-auto-import true} saved #{}))))
    (testing "a blank branch asks for the default branch, unless the branch comes from the environment"
      (is (true? (:default-branch? (repository/save-plan {branch-key ""} saved #{}))))
      (is (false? (:default-branch? (repository/save-plan {branch-key ""} saved #{branch-key})))))
    (testing "a value from an environment variable stays, and the check uses it"
      (is (= {:writes          {token-key "token-three"}
              :check           {:url "https://git.example.com/a.git" :token "token-three" :branch "main"
                                :type :read-write}
              :default-branch? false}
             (repository/save-plan {url-key "https://other.example.com/b.git" token-key "token-three"}
                                   saved #{url-key})))
      (is (= {} (:writes (repository/save-plan {url-key ""} saved #{url-key token-key branch-key})))))))

(defspec save-plan-laws-test 300
  (prop/for-all [save save-case-gen]
    (let [laws (save-plan-laws save)]
      (is (= (zipmap (keys laws) (repeat true)) laws) (pr-str save))
      (every? true? (vals laws)))))

;;; -------------------------------------------------- Test Connection --------------------------------------------------

(defn- test-connection [body]
  (try
    (repository/test-connection! body)
    :ok
    (catch clojure.lang.ExceptionInfo e
      {:status-code (:status-code (ex-data e)) :message (ex-message e)})))

(deftest test-connection-succeeds-with-the-saved-settings-test
  (with-remote [repo url]
    (rtu/remote-with-branches! repo ["main"])
    (with-settings {url-key url branch-key "main"}
      (is (= :ok (test-connection {}))))))

(deftest test-connection-makes-a-fresh-remote-call-test
  (testing "each Test Connection asks the remote again: a remote that went away fails the next test"
    (with-settings {}
      (let [url (with-remote [repo url]
                  (rtu/remote-with-branches! repo ["main"])
                  (with-settings {url-key url}
                    (rtu/do-recording-stores
                     (fn [calls]
                       (is (= :ok (test-connection {})))
                       (is (= :ok (test-connection {})))
                       (is (= 2 (count @calls)) "one store, and so one remote call, for each test"))))
                  url)]
        (with-settings {url-key url}
          (is (= {:status-code 400 :message "Repository not found: Please check the repository URL"}
                 (test-connection {}))))))))

(deftest test-connection-uses-the-values-of-the-form-test
  (with-remote [repo url]
    (rtu/remote-with-branches! repo ["main"])
    (with-settings {url-key "https://saved.example.com/a.git" token-key "saved-token"}
      (rtu/do-recording-stores
       (fn [calls]
         (testing "a URL and a token of the form override the saved ones"
           (is (= :ok (test-connection {url-key url token-key "new-token"})))
           (is (= [{:url url :token "new-token"}] @calls)))
         (testing "the obfuscated saved token means the saved token"
           (reset! calls [])
           (is (= :ok (test-connection {url-key url token-key (setting/obfuscate-value "saved-token")})))
           (is (= [{:url url :token "saved-token"}] @calls)))
         (testing "no token in the form means the saved token"
           (reset! calls [])
           (is (= :ok (test-connection {url-key url})))
           (is (= [{:url url :token "saved-token"}] @calls)))
         (testing "a nil token in the form means no token"
           (reset! calls [])
           (is (= :ok (test-connection {url-key url token-key nil})))
           (is (= [{:url url :token nil}] @calls))))))))

(deftest test-connection-messages-test
  (testing "no URL in the form and none saved"
    (with-settings {}
      (is (= {:status-code 400 :message "Library branching is not configured."} (test-connection {})))
      (is (= {:status-code 400 :message "Library branching is not configured."} (test-connection {url-key "  "})))))
  (testing "a URL that the URL rule refuses"
    (with-settings {}
      (is (= {:status-code 400
              :message     "Invalid repository URL: only HTTPS URLs are supported (e.g., https://git-host.example.com/yourcompany/repo.git)"}
             (test-connection {url-key "asdf://foo/bar.git"})))))
  (testing "a token that the remote refuses gets the message of an authentication failure"
    (with-remote [repo url]
      (rtu/remote-with-branches! repo ["main"])
      (with-settings {url-key url token-key "rotated"}
        (dynamic-redefs/with-dynamic-fn-redefs
          [store.jgit/open-transport (fn [& _]
                                       (throw (TransportException. (URIish. ^String url)
                                                                   (.-notAuthorized (JGitText/get)))))]
          (is (= {:status-code 400 :message "Authentication failed: Please check your git credentials"}
                 (test-connection {}))))))))

;;; -------------------------------------------------------- Save -------------------------------------------------------

(defn- save [body]
  (try
    (repository/save-settings! body (mt/user->id :crowberto))
    :ok
    (catch clojure.lang.ExceptionInfo e
      {:status-code (:status-code (ex-data e)) :message (ex-message e)})))

(defmacro ^:private with-save-fixture
  "Runs `body` with no task row and no base, and the repository settings `settings`."
  [settings & body]
  `(tasks.tu/with-no-tasks
     (with-settings ~settings
       ~@body)))

(deftest save-of-a-new-repository-test
  (with-remote [repo url]
    (rtu/remote-with-branches! repo ["main" "dev"])
    (with-save-fixture {}
      (testing "a save of a URL and a branch"
        (is (= :ok (save {url-key url branch-key "dev" :remote-sync-type :read-write})))
        (is (= {url-key url token-key nil branch-key "dev" :remote-sync-type :read-write :remote-sync-auto-import false}
               (rtu/saved))))
      (testing "the save ran as a task of kind settings"
        (is (=? {:task_type "settings" :status "successful" :initiated_by (mt/user->id :crowberto)}
                (tasks/newest-task)))))))

(deftest save-with-a-blank-branch-takes-the-default-branch-test
  (with-remote [repo url]
    (rtu/remote-with-branches! repo ["trunk" "dev"])
    (with-save-fixture {}
      (is (= :ok (save {url-key url branch-key ""})))
      (is (= "trunk" (setting/get branch-key)))
      (testing "with no branch in the body either"
        (setting/set! branch-key nil)
        (is (= :ok (save {url-key url})))
        (is (= "trunk" (setting/get branch-key)))))))

(deftest save-refuses-what-does-not-connect-test
  (with-save-fixture {url-key "https://saved.example.com/a.git" branch-key "main"}
    (let [before (rtu/saved)]
      (testing "a URL that the URL rule refuses"
        (is (= {:status-code 400
                :message     "Invalid repository URL: only HTTPS URLs are supported (e.g., https://git-host.example.com/yourcompany/repo.git)"}
               (save {url-key "asdf://foo/bar.git"}))))
      (testing "a URL that does not reach a repository, with the message of the failure"
        (is (= {:status-code 400 :message "Repository not found: Please check the repository URL"}
               (save {url-key "file:///no/such/library-branching/repository"}))))
      (testing "a read-only instance on a branch that the repository does not have"
        (with-remote [repo url]
          (rtu/remote-with-branches! repo ["main"])
          (is (= {:status-code 400 :message "The repository has no branch nope."}
                 (save {url-key url branch-key "nope" :remote-sync-type :read-only})))))
      (testing "nothing changed, and no task ran"
        (is (= before (rtu/saved)))
        (is (nil? (tasks/newest-task)))))))

(deftest save-refuses-while-a-task-runs-test
  (testing "a save while a task runs is refused before any remote call, and changes nothing"
    (with-remote [repo url]
      (rtu/remote-with-branches! repo ["main" "feature-x"])
      (with-save-fixture {url-key url branch-key "main" :remote-sync-type :read-only}
        (let [running (tasks/start! "pull" nil)
              before  (rtu/saved)]
          (rtu/do-recording-stores
           (fn [calls]
             (doseq [body [{url-key url branch-key "feature-x"}
                           {:remote-sync-type :read-write}
                           {:remote-sync-auto-import true}
                           {url-key ""}]]
               (testing (pr-str body)
                 (is (= {:status-code 400 :message "Library branching task in progress"} (save body)))))
             (is (= [] @calls) "no remote call")
             (is (= before (rtu/saved)))
             (is (= (:id running) (:id (tasks/newest-task))) "no settings task"))))))))

(deftest save-of-a-setting-not-about-git-calls-no-remote-test
  (with-remote [repo url]
    (rtu/remote-with-branches! repo ["main"])
    (with-save-fixture {url-key url branch-key "main"}
      (rtu/do-recording-stores
       (fn [calls]
         (testing "auto-import only: no remote call"
           (is (= :ok (save {:remote-sync-auto-import true})))
           (is (true? (setting/get :remote-sync-auto-import)))
           (is (= [] @calls)))
         (testing "a change of the branch or of the role calls the remote"
           (is (= :ok (save {branch-key "main" :remote-sync-type :read-only})))
           (is (= 1 (count @calls)))))))))

(deftest save-token-rules-test
  (with-remote [repo url]
    (rtu/remote-with-branches! repo ["main" "dev"])
    (with-save-fixture {url-key url branch-key "main" token-key "full-token"}
      (rtu/do-recording-stores
       (fn [calls]
         (testing "the obfuscated token keeps the stored token, and the check uses the stored token"
           (is (= :ok (save {url-key url token-key (setting/obfuscate-value "full-token") branch-key "dev"})))
           (is (= "full-token" (setting/get token-key)))
           (is (= {:url url :token "full-token"} (last @calls))))
         (testing "a switch to read-only with no token in the body keeps the token"
           (is (= :ok (save {:remote-sync-type :read-only})))
           (is (= "full-token" (setting/get token-key)))
           (is (= :read-only (setting/get :remote-sync-type))))
         (testing "a change of the branch of a read-only instance with no token keeps the token"
           (is (= :ok (save {branch-key "main"})))
           (is (= "main" (setting/get branch-key)))
           (is (= "full-token" (setting/get token-key))))
         (testing "another token replaces it"
           (is (= :ok (save {token-key "other-token"})))
           (is (= "other-token" (setting/get token-key))))
         (testing "a nil token clears it"
           (is (= :ok (save {token-key nil})))
           (is (nil? (setting/get token-key)))))))))

(deftest turn-off-keeps-the-base-row-test
  (testing "a blank URL turns library branching off and clears the URL, the token and the branch; the base stays"
    (with-remote [repo url]
      (rtu/remote-with-branches! repo ["main"])
      (with-save-fixture {url-key url token-key "secret" branch-key "main"}
        (let [c (rtu/commit-branch! repo "main")]
          (is (= :ok (instance/set-base! (app-db/app-db-instance app-db/kind-stores scope/roots url) nil c {})))
          (rtu/do-recording-stores
           (fn [calls]
             (is (= :ok (save {url-key ""})))
             (is (= [] @calls) "no remote call")))
          (is (false? (repository/configured?)))
          (is (= [nil nil nil] (map setting/get [url-key token-key branch-key])))
          (is (=? {:commit_id c :url url}
                  (t2/query-one {:select [:commit_id :url] :from [:library_branching_base] :where [:= :id 1]})))
          (testing "the same URL again finds the base"
            (is (= :ok (save {url-key url branch-key "main"})))
            (is (= c (instance/base (app-db/app-db-instance app-db/kind-stores scope/roots (repository/url)))))))))))

(deftest save-keeps-values-from-environment-variables-test
  (with-remote [repo url]
    (rtu/remote-with-branches! repo ["env-branch" "api-branch"])
    (with-save-fixture {}
      (mt/with-temp-env-var-value! [mb-remote-sync-url    url
                                    mb-remote-sync-token  "env-token"
                                    mb-remote-sync-branch "env-branch"]
        (testing "a save through the API of the URL, the token and the branch leaves the values of the environment"
          (is (= :ok (save {url-key "https://api.example.com/a.git" token-key "api-token" branch-key "api-branch"
                            :remote-sync-type :read-only})))
          (is (= [url "env-token" "env-branch" :read-only]
                 (map setting/get [url-key token-key branch-key :remote-sync-type]))))
        (testing "a blank URL does not clear the values of the environment"
          (is (= :ok (save {url-key ""})))
          (is (= [url "env-token" "env-branch"] (map setting/get [url-key token-key branch-key]))))))))
