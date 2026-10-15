(ns metabase-enterprise.library-branching.operations-test
  "Push, pull and merge-branch as tasks on the configured repository and the app DB instance. The workers read at read
  points of their own, so these tests commit their content and delete it afterwards; they change the one base row and
  the task rows of the app DB, so they are not parallel."
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.repository-test-util/with-remote clojure.core/fn}}}
  (:require
   [clojure.test :refer :all]
   ;; loads the settings of remote sync, which library branching reuses
   [metabase-enterprise.core.init]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.operations :as operations]
   [metabase-enterprise.library-branching.pull-test-util :as pltu]
   [metabase-enterprise.library-branching.push-test-util :as ptu]
   [metabase-enterprise.library-branching.repository :as repository]
   [metabase-enterprise.library-branching.repository-test-util :as rtu :refer [with-remote with-settings]]
   [metabase-enterprise.library-branching.store :as store]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase-enterprise.library-branching.tasks-test-util :as tasks.tu]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;;; -------------------------------------------------- Task results ---------------------------------------------------

(deftest push-task-result-test
  (is (= {:outcome {:kind "pushed" :branch "main" :commit "c1"}}
         (operations/push-task-result "main" {:result :pushed :commit "c1"})))
  (testing "a push whose base another task moved landed on the branch"
    (is (= {:outcome {:kind "pushed" :branch "main" :commit "c1"}}
           (operations/push-task-result "main" {:result :base-moved :commit "c1" :base "c0"}))))
  (is (= {:outcome {:kind "nothing-to-push" :branch "main" :commit "c0"}}
         (operations/push-task-result "main" {:result :nothing-to-push :commit "c0"})))
  (is (= {:error "The branch main moved since the last sync, so nothing was pushed. Pull first."}
         (operations/push-task-result "main" {:result :remote-moved :base "c0" :head "c2"})))
  (is (= {:error "The Library breaks the rules place-inside, refs-closed, so nothing was pushed."}
         (operations/push-task-result "main" {:result   :invalid
                                              :findings [{:rule :refs-closed :id "a"} {:rule :place-inside :id "b"}
                                                         {:rule :refs-closed :id "c"}]})))
  (is (= {:error "The task ended before the push reached its commit point, so nothing was pushed."}
         (operations/push-task-result "main" {:result :fenced :status "cancelled"})))
  (is (= {:error "Library branching is not enabled."}
         (operations/push-task-result "main" {:result :disabled}))))

(def ^:private revenue {:kind :metric :name "Revenue"})

(deftest pull-task-result-test
  (is (= {:outcome {:kind           "pulled"
                    :branch         "main"
                    :commit         "h"
                    :count          3
                    :trashed        1
                    :trashed_in_use [{:id    "b"
                                      :kind  "metric"
                                      :name  "Revenue"
                                      :users [{:kind "card" :id "x" :name "X"} {:kind "dashboard" :id "y" :name "Y"}]}]}}
         (operations/pull-task-result "main" {:result         :pulled
                                              :head           "h"
                                              :steps          [{:id "a" :write {}} {:id "a" :link #{}}
                                                               {:id "c" :trash true :pre revenue}
                                                               {:id "b" :trash true :pre revenue}]
                                              :trashed-in-use {"b" [{:kind :card :id "x" :name "X"}
                                                                    {:kind :dashboard :id "y" :name "Y"}]}})))
  (is (= {:outcome {:kind "up-to-date" :branch "main" :commit "h"}}
         (operations/pull-task-result "main" {:result :up-to-date :head "h"})))
  (doseq [[result message]
          [[{:result :invalid :head "h" :findings [{:rule :acyclic :ids #{"a"}}]}
            "The head of branch main breaks the rules acyclic, so nothing was pulled."]
           [{:result :stale :head "h" :ids ["a" "b"]}
            "Saves during the pull changed 2 items, so nothing was pulled. Try again."]
           [{:result :rewritten :head "h"}
            "The branch main was rewritten during the pull, so nothing was pulled. Try again."]
           [{:result :refused :head "h" :refused [{:id "a" :reason :place :message "The container is not in scope."}]}
            "The instance refused 1 item (The container is not in scope.), so nothing was pulled."]
           [{:result :base-moved :head "h" :base "b"}
            "Another task moved the base, so nothing was pulled."]
           [{:result :fenced :head "h" :reason {:fenced "cancelled"}}
            "The task ended before the pull applied, so nothing was pulled."]
           [{:result :no-branch}
            "The repository has no branch main."]
           [{:result :disabled}
            "Library branching is not enabled."]]]
    (testing (pr-str result)
      (is (= {:error message} (operations/pull-task-result "main" result))))))

(def ^:private conflicts
  "The conflicts of a merge (`merge/merge`): an update on both sides, a delete on ours, a create on both sides, and an
  item with an unknown base."
  [{:id "a" :base revenue :ours (assoc revenue :name "Mine") :theirs (assoc revenue :name "Theirs")}
   {:id "b" :base revenue :ours nil :theirs (assoc revenue :name "Theirs")}
   {:id "c" :base nil :ours {:kind :snippet :name "Mine"} :theirs {:kind :snippet :name "Theirs"}}
   {:id ["Sample Database" "PUBLIC" "ORDERS"] :base :unknown :ours nil :theirs {:kind :published-table :name "Orders"}}])

(def ^:private conflict-entries
  [{:id "a" :kind "metric" :name "Mine" :ours "updated" :theirs "updated"}
   {:id "b" :kind "metric" :name "Theirs" :ours "deleted" :theirs "updated"}
   {:id "c" :kind "snippet" :name "Mine" :ours "created" :theirs "created"}
   {:id ["Sample Database" "PUBLIC" "ORDERS"] :kind "published-table" :name "Orders" :ours "absent" :theirs "present"}])

(deftest pull-conflicts-task-result-test
  (testing "a pull with conflicts fails, and its outcome lists each conflict with the change of each side"
    (is (= {:error   "The pull has 4 conflicts and 1 violation, so nothing was pulled."
            :outcome {:kind       "conflicts"
                      :branch     "main"
                      :commit     "h"
                      :conflicts  conflict-entries
                      :violations [{:rule "place-inside" :ours "a" :theirs "c"}]}}
           (operations/pull-task-result "main" {:result     :conflicts
                                                :head       "h"
                                                :conflicts  conflicts
                                                :violations [{:rule :place-inside :id "c" :place "a" :ours "a"
                                                              :theirs "c"}]}))))
  (testing "violations only"
    (is (= {:error   "The pull has 0 conflicts and 1 violation, so nothing was pulled."
            :outcome {:kind "conflicts" :branch "main" :commit "h" :conflicts []
                      :violations [{:rule "acyclic" :ours nil :theirs nil}]}}
           (operations/pull-task-result "main" {:result :conflicts :head "h" :conflicts []
                                                :violations [{:rule :acyclic :ids #{"a"} :ours nil :theirs nil}]}))))
  (testing "a switch with conflicts keeps the outcome of the conflicts"
    (is (= {:error   "The pull has 1 conflict and 0 violations, so nothing was pulled."
            :outcome {:kind "conflicts" :branch "dev" :commit "h" :conflicts (subvec conflict-entries 0 1)
                      :violations []}}
           (operations/switch-task-result "dev" {:result :conflicts :head "h" :conflicts (subvec conflicts 0 1)
                                                 :violations []})))))

(deftest discard-task-result-test
  (is (= {:outcome {:kind           "discarded"
                    :branch         "main"
                    :commit         "b"
                    :count          2
                    :discarded      2
                    :trashed        1
                    :trashed_in_use [{:id "x" :kind "metric" :name "Revenue" :users [{:kind "card" :id "u" :name "U"}]}]}}
         (operations/discard-task-result "main" {:result         :discarded
                                                 :base           "b"
                                                 :steps          [{:id "a" :write {} :pre nil}
                                                                  {:id "x" :trash true :pre revenue}]
                                                 :discarded      ["a" "x"]
                                                 :trashed-in-use {"x" [{:kind :card :id "u" :name "U"}]}})))
  (is (= {:outcome {:kind "nothing-to-discard" :branch "main" :commit "b"}}
         (operations/discard-task-result "main" {:result :up-to-date :base "b"})))
  (doseq [[result message]
          [[{:result :no-base} "The instance has no base yet, so it has no changes to discard."]
           [{:result :base-lost :base "b"} "No branch of the repository holds the base b, so nothing was discarded."]
           [{:result :invalid :base "b" :findings [{:rule :acyclic}]}
            "The base b breaks the rules acyclic, so nothing was discarded."]
           [{:result :stale :base "b" :ids ["a"]}
            "Saves during the discard changed 1 item, so nothing was discarded. Try again."]
           [{:result :refused :base "b" :refused [{:id "a" :reason :place :message "The container is not in scope."}]}
            "The instance refused 1 item (The container is not in scope.), so nothing was discarded."]
           [{:result :base-moved :base "b" :actual "c"} "Another task moved the base, so nothing was discarded."]
           [{:result :fenced :base "b" :reason {:fenced "cancelled"}}
            "The task ended before the discard applied, so nothing was discarded."]
           [{:result :disabled} "Library branching is not enabled."]]]
    (testing (pr-str result)
      (is (= {:error message} (operations/discard-task-result "main" result))))))

(deftest merge-branch-task-result-test
  (is (= {:outcome {:kind "merged" :branch "main" :from "dev" :commit "c"}}
         (operations/merge-branch-task-result "main" "dev" {:result :merged :commit "c"})))
  (is (= {:outcome {:kind "up-to-date" :branch "main" :from "dev" :commit "h"}}
         (operations/merge-branch-task-result "main" "dev" {:result :up-to-date :head "h"})))
  (doseq [[result message]
          [[{:result :conflicts :conflicts [{:id "a"}] :violations [] :foreign ["README.md" "x.txt"]}
            "The merge of dev into main has 1 conflict, 0 violations and 2 conflicting files, so nothing was merged."]
           [{:result :invalid :commit "c" :findings [{:rule :kind-fits}]}
            "Commit c breaks the rules kind-fits, so nothing was merged."]
           [{:result :invalid :commit nil :findings [{:rule :kind-fits}]}
            "The merge result breaks the rules kind-fits, so nothing was merged."]
           [{:result :no-branch :ref "dev"}
            "The repository has no branch dev."]
           [{:result :no-merge-base}
            "The branches main and dev have no common commit, so nothing was merged."]
           [{:result :remote-moved :head "x"}
            "The branch main moved during the merge, so nothing was merged. Try again."]
           [{:result :disabled}
            "Library branching is not enabled."]]]
    (testing (pr-str result)
      (is (= {:error message} (operations/merge-branch-task-result "main" "dev" result))))))

;;; -------------------------------------------------- Preconditions --------------------------------------------------

(defn- start [f]
  (try
    (f)
    :started
    (catch clojure.lang.ExceptionInfo e
      {:status-code (:status-code (ex-data e)) :message (ex-message e)})))

(deftest start-preconditions-test
  (with-remote [repo url]
    (rtu/remote-with-branches! repo ["main"])
    (tasks.tu/with-no-tasks
      (doseq [[op f] [[:push #(operations/start-push! nil nil)]
                      [:pull #(operations/start-pull! nil)]
                      [:merge-branch #(operations/start-merge-branch! nil nil "dev")]
                      [:discard #(operations/start-discard! nil)]]]
        (testing op
          (testing "library branching is off"
            (mt/with-temporary-setting-values [library-branching-enabled false]
              (with-settings {:remote-sync-url url :remote-sync-branch "main"}
                (is (= {:status-code 400 :message "Library branching is not enabled."} (start f))))))
          (mt/with-temporary-setting-values [library-branching-enabled true]
            (testing "no repository"
              (with-settings {}
                (is (= {:status-code 400 :message "Library branching is not configured."} (start f)))))
            (testing "a read-only instance"
              (with-settings {:remote-sync-url url :remote-sync-branch "main" :remote-sync-type :read-only}
                (is (= {:status-code 400
                        :message     "Push, pull, merge-branch and the branch operations are only allowed when remote-sync-type is read-write."}
                       (start f)))))
            (testing "a task runs"
              (with-settings {:remote-sync-url url :remote-sync-branch "main"}
                (let [running (tasks/start! "pull" nil)]
                  (is (= {:status-code 400 :message "Library branching task in progress"} (start f)))
                  (tasks/cancel! (:id running)))))
            (testing "no task row for a refused start"
              (is (every? #{"cancelled"} (map :status (t2/query {:select [:status] :from [:library_branching_task]})))))))))))

;;; ---------------------------------------------- Workers on the app DB ----------------------------------------------

(defn- run-task!
  "Starts a task of `kind`, runs `(work id)` as its worker, and returns the ended task."
  [kind work]
  (let [{:keys [id]} (tasks/start! kind (mt/user->id :crowberto))]
    (tasks/run-task! id work)))

(defn- remote-snapshot
  "The snapshot of `commit` of branch `branch` of the configured repository."
  [branch commit]
  (repository/do-with-store (fn [s]
                              (store/head s branch)
                              (ptu/commit-snapshot s commit))))

(deftest workers-on-the-app-db-test
  (testing (str "a push, a pull and a merge-branch, each as the worker of its task; app DB " (mdb/db-type))
    (with-remote [repo url]
      (with-settings {:remote-sync-url url :remote-sync-branch "main"}
        (rtu/do-with-library-metric!
         (fn [metric]
           (let [pushed (run-task! "push" #(operations/push-task! % "main" "First push"))
                 c1     (get-in pushed [:outcome :commit])
                 base   (remote-snapshot "main" c1)]
             (testing "the push landed, and the base is its commit, keyed by the URL"
               (is (=? {:status "successful" :outcome {:kind "pushed" :branch "main" :commit string?}} pushed))
               (is (= c1 (instance/base (operations/instance))))
               (is (= c1 (:commit_id (t2/query-one {:select [:commit_id :url] :from [:library_branching_base]}))))
               (is (= url (:url (t2/query-one {:select [:url] :from [:library_branching_base]}))))
               (is (contains? base (:entity_id metric))))
             (testing "a pull with no remote change is up to date"
               (is (=? {:status "successful" :outcome {:kind "up-to-date" :commit c1}}
                       (run-task! "pull" #(operations/pull-task! % "main")))))
             (let [h1 (pltu/commit-snapshot! repo "main" [c1] (ptu/renamed base (:entity_id metric) "After"))]
               (testing "a pull whose task ended before the apply writes nothing"
                 (let [{:keys [id]} (tasks/start! "pull" nil)]
                   (tasks/cancel! id)
                   (is (= {:error "The task ended before the pull applied, so nothing was pulled."}
                          (operations/pull-task! id "main")))
                   (is (= "Before" (t2/select-one-fn :name :model/Card (:id metric))))
                   (is (= c1 (instance/base (operations/instance))))
                   (is (= "cancelled" (:status (tasks/task id))))))
               (testing "a pull applies the remote change"
                 (is (=? {:status "successful" :outcome {:kind "pulled" :commit h1 :count 1}}
                         (run-task! "pull" #(operations/pull-task! % "main"))))
                 (is (= "After" (t2/select-one-fn :name :model/Card (:id metric))))
                 (is (= h1 (instance/base (operations/instance)))))
               (testing "a merge of a branch into the configured branch"
                 (let [d1 (pltu/commit-snapshot! repo "dev" [h1] (ptu/renamed base (:entity_id metric) "From dev"))
                       merged (run-task! "merge-branch" #(operations/merge-branch-task! % "main" "dev"))]
                   (is (=? {:status "successful" :outcome {:kind "merged" :branch "main" :from "dev" :commit string?}}
                           merged))
                   (is (= [h1 d1] (ptu/commit-parents repo (get-in merged [:outcome :commit]))))
                   (is (= "From dev" (get-in (remote-snapshot "main" (get-in merged [:outcome :commit]))
                                             [(:entity_id metric) :name])))))))))))))

(defn- card-of [id]
  (t2/select-one [:model/Card :name :archived] :id id))

(deftest discard-on-the-app-db-test
  (testing (str "a discard of the local changes, as the worker of its task; app DB " (mdb/db-type))
    (with-remote [_repo url]
      (with-settings {:remote-sync-url url :remote-sync-branch "main"}
        (rtu/do-with-library-metric!
         (fn [metric]
           (let [discard! #(run-task! "discard-changes" (fn [id] (operations/discard-task! id "main")))]
             (testing "with no base, there is nothing to discard"
               (is (=? {:status "failed" :error_message "The instance has no base yet, so it has no changes to discard."}
                       (discard!))))
             (let [c1      (get-in (run-task! "push" #(operations/push-task! % "main" "First push")) [:outcome :commit])
                   created (atom nil)]
               (try
                 (testing "with no local change, there is nothing to discard"
                   (is (=? {:status "successful" :outcome {:kind "nothing-to-discard" :branch "main" :commit c1}}
                           (discard!))))
                 (t2/update! :model/Card (:id metric) {:name "Local"})
                 (reset! created (t2/insert-returning-instance! :model/Card
                                                                (-> (select-keys metric [:type :collection_id :creator_id
                                                                                         :display :visualization_settings
                                                                                         :dataset_query])
                                                                    (assoc :name "Created"))))
                 (testing "a discard whose task ended before the apply writes nothing"
                   (let [{:keys [id]} (tasks/start! "discard-changes" nil)]
                     (tasks/cancel! id)
                     (is (= {:error "The task ended before the discard applied, so nothing was discarded."}
                            (operations/discard-task! id "main")))
                     (is (= {:name "Local" :archived false} (into {} (card-of (:id metric)))))
                     (is (= {:name "Created" :archived false} (into {} (card-of (:id @created)))))
                     (is (= "cancelled" (:status (tasks/task id))))))
                 (testing "a discard writes the base content over an update, and trashes a create; the base stays"
                   (is (=? {:status  "successful"
                            :outcome {:kind "discarded" :branch "main" :commit c1 :count 2 :discarded 2 :trashed 0
                                      :trashed_in_use []}}
                           (discard!)))
                   (is (= {:name "Before" :archived false} (into {} (card-of (:id metric)))))
                   (is (= {:name "Created" :archived true} (into {} (card-of (:id @created)))))
                   (is (= c1 (instance/base (operations/instance)))))
                 (testing "a discard restores an item that the instance moved to the trash"
                   (t2/update! :model/Card (:id metric) {:archived true})
                   (is (=? {:status "successful" :outcome {:kind "discarded" :count 1 :discarded 1}} (discard!)))
                   (is (= {:name "Before" :archived false} (into {} (card-of (:id metric))))))
                 (finally
                   (when-let [{:keys [id]} @created]
                     (t2/delete! :model/Card :id id))))))))))))

;;; ------------------------------------------------- Branch operations -------------------------------------------------

(defn- remote-head
  "The head of branch `branch` of the configured repository, or nil."
  [branch]
  (repository/do-with-store #(store/head % branch)))

(defn- remote-branches []
  (repository/do-with-store store/branches))

(deftest branch-operations-refuse-at-the-start-test
  (with-remote [repo url]
    (rtu/remote-with-branches! repo ["main"])
    (tasks.tu/with-no-tasks
      (mt/with-temporary-setting-values [library-branching-enabled true]
        (with-settings {:remote-sync-url url :remote-sync-branch "main"}
          (doseq [[op f] [[:create-branch #(operations/start-create-branch! nil "feature" nil)]
                          [:switch #(operations/start-switch! nil "dev")]
                          [:push-to-a-new-branch #(operations/start-push! nil nil "stash")]]]
            (testing op
              (testing "while a task runs: the branch setting and the remote stay, and no task starts"
                (let [running (tasks/start! "pull" nil)]
                  (is (= {:status-code 400 :message "Library branching task in progress"} (start f)))
                  (is (= "main" (repository/branch)))
                  (is (= #{"main"} (remote-branches)))
                  (is (= running (tasks/newest-task)))
                  (tasks/cancel! (:id running))))
              (testing "a read-only instance"
                (with-settings {:remote-sync-url url :remote-sync-branch "main" :remote-sync-type :read-only}
                  (is (= {:status-code 400
                          :message     "Push, pull, merge-branch and the branch operations are only allowed when remote-sync-type is read-write."}
                         (start f)))))
              (testing "a branch from an environment variable does not change"
                (mt/with-temp-env-var-value! [mb-remote-sync-branch "main"]
                  (is (= {:status-code 400
                          :message     "The branch comes from the environment variable MB_REMOTE_SYNC_BRANCH, so it does not change."}
                         (start f))))))))))))

(deftest create-branch-names-a-valid-branch-test
  (with-remote [repo url]
    (rtu/remote-with-branches! repo ["main"])
    (tasks.tu/with-no-tasks
      (mt/with-temporary-setting-values [library-branching-enabled true]
        (with-settings {:remote-sync-url url :remote-sync-branch "main"}
          (doseq [bad ["has space" "a..b" "ends/" "-x/../y"]]
            (testing (pr-str bad)
              (is (= {:status-code 400 :message (str "The name " bad " is not a valid branch name.")}
                     (start #(operations/start-create-branch! nil bad nil))))))
          (is (nil? (tasks/newest-task))))))))

(deftest branch-operations-on-the-app-db-test
  (testing (str "create a branch, push to a new branch and switch, each as the worker of its task; app DB " (mdb/db-type))
    (with-remote [repo url]
      (with-settings {:remote-sync-url url :remote-sync-branch "main"}
        (rtu/do-with-library-metric!
         (fn [metric]
           (let [eid    (:entity_id metric)
                 pushed (run-task! "push" #(operations/push-task! % "main" "First push"))
                 c1     (get-in pushed [:outcome :commit])]
             (testing "create a branch from main: it starts at the head of main, the instance uses it, and its base
                      stays"
               (is (=? {:status "successful" :outcome {:kind "branch-created" :branch "feature" :from "main" :commit c1}}
                       (run-task! "branch-create" #(operations/create-branch-task! % "feature" "main"))))
               (is (= c1 (remote-head "feature")))
               (is (= "feature" (repository/branch)))
               (is (= c1 (instance/base (operations/instance)))))
             (testing "a branch that exists is not created again, and the branch setting stays"
               (is (=? {:status "failed" :error_message "The repository already has a branch main."}
                       (run-task! "branch-create" #(operations/create-branch-task! % "main" "feature"))))
               (is (= "feature" (repository/branch))))
             (testing "push to a new branch: the new branch holds the local change, and the instance uses it with that
                      commit as its base"
               (t2/update! :model/Card (:id metric) {:name "Stashed"})
               (let [stashed (run-task! "push" #(operations/push-task! % "stash" "Stash message" {:new-branch? true}))
                     s1      (get-in stashed [:outcome :commit])]
                 (is (=? {:status "successful" :outcome {:kind "pushed" :branch "stash" :commit string?}} stashed))
                 (is (= s1 (remote-head "stash")))
                 (is (= [c1] (ptu/commit-parents repo s1)))
                 (is (= "Stashed" (get-in (remote-snapshot "stash" s1) [eid :name])))
                 (is (= c1 (remote-head "feature")))
                 (is (= "stash" (repository/branch)))
                 (is (= s1 (instance/base (operations/instance))))
                 (let [m1 (pltu/commit-snapshot! repo "main" [c1] (ptu/renamed (remote-snapshot "main" c1) eid "From main"))]
                   (testing "a switch to a branch that does not exist fails, and the branch setting stays"
                     (is (=? {:status "failed" :error_message "The repository has no branch nope."}
                             (run-task! "branch-switch" #(operations/switch-task! % "nope"))))
                     (is (= "stash" (repository/branch)))
                     (is (= s1 (instance/base (operations/instance)))))
                   (testing "a switch with a conflict fails, writes nothing, and the branch setting stays; the task
                            lists the conflict"
                     (t2/update! :model/Card (:id metric) {:name "Local"})
                     (is (=? {:status        "failed"
                              :error_message "The pull has 1 conflict and 0 violations, so nothing was pulled."
                              :outcome       {:kind      "conflicts"
                                              :branch    "main"
                                              :commit    m1
                                              :conflicts [{:id eid :kind "metric" :name "Local" :ours "updated"
                                                           :theirs "updated"}]}}
                             (run-task! "branch-switch" #(operations/switch-task! % "main"))))
                     (is (= "Local" (t2/select-one-fn :name :model/Card (:id metric))))
                     (is (= "stash" (repository/branch)))
                     (is (= s1 (instance/base (operations/instance)))))
                   (testing "a switch that applies: the base held by the old branch merges three ways, and the branch
                            setting changes with the base"
                     (t2/update! :model/Card (:id metric) {:name "Stashed"})
                     (is (=? {:status "successful" :outcome {:kind "switched" :branch "main" :commit m1 :count 1}}
                             (run-task! "branch-switch" #(operations/switch-task! % "main"))))
                     (is (= "From main" (t2/select-one-fn :name :model/Card (:id metric))))
                     (is (= "main" (repository/branch)))
                     (is (= m1 (instance/base (operations/instance)))))
                   (testing "a switch to a branch at the base changes only the branch setting"
                     (is (=? {:status "successful" :outcome {:kind "branch-created" :commit m1}}
                             (run-task! "branch-create" #(operations/create-branch-task! % "next" "main"))))
                     (is (= "next" (repository/branch)))
                     (is (=? {:status "successful" :outcome {:kind "switched" :branch "main" :commit m1}}
                             (run-task! "branch-switch" #(operations/switch-task! % "main"))))
                     (is (= "main" (repository/branch)))
                     (is (= m1 (instance/base (operations/instance)))))
                   (testing "a switch whose task ended before it applied writes nothing, and the branch setting stays"
                     (pltu/commit-snapshot! repo "feature" [c1] (ptu/renamed (remote-snapshot "main" c1) eid "Feature"))
                     (let [{:keys [id]} (tasks/start! "branch-switch" nil)]
                       (tasks/cancel! id)
                       (is (= {:error "The task ended before the pull applied, so nothing was pulled."}
                              (operations/switch-task! id "feature")))
                       (is (= "From main" (t2/select-one-fn :name :model/Card (:id metric))))
                       (is (= "main" (repository/branch)))
                       (is (= "cancelled" (:status (tasks/task id))))))))))))))))
