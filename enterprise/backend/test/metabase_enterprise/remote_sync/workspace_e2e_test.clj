(ns ^:synchronous metabase-enterprise.remote-sync.workspace-e2e-test
  "End-to-end verification that a remote-sync workspace can pull a branch from a real `file://` git
  source, materialize it as workspace-tagged rows sharing entity_ids with the main app, and push an
  isolated edit back to its own branch without touching main. Also an exploratory matrix covering
  multi-workspace isolation, brand-new content, deletion, external remote advances, main/workspace
  coexistence, read isolation, workspace deletion, entity_id scope resolution, and read-only mode."
  (:require
   [clojure.java.io :as io]
   [clojure.java.shell :as shell]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [diehard.core :as dh]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util.thread-local :as tu.thread-local]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once
  (fixtures/initialize :db)
  (fn [f] (mt/dataset test-data (mt/id) (f))))

(defn- commit-with-temp
  "Makes `with-temp` commit its rows instead of rolling them back. `async-import!`/`async-export!` run on
  a separate virtual thread with its own DB connection, which can't see rows still inside `with-temp`'s
  default rollback-only transaction on the test thread (mirrors
  `metabase-enterprise.remote-sync.test-helpers/commit-with-temp`); every test in this namespace exercises
  those async tasks."
  [f]
  (binding [tu.thread-local/*thread-local* false] (f)))

(use-fixtures :each
  test-helpers/clean-remote-sync-state
  commit-with-temp)

(defn- sh!
  [& args]
  (let [{:keys [exit out err]} (apply shell/sh args)]
    (when-not (zero? exit)
      (throw (ex-info (str "Command failed: " (pr-str args)) {:exit exit :out out :err err})))
    out))

(defn- init-origin-repo!
  "Creates a fresh bare git repo under the system temp dir, seeded with an initial commit on `main`.
  Returns its `file://` URL. The seed commit embeds a fresh UUID so its content (and hence its SHA) is
  never byte-identical across two calls -- `remote-sync.task/last-version` is scoped only by
  `workspace_id`, not by which repo it ran against, so two repos whose initial commit hashed the same
  could make a later `POST /branch` in one test silently resolve a stale base commit left behind by
  another test's run against a different repo."
  []
  (let [root   (io/file (System/getProperty "java.io.tmpdir") "workspace-e2e" (str (random-uuid)))
        origin (io/file root "origin.git")
        seed   (io/file root "seed")]
    (.mkdirs root)
    (sh! "git" "init" "--bare" "-b" "main" (str origin))
    (sh! "git" "clone" (str origin) (str seed))
    (spit (io/file seed "README.md") (str "seed " (random-uuid) "\n"))
    (sh! "git" "add" "README.md" :dir (str seed))
    (sh! "git" "-c" "user.email=e2e@metabase.com" "-c" "user.name=E2E Test" "commit" "-m" "Initial commit" :dir (str seed))
    (sh! "git" "push" "origin" "main" :dir (str seed))
    {:origin-dir origin
     :url        (str "file://" (.getAbsolutePath origin))}))

(defn- git-log!
  [origin-dir branch]
  (sh! "git" "--git-dir" (str origin-dir) "log" "--oneline" branch))

(defn- git-diff!
  [origin-dir sha1 sha2]
  (sh! "git" "--git-dir" (str origin-dir) "diff" sha1 sha2))

(defn- git-rev-parse!
  [origin-dir ref]
  (str/trim (sh! "git" "--git-dir" (str origin-dir) "rev-parse" ref)))

(defn- wait-for-task-completion
  [task-id]
  (when task-id
    (dh/with-retry {:max-retries 20 :delay-ms 500}
      (u/prog1 (t2/select-one :model/RemoteSyncTask :id task-id)
        (when (nil? (:ended_at <>))
          (throw (ex-info "Not finished" {:task-id task-id :result <>})))))))

(defn- export!
  [user branch message]
  (let [{task_id :task_id} (mt/user-http-request user :post 200 "ee/remote-sync/export" {:branch branch :message message})
        task (wait-for-task-completion task_id)]
    (is (remote-sync.task/successful? task) (pr-str task))
    task))

(defn- import!
  [user expected-branch]
  (let [{task_id :task_id} (mt/user-http-request user :post 200 "ee/remote-sync/import" {:expected_branch expected-branch})]
    (when task_id
      (let [task (wait-for-task-completion task_id)]
        (is (remote-sync.task/successful? task) (pr-str task))
        task))))

(defn- create-branch!
  [name]
  (mt/user-http-request :crowberto :post 200 "ee/remote-sync/branch" {:name name}))

(defn- create-workspace!
  [branch]
  (:id (mt/user-http-request :crowberto :post 200 "ee/workspace" {:branch branch})))

(defn- assign-workspace!
  [user-id workspace-id]
  (mt/user-http-request :crowberto :put 200 (str "user/" user-id) {:workspace_id workspace-id}))

(defn- unassign-workspace!
  [user-id]
  (mt/user-http-request :crowberto :put 200 (str "user/" user-id) {:workspace_id nil}))

(defn- delete-workspace!
  [workspace-id]
  (mt/user-http-request :crowberto :delete 204 (str "ee/workspace/" workspace-id)))

(defn- create-main-collection!
  [name]
  (let [coll (mt/user-http-request :crowberto :post 200 "collection" {:name name})]
    (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings" {:collections {(:id coll) true}})
    coll))

(defn- create-collection!
  [user name]
  (mt/user-http-request user :post 200 "collection" {:name name}))

(defn- create-snippets-collection!
  [user name]
  (mt/user-http-request user :post 200 "collection" {:name name :namespace "snippets"}))

(defn- create-card!
  [user name collection-id]
  (mt/user-http-request user :post 200 "card"
                        {:name                   name
                         :collection_id          collection-id
                         :display                "table"
                         :visualization_settings {}
                         :dataset_query          (mt/native-query {:query "SELECT 1"})}))

(defn- create-snippet!
  [user name collection-id]
  (mt/user-http-request user :post 200 "native-query-snippet"
                        {:name name :content "SELECT 1" :collection_id collection-id}))

(defn- edit-remote-branch-directly!
  "Simulates an external actor (not Metabase) pushing straight to `branch` on `origin-dir`: clones it,
  applies `edit-fn` (a `File` seed dir -> nil) to the working tree, commits, pushes."
  [origin-dir branch edit-fn]
  (let [clone (io/file (System/getProperty "java.io.tmpdir") "workspace-e2e" (str (random-uuid)) "external-edit")]
    (sh! "git" "clone" "--branch" branch (str origin-dir) (str clone))
    (edit-fn clone)
    (sh! "git" "add" "-A" :dir (str clone))
    (sh! "git" "-c" "user.email=external@metabase.com" "-c" "user.name=External Editor" "commit" "-m" "External edit" :dir (str clone))
    (sh! "git" "push" "origin" branch :dir (str clone))))

(defn- card-ids
  [response]
  (into #{} (map :id) response))

(deftest workspace-pull-edit-push-e2e-test
  (testing "remote-sync workspace pull/edit/push round-trip against a real file:// git source"
    (let [{:keys [origin-dir url]} (init-origin-repo!)]
      (mt/with-premium-features #{:remote-sync}
        (mt/with-temporary-setting-values [settings/remote-sync-url    url
                                           settings/remote-sync-token  "dummy-token"
                                           settings/remote-sync-branch "main"
                                           settings/remote-sync-type   :read-write]
          (let [admin-id (mt/user->id :crowberto)]
            (try
              (testing "1. create MAIN content and export/push it to main"
                (let [coll (mt/user-http-request :crowberto :post 200 "collection"
                                                 {:name "Workspace E2E Root"})
                      _ (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings"
                                              {:collections {(:id coll) true}})
                      card (mt/user-http-request :crowberto :post 200 "card"
                                                 {:name                   "Workspace E2E Card"
                                                  :collection_id          (:id coll)
                                                  :display                "table"
                                                  :visualization_settings {}
                                                  :dataset_query          (mt/native-query {:query "SELECT 1"})})
                      {task_id :task_id} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export"
                                                               {:branch "main" :message "Initial export"})
                      task (wait-for-task-completion task_id)]
                  (is (remote-sync.task/successful? task) (pr-str task))
                  (testing "the pushed main branch contains the card's YAML"
                    (let [tree      (sh! "git" "--git-dir" (str origin-dir) "ls-tree" "-r" "--name-only" "main")
                          card-path (some #(when (str/includes? % "workspace_e2e_card") %) (str/split-lines tree))]
                      (is (some? card-path) tree)
                      (is (str/includes? (sh! "git" "--git-dir" (str origin-dir) "show" (str "main:" card-path))
                                         (:entity_id card)))))
                  (testing "2. create wt-branch from main without switching remote-sync-branch"
                    (mt/user-http-request :crowberto :post 200 "ee/remote-sync/branch" {:name "wt-branch"})
                    (is (= "main" (settings/remote-sync-branch))
                        "creating a branch must not switch the active branch")
                    (let [wt-branch-base-sha (git-rev-parse! origin-dir "wt-branch")]
                      (testing "3. create a workspace for wt-branch and assign the admin to it"
                        (let [{workspace-id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                                       {:branch "wt-branch"})]
                          (mt/user-http-request :crowberto :put 200 (str "user/" admin-id) {:workspace_id workspace-id})
                          (try
                            (testing "4. workspace-scoped PULL materializes workspace-tagged rows sharing entity_ids"
                              (let [{task_id :task_id} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/import"
                                                                             {:expected_branch "wt-branch"})
                                    task (wait-for-task-completion task_id)]
                                (is (remote-sync.task/successful? task) (pr-str task)))
                              (let [wt-coll (t2/select-one :model/Collection :entity_id (:entity_id coll) :workspace_id workspace-id)
                                    wt-card (t2/select-one :model/Card :entity_id (:entity_id card) :workspace_id workspace-id)
                                    main-coll (t2/select-one :model/Collection :id (:id coll))
                                    main-card (t2/select-one :model/Card :id (:id card))]
                                (is (some? wt-coll))
                                (is (some? wt-card))
                                (is (not= (:id coll) (:id wt-coll)) "workspace collection is a distinct row")
                                (is (not= (:id card) (:id wt-card)) "workspace card is a distinct row")
                                (is (= (:entity_id coll) (:entity_id wt-coll)))
                                (is (= (:entity_id card) (:entity_id wt-card)))
                                (is (nil? (:workspace_id main-coll)) "main collection untouched")
                                (is (nil? (:workspace_id main-card)) "main card untouched")
                                (is (= "Workspace E2E Card" (:name main-card)))
                                (testing "5. edit the workspace card only"
                                  (mt/user-http-request :crowberto :put 200 (str "card/" (:id wt-card))
                                                        {:name "Workspace E2E Card (renamed)"})
                                  (is (= "Workspace E2E Card (renamed)"
                                         (t2/select-one-fn :name :model/Card :id (:id wt-card))))
                                  (is (= "Workspace E2E Card" (t2/select-one-fn :name :model/Card :id (:id card)))
                                      "main card must be untouched by the workspace edit"))
                                (testing "6. PUSH the workspace edit to wt-branch"
                                  (let [{task_id :task_id} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/export"
                                                                                 {:branch "wt-branch" :message "Rename card"})
                                        task (wait-for-task-completion task_id)]
                                    (is (remote-sync.task/successful? task) (pr-str task)))
                                  (let [wt-branch-head-sha (git-rev-parse! origin-dir "wt-branch")
                                        main-head-sha       (git-rev-parse! origin-dir "main")
                                        diff                (git-diff! origin-dir wt-branch-base-sha wt-branch-head-sha)
                                        wt-log              (git-log! origin-dir "wt-branch")
                                        main-log            (git-log! origin-dir "main")]
                                    (log/info "\n=== wt-branch log ===\n" wt-log)
                                    (log/info "=== main log ===\n" main-log)
                                    (log/info "=== git diff " wt-branch-base-sha ".." wt-branch-head-sha " (wt-branch push) ===\n" diff)
                                    (is (not= wt-branch-base-sha wt-branch-head-sha)
                                        "wt-branch must have advanced")
                                    (is (= "main" (settings/remote-sync-branch))
                                        "workspace export must never touch the remote-sync-branch setting")
                                    (is (str/includes? diff "Workspace E2E Card (renamed)")
                                        "the pushed diff must contain the renamed card's new name")
                                    (is (str/includes? diff "-name: Workspace E2E Card")
                                        "the pushed diff must show the old name removed")
                                    (is (not (str/includes? diff "README"))
                                        "only the card's YAML should have changed, nothing else")
                                    (is (= main-head-sha (git-rev-parse! origin-dir "main"))
                                        "main branch must be byte-identical (same commit) after the workspace push")))))
                            (finally
                              (mt/user-http-request :crowberto :put 200 (str "user/" admin-id) {:workspace_id nil})
                              (mt/user-http-request :crowberto :delete 204 (str "ee/workspace/" workspace-id))))))))))
              (finally
                (mt/user-http-request :crowberto :put 200 (str "user/" admin-id) {:workspace_id nil})))))))))

(deftest two-simultaneous-workspaces-isolation-test
  (testing "two workspaces on different branches, active at the same time, stay fully isolated from each other and from main"
    (let [{:keys [origin-dir url]} (init-origin-repo!)]
      (mt/with-premium-features #{:remote-sync}
        (mt/with-temporary-setting-values [settings/remote-sync-url    url
                                           settings/remote-sync-token  "dummy-token"
                                           settings/remote-sync-branch "main"
                                           settings/remote-sync-type   :read-write]
          (mt/with-temp [:model/User user-b {:is_superuser true}
                         :model/User user-c {:is_superuser true}]
            (let [main-coll (create-main-collection! "Matrix Main Root")
                  main-card (create-card! :crowberto "Matrix Main Card" (:id main-coll))]
              (export! :crowberto "main" "seed main")
              (create-branch! "wt-matrix-a")
              (create-branch! "wt-matrix-b")
              (let [wt-a (create-workspace! "wt-matrix-a")
                    wt-b (create-workspace! "wt-matrix-b")]
                (try
                  (assign-workspace! (mt/user->id :crowberto) wt-a)
                  (assign-workspace! (:id user-b) wt-b)
                  (import! :crowberto "wt-matrix-a")
                  (import! user-b "wt-matrix-b")
                  (let [a-coll     (t2/select-one :model/Collection :entity_id (:entity_id main-coll) :workspace_id wt-a)
                        b-coll     (t2/select-one :model/Collection :entity_id (:entity_id main-coll) :workspace_id wt-b)
                        a-only     (create-card! :crowberto "A-only Card" (:id a-coll))
                        b-only     (create-card! user-b "B-only Card" (:id b-coll))]
                    (testing "workspace A's user sees only A's content"
                      (let [ids (card-ids (mt/user-http-request :crowberto :get 200 "card"))]
                        (is (contains? ids (:id a-only)))
                        (is (not (contains? ids (:id b-only))))
                        (is (not (contains? ids (:id main-card))))))
                    (testing "workspace B's user sees only B's content"
                      (let [ids (card-ids (mt/user-http-request user-b :get 200 "card"))]
                        (is (contains? ids (:id b-only)))
                        (is (not (contains? ids (:id a-only))))
                        (is (not (contains? ids (:id main-card))))))
                    (testing "main's user sees only main's content"
                      (let [ids (card-ids (mt/user-http-request user-c :get 200 "card"))]
                        (is (contains? ids (:id main-card)))
                        (is (not (contains? ids (:id a-only))))
                        (is (not (contains? ids (:id b-only)))))))
                  (testing "pushing A only advances wt-matrix-a; wt-matrix-b and main are untouched"
                    (let [a-base  (git-rev-parse! origin-dir "wt-matrix-a")
                          b-base  (git-rev-parse! origin-dir "wt-matrix-b")
                          m-base  (git-rev-parse! origin-dir "main")]
                      (export! :crowberto "wt-matrix-a" "push A only")
                      (let [a-head (git-rev-parse! origin-dir "wt-matrix-a")
                            diff   (git-diff! origin-dir a-base a-head)]
                        (log/info "\n=== two-workspace isolation: wt-matrix-a push diff ===\n" diff)
                        (is (not= a-base a-head) "wt-matrix-a must have advanced")
                        (is (str/includes? diff "A-only Card"))
                        (is (= b-base (git-rev-parse! origin-dir "wt-matrix-b"))
                            "wt-matrix-b must be untouched by A's push")
                        (is (= m-base (git-rev-parse! origin-dir "main"))
                            "main must be untouched by A's push"))))
                  (finally
                    (unassign-workspace! (mt/user->id :crowberto))
                    (unassign-workspace! (:id user-b))
                    (delete-workspace! wt-a)
                    (delete-workspace! wt-b)))))))))))

(deftest new-content-in-workspace-push-test
  (testing "brand-new content created only in a workspace (not present on main) appears on the workspace branch after push; main branch and app are untouched"
    (let [{:keys [origin-dir url]} (init-origin-repo!)]
      (mt/with-premium-features #{:remote-sync :snippet-collections}
        (mt/with-temporary-setting-values [settings/remote-sync-url    url
                                           settings/remote-sync-token  "dummy-token"
                                           settings/remote-sync-branch "main"
                                           settings/remote-sync-type   :read-write]
          (collections.tu/with-library-synced
            (let [admin-id (mt/user->id :crowberto)]
              (try
                (create-branch! "wt-fresh")
                (let [wt-id (create-workspace! "wt-fresh")]
                  (try
                    (assign-workspace! admin-id wt-id)
                    (import! :crowberto "wt-fresh")
                    (let [coll         (create-collection! :crowberto "Fresh WT Collection")
                          card         (create-card! :crowberto "Fresh WT Card" (:id coll))
                          snippet-coll (create-snippets-collection! :crowberto "Fresh WT Snippet Collection")
                          snippet      (create-snippet! :crowberto "Fresh WT Snippet" (:id snippet-coll))]
                      (is (= wt-id (t2/select-one-fn :workspace_id :model/Collection :id (:id coll))))
                      (is (= wt-id (t2/select-one-fn :workspace_id :model/Card :id (:id card))))
                      (is (= wt-id (t2/select-one-fn :workspace_id :model/NativeQuerySnippet :id (:id snippet))))
                      (let [main-base (git-rev-parse! origin-dir "main")]
                        (export! :crowberto "wt-fresh" "push brand-new content")
                        (let [wt-tree   (sh! "git" "--git-dir" (str origin-dir) "ls-tree" "-r" "--name-only" "wt-fresh")
                              main-tree (sh! "git" "--git-dir" (str origin-dir) "ls-tree" "-r" "--name-only" "main")]
                          (log/info "\n=== new-content push: wt-fresh tree ===\n" wt-tree)
                          (log/info "=== new-content push: main tree (unchanged) ===\n" main-tree)
                          (is (str/includes? wt-tree "fresh_wt_collection"))
                          (is (str/includes? wt-tree "fresh_wt_card"))
                          (is (str/includes? wt-tree "fresh_wt_snippet"))
                          (is (= "README.md" (str/trim main-tree))
                              "main must still contain only the seed README")
                          (is (= main-base (git-rev-parse! origin-dir "main"))
                              "main must be byte-identical (same commit) after the workspace push"))))
                    (finally
                      (unassign-workspace! admin-id)
                      (delete-workspace! wt-id))))
                (finally
                  (unassign-workspace! admin-id))))))))))

(deftest delete-workspace-content-push-test
  (testing "deleting content in a workspace and pushing reflects the deletion on the workspace branch only"
    (let [{:keys [origin-dir url]} (init-origin-repo!)]
      (mt/with-premium-features #{:remote-sync}
        (mt/with-temporary-setting-values [settings/remote-sync-url    url
                                           settings/remote-sync-token  "dummy-token"
                                           settings/remote-sync-branch "main"
                                           settings/remote-sync-type   :read-write]
          (let [admin-id (mt/user->id :crowberto)
                coll     (create-main-collection! "Delete Test Root")
                card     (create-card! :crowberto "Doomed Card" (:id coll))]
            (export! :crowberto "main" "seed")
            (create-branch! "wt-delete")
            (let [wt-id (create-workspace! "wt-delete")]
              (try
                (assign-workspace! admin-id wt-id)
                (import! :crowberto "wt-delete")
                (let [wt-card (t2/select-one :model/Card :entity_id (:entity_id card) :workspace_id wt-id)
                      pre-sha (git-rev-parse! origin-dir "wt-delete")]
                  (mt/user-http-request :crowberto :delete 204 (str "card/" (:id wt-card)))
                  (is (not (t2/exists? :model/Card :id (:id wt-card))))
                  (export! :crowberto "wt-delete" "delete card")
                  (let [post-sha  (git-rev-parse! origin-dir "wt-delete")
                        diff      (git-diff! origin-dir pre-sha post-sha)
                        main-tree (sh! "git" "--git-dir" (str origin-dir) "ls-tree" "-r" "--name-only" "main")]
                    (log/info "\n=== delete push: wt-delete diff ===\n" diff)
                    (is (str/includes? diff "deleted file"))
                    (is (str/includes? diff "doomed_card.yaml"))
                    (is (str/includes? main-tree "doomed_card.yaml")
                        "main's copy of the card's YAML must still exist")
                    (is (t2/exists? :model/Card :id (:id card))
                        "main's card row is untouched")))
                (finally
                  (unassign-workspace! admin-id)
                  (delete-workspace! wt-id))))))))))

(deftest repull-after-external-remote-advance-test
  (testing "an external commit pushed directly to the workspace's branch is picked up by a re-pull"
    (let [{:keys [origin-dir url]} (init-origin-repo!)]
      (mt/with-premium-features #{:remote-sync}
        (mt/with-temporary-setting-values [settings/remote-sync-url    url
                                           settings/remote-sync-token  "dummy-token"
                                           settings/remote-sync-branch "main"
                                           settings/remote-sync-type   :read-write]
          (let [admin-id (mt/user->id :crowberto)
                coll     (create-main-collection! "External Advance Root")
                card     (create-card! :crowberto "Original Name" (:id coll))]
            (export! :crowberto "main" "seed")
            (create-branch! "wt-external")
            (let [wt-id (create-workspace! "wt-external")]
              (try
                (assign-workspace! admin-id wt-id)
                (let [tree      (sh! "git" "--git-dir" (str origin-dir) "ls-tree" "-r" "--name-only" "wt-external")
                      card-path (some #(when (str/includes? % "original_name") %) (str/split-lines tree))]
                  (is (some? card-path) tree)
                  (edit-remote-branch-directly!
                   origin-dir "wt-external"
                   (fn [clone-dir]
                     (let [f (io/file clone-dir card-path)]
                       (spit f (str/replace (slurp f) "name: Original Name" "name: Externally Edited Name")))))
                  (import! :crowberto "wt-external")
                  (is (= "Externally Edited Name"
                         (t2/select-one-fn :name :model/Card :entity_id (:entity_id card) :workspace_id wt-id)))
                  (is (= "Original Name" (t2/select-one-fn :name :model/Card :id (:id card)))
                      "main's card is untouched by the external edit to the workspace branch"))
                (finally
                  (unassign-workspace! admin-id)
                  (delete-workspace! wt-id))))))))))

(deftest main-alongside-active-workspace-test
  (testing "main push/pull keeps working normally, targeting main only, while a workspace is active"
    (let [{:keys [origin-dir url]} (init-origin-repo!)]
      (mt/with-premium-features #{:remote-sync}
        (mt/with-temporary-setting-values [settings/remote-sync-url    url
                                           settings/remote-sync-token  "dummy-token"
                                           settings/remote-sync-branch "main"
                                           settings/remote-sync-type   :read-write]
          (mt/with-temp [:model/User user-main {:is_superuser true}]
            (let [admin-id (mt/user->id :crowberto)
                  m1-coll  (create-main-collection! "Alongside M1 Root")
                  m1-card  (create-card! :crowberto "M1 Card" (:id m1-coll))]
              (export! :crowberto "main" "seed")
              (create-branch! "wt-along")
              (let [wt-id (create-workspace! "wt-along")]
                (try
                  (assign-workspace! admin-id wt-id)
                  (import! :crowberto "wt-along")
                  (let [wt-along-base (git-rev-parse! origin-dir "wt-along")]
                    (testing "main user creates + pushes new content while the workspace is active"
                      (let [m2-coll (create-collection! user-main "Alongside M2 Root")
                            _       (mt/user-http-request :crowberto :put 200 "ee/remote-sync/settings" {:collections {(:id m2-coll) true}})
                            m2-card (create-card! user-main "M2 Card" (:id m2-coll))]
                        (export! user-main "main" "push M2")
                        (let [main-tree (sh! "git" "--git-dir" (str origin-dir) "ls-tree" "-r" "--name-only" "main")]
                          (is (str/includes? main-tree "m2_card"))
                          (is (= wt-along-base (git-rev-parse! origin-dir "wt-along"))
                              "the workspace branch must be untouched by main's push"))
                        (testing "main import still works normally with a workspace active"
                          (import! user-main "main"))
                        (testing "read isolation: main user sees only main content, workspace user sees only workspace content"
                          (let [main-ids (card-ids (mt/user-http-request user-main :get 200 "card"))
                                wt-ids   (card-ids (mt/user-http-request :crowberto :get 200 "card"))]
                            (is (contains? main-ids (:id m1-card)))
                            (is (contains? main-ids (:id m2-card)))
                            (is (not (contains? wt-ids (:id m1-card)))
                                "the workspace user must not see main's original card row (different :id, same entity_id materialized separately)")
                            (is (not (contains? wt-ids (:id m2-card)))))
                          (let [search-name (str "alongside-search-" (random-uuid))]
                            (mt/user-http-request user-main :put 200 (str "card/" (:id m1-card)) {:name search-name})
                            (let [main-hits (into #{} (map :name) (:data (mt/user-http-request user-main :get 200 "search" :q search-name)))
                                  wt-hits   (into #{} (map :name) (:data (mt/user-http-request :crowberto :get 200 "search" :q search-name)))]
                              (is (contains? main-hits search-name))
                              (is (not (contains? wt-hits search-name)))))))
                      (is (= wt-id (t2/select-one-fn :workspace_id :model/User :id admin-id))
                          "the workspace admin's own scope is untouched by main's activity")))
                  (finally
                    (unassign-workspace! admin-id)
                    (delete-workspace! wt-id)))))))))))

(deftest workspace-editable-while-main-read-only-test
  (testing "flipping the main app to read-only leaves an active workspace fully editable, while blocking the equivalent main-scope edit"
    (let [{:keys [url]} (init-origin-repo!)]
      (mt/with-premium-features #{:remote-sync}
        (mt/with-temporary-setting-values [settings/remote-sync-url    url
                                           settings/remote-sync-token  "dummy-token"
                                           settings/remote-sync-branch "main"
                                           settings/remote-sync-type   :read-write]
          (let [admin-id (mt/user->id :crowberto)
                coll     (create-main-collection! "Read Only Root")
                card     (create-card! :crowberto "Read Only Card" (:id coll))]
            (export! :crowberto "main" "seed")
            (create-branch! "wt-ro")
            (let [wt-id (create-workspace! "wt-ro")]
              (try
                (assign-workspace! admin-id wt-id)
                (import! :crowberto "wt-ro")
                (let [wt-card (t2/select-one :model/Card :entity_id (:entity_id card) :workspace_id wt-id)]
                  (settings/remote-sync-type! :read-only)
                  (testing "the workspace card stays editable"
                    (mt/user-http-request :crowberto :put 200 (str "card/" (:id wt-card)) {:name "Edited despite read-only main"})
                    (is (= "Edited despite read-only main" (t2/select-one-fn :name :model/Card :id (:id wt-card)))))
                  (unassign-workspace! admin-id)
                  (testing "the equivalent main-scope edit is blocked"
                    (mt/user-http-request :crowberto :put 403 (str "card/" (:id card)) {:name "Should not apply"})
                    (is (= "Read Only Card" (t2/select-one-fn :name :model/Card :id (:id card))))))
                (finally
                  (unassign-workspace! admin-id)
                  (delete-workspace! wt-id))))))))))

(deftest delete-workspace-endpoint-test
  (testing "DELETE /api/ee/workspace/:id removes all materialized content and clears the assigned user; main is untouched"
    (let [{:keys [url]} (init-origin-repo!)]
      (mt/with-premium-features #{:remote-sync}
        (mt/with-temporary-setting-values [settings/remote-sync-url    url
                                           settings/remote-sync-token  "dummy-token"
                                           settings/remote-sync-branch "main"
                                           settings/remote-sync-type   :read-write]
          (let [admin-id (mt/user->id :crowberto)
                coll     (create-main-collection! "Deletable WT Root")
                card     (create-card! :crowberto "Deletable WT Card" (:id coll))]
            (export! :crowberto "main" "seed")
            (create-branch! "wt-rm")
            (let [wt-id (create-workspace! "wt-rm")]
              (assign-workspace! admin-id wt-id)
              (import! :crowberto "wt-rm")
              (let [wt-coll (t2/select-one :model/Collection :entity_id (:entity_id coll) :workspace_id wt-id)
                    wt-card (t2/select-one :model/Card :entity_id (:entity_id card) :workspace_id wt-id)]
                (is (some? wt-coll))
                (is (some? wt-card))
                (delete-workspace! wt-id)
                (is (not (t2/exists? :model/Collection :id (:id wt-coll)))
                    "the workspace's collection row is gone")
                (is (not (t2/exists? :model/Card :id (:id wt-card)))
                    "the workspace's card row is gone")
                (is (not (t2/exists? :model/Workspace :id wt-id)))
                (is (nil? (t2/select-one-fn :workspace_id :model/User :id admin-id))
                    "the assigned user's workspace_id is cleared")
                (is (t2/exists? :model/Collection :id (:id coll))
                    "main's collection is untouched")
                (is (t2/exists? :model/Card :id (:id card))
                    "main's card is untouched")))))))))

(deftest same-entity-id-scope-resolution-test
  (testing "GET /api/card/:id resolves the caller's own scope's row even when main and a workspace share the same entity_id"
    (let [{:keys [url]} (init-origin-repo!)]
      (mt/with-premium-features #{:remote-sync}
        (mt/with-temporary-setting-values [settings/remote-sync-url    url
                                           settings/remote-sync-token  "dummy-token"
                                           settings/remote-sync-branch "main"
                                           settings/remote-sync-type   :read-write]
          (let [admin-id (mt/user->id :crowberto)
                coll     (create-main-collection! "Entity Id Root")
                card     (create-card! :crowberto "Shared Entity Id Card" (:id coll))]
            (export! :crowberto "main" "seed")
            (create-branch! "wt-eid")
            (let [wt-id (create-workspace! "wt-eid")]
              (try
                (assign-workspace! admin-id wt-id)
                (import! :crowberto "wt-eid")
                (let [wt-card (t2/select-one :model/Card :entity_id (:entity_id card) :workspace_id wt-id)]
                  (is (= (:entity_id card) (:entity_id wt-card)))
                  (is (not= (:id card) (:id wt-card)))
                  (mt/user-http-request :crowberto :put 200 (str "card/" (:id wt-card)) {:name "Workspace-only Rename"})
                  (testing "the workspace-scoped caller resolves the workspace row by its own id"
                    (is (= "Workspace-only Rename" (:name (mt/user-http-request :crowberto :get 200 (str "card/" (:id wt-card)))))))
                  (testing "the workspace-scoped caller cannot resolve main's row by main's id, despite the shared entity_id"
                    (mt/user-http-request :crowberto :get 403 (str "card/" (:id card))))
                  (unassign-workspace! admin-id)
                  (testing "back in main scope, the caller resolves main's row by main's id, unaffected by the workspace rename"
                    (is (= "Shared Entity Id Card" (:name (mt/user-http-request :crowberto :get 200 (str "card/" (:id card)))))))
                  (testing "and cannot resolve the workspace's row by the workspace's id from main scope"
                    (mt/user-http-request :crowberto :get 403 (str "card/" (:id wt-card)))))
                (finally
                  (unassign-workspace! admin-id)
                  (delete-workspace! wt-id))))))))))
