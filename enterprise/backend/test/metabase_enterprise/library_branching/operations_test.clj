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
  (is (= {:error "Library branching is not enabled."}
         (operations/push-task-result "main" {:result :disabled}))))

(deftest pull-task-result-test
  (is (= {:outcome {:kind "pulled" :branch "main" :commit "h" :count 2 :trashed 1}}
         (operations/pull-task-result "main" {:result         :pulled
                                              :head           "h"
                                              :steps          [{:id "a" :write {}} {:id "a" :link #{}} {:id "b" :trash true}]
                                              :trashed-in-use {"b" [{:kind :card :id "x" :name "X"}]}})))
  (is (= {:outcome {:kind "up-to-date" :branch "main" :commit "h"}}
         (operations/pull-task-result "main" {:result :up-to-date :head "h"})))
  (doseq [[result message]
          [[{:result :invalid :head "h" :findings [{:rule :acyclic :ids #{"a"}}]}
            "The head of branch main breaks the rules acyclic, so nothing was pulled."]
           [{:result :conflicts :head "h" :conflicts [{:id "a"} {:id "b"}] :violations [{:rule :acyclic}]}
            "The pull has 2 conflicts and 1 violation, so nothing was pulled."]
           [{:result :conflicts :head "h" :conflicts [{:id "a"}] :violations []}
            "The pull has 1 conflict and 0 violations, so nothing was pulled."]
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
                      [:merge-branch #(operations/start-merge-branch! nil nil "dev")]]]
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
                        :message     "Push, pull and merge-branch are only allowed when remote-sync-type is read-write."}
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
