(ns metabase-enterprise.library-branching.progress-test
  "The progress of the operations as tasks: each operation reports the start of each of its phases (read, plan, apply,
  commit) as a checkpoint, one app-DB write per phase, and a report on an ended task stops the operation at that phase.
  The workers read at read points of their own, so these tests commit their content and delete it afterwards; they
  change the one base row and the task rows of the app DB, so they are not parallel."
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.repository-test-util/with-remote clojure.core/fn}}}
  (:require
   [clojure.test :refer :all]
   ;; loads the settings of remote sync, which library branching reuses
   [metabase-enterprise.core.init]
   [metabase-enterprise.library-branching.api]
   [metabase-enterprise.library-branching.engine.merge :as merge]
   [metabase-enterprise.library-branching.engine.plan :as plan]
   [metabase-enterprise.library-branching.operations :as operations]
   [metabase-enterprise.library-branching.pull-test-util :as pltu]
   [metabase-enterprise.library-branching.push-test-util :as ptu]
   [metabase-enterprise.library-branching.repository :as repository]
   [metabase-enterprise.library-branching.repository-test-util :as rtu :refer [with-remote with-settings]]
   [metabase-enterprise.library-branching.store :as store]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def ^:private wait-ms
  "The longest time that a test waits for a worker on another thread."
  60000)

(defn- run-task!
  "Starts a task of `kind`, runs `(work id)` as its worker on this thread, and returns the ended task."
  [kind work]
  (let [{:keys [id]} (tasks/start! kind (mt/user->id :crowberto))]
    (tasks/run-task! id work)))

(defn- recording!
  "`[(f) fractions]`: `fractions` are the fractions that `tasks/report-progress!` wrote during `(f)`, in order."
  [f]
  (let [written  (atom [])
        original (dynamic-redefs/original-fn #'tasks/report-progress!)]
    (dynamic-redefs/with-dynamic-fn-redefs
      [tasks/report-progress! (fn [id fraction]
                                (swap! written conj (double fraction))
                                (original id fraction))]
      [(f) @written])))

(defn- remote-snapshot
  "The snapshot of `commit` of branch `branch` of the configured repository."
  [branch commit]
  (repository/do-with-store (fn [s]
                              (store/head s branch)
                              (ptu/commit-snapshot s commit))))

(defn- remote-head
  "The head of branch `branch` of the configured repository, or nil."
  [branch]
  (repository/do-with-store #(store/head % branch)))

(defn- holding
  "A replacement of the function of var `v` that delivers `reached`, waits for `release`, then calls the original."
  [v reached release]
  (let [original (dynamic-redefs/original-fn v)]
    (fn [& args]
      (deliver reached true)
      (deref release wait-ms nil)
      (apply original args))))

;;; ------------------------------------------------- Phases in order -------------------------------------------------

(deftest operations-report-their-phases-test
  (testing (str "each operation reports the start of each of its phases, in order, as a checkpoint, and ends at 1;
                app DB " (mdb/db-type))
    (with-remote [repo url]
      (with-settings {:remote-sync-url url :remote-sync-branch "main"}
        (rtu/do-with-library-metric!
         (fn [metric]
           (let [eid                (:entity_id metric)
                 [pushed fractions] (recording! #(run-task! "push" (fn [id] (operations/push-task! id "main" "First"))))
                 c1                 (get-in pushed [:outcome :commit])]
             (testing "a push: read, plan, apply (the commit object) and commit (the commit point)"
               (is (=? {:status "successful" :outcome {:kind "pushed"} :progress 1.0} pushed))
               (is (= [0.0 0.25 0.5 0.75] fractions)))
             (testing "a pull with no remote change only reads"
               (let [[pulled fractions] (recording! #(run-task! "pull" (fn [id] (operations/pull-task! id "main"))))]
                 (is (=? {:status "successful" :outcome {:kind "up-to-date"} :progress 1.0} pulled))
                 (is (= [0.0] fractions))))
             (let [h1 (pltu/commit-snapshot! repo "main" [c1] (ptu/renamed (remote-snapshot "main" c1) eid "After"))]
               (testing "a pull: read, plan and apply; the apply commits in its transaction"
                 (let [[pulled fractions] (recording! #(run-task! "pull" (fn [id] (operations/pull-task! id "main"))))]
                   (is (=? {:status "successful" :outcome {:kind "pulled" :count 1} :progress 1.0} pulled))
                   (is (= [0.0 0.25 0.5] fractions))))
               (let [d1 (pltu/commit-snapshot! repo "dev" [h1] (ptu/renamed (remote-snapshot "main" h1) eid "From dev"))]
                 (testing "a merge-branch: read, plan, apply (the commit object) and commit (the move of the branch)"
                   (let [[merged fractions] (recording! #(run-task! "merge-branch"
                                                                    (fn [id] (operations/merge-branch-task! id "main" "dev"))))]
                     (is (=? {:status "successful" :outcome {:kind "merged"} :progress 1.0} merged))
                     (is (= [0.0 0.25 0.5 0.75] fractions))))
                 (testing "a switch is the pull of the other branch"
                   (let [[switched fractions] (recording! #(run-task! "branch-switch"
                                                                      (fn [id] (operations/switch-task! id "dev"))))]
                     (is (=? {:status "successful" :outcome {:kind "switched" :commit d1 :count 1} :progress 1.0}
                             switched))
                     (is (= [0.0 0.25 0.5] fractions))))
                 (testing "a discard: read, plan and apply"
                   (t2/update! :model/Card (:id metric) {:name "Local"})
                   (let [[discarded fractions] (recording! #(run-task! "discard-changes"
                                                                       (fn [id] (operations/discard-task! id "dev"))))]
                     (is (=? {:status "successful" :outcome {:kind "discarded" :count 1} :progress 1.0} discarded))
                     (is (= [0.0 0.25 0.5] fractions))))
                 (testing "a deploy: read, plan and apply"
                   (pltu/commit-snapshot! repo "dev" [d1] (ptu/renamed (remote-snapshot "dev" d1) eid "Deployed"))
                   (mt/with-temporary-setting-values [remote-sync-type :read-only]
                     (let [[deployed fractions] (recording! #(run-task! "deploy"
                                                                        (fn [id] (operations/deploy-task! id "dev"))))]
                       (is (=? {:status "successful" :outcome {:kind "deployed" :count 1} :progress 1.0} deployed))
                       (is (= [0.0 0.25 0.5] fractions))))
                   (is (= "Deployed" (t2/select-one-fn :name :model/Card (:id metric))))))))))))))

;;; ------------------------------------------------ The current task -------------------------------------------------

(deftest pull-progress-shows-on-current-task-test
  (testing (str "a pull that waits between its phases shows a progress above 0 and below 1 on GET /current-task;
                app DB " (mdb/db-type))
    (mt/with-premium-features #{:remote-sync}
      (with-remote [repo url]
        (with-settings {:remote-sync-url url :remote-sync-branch "main"}
          (rtu/do-with-library-metric!
           (fn [metric]
             (let [c1      (get-in (run-task! "push" #(operations/push-task! % "main" "First")) [:outcome :commit])
                   _       (pltu/commit-snapshot! repo "main" [c1]
                                                  (ptu/renamed (remote-snapshot "main" c1) (:entity_id metric) "After"))
                   reached (promise)
                   release (promise)]
               (dynamic-redefs/with-dynamic-fn-redefs [plan/plan (holding #'plan/plan reached release)]
                 (let [{:keys [id]} (tasks/start! "pull" (mt/user->id :crowberto))
                       worker       (future (tasks/run-task! id #(operations/pull-task! % "main")))]
                   (try
                     (is (true? (deref reached wait-ms false)))
                     (is (=? {:id id :status "running" :progress #(< 0 % 1)}
                             (mt/user-http-request :crowberto :get 200 "ee/library-branching/current-task")))
                     (finally
                       (deliver release true)))
                   (is (=? {:status "successful" :outcome {:kind "pulled"} :progress 1.0} (deref worker wait-ms nil)))
                   (is (= "After" (t2/select-one-fn :name :model/Card (:id metric))))))))))))))

;;; ------------------------------------------------- Stop at a phase -------------------------------------------------

(deftest cancel-between-phases-stops-a-merge-branch-test
  (testing (str "a cancel of a merge-branch between its phases stops it at the next phase: the branch does not move;
                app DB " (mdb/db-type))
    (with-remote [repo url]
      (with-settings {:remote-sync-url url :remote-sync-branch "main"}
        (rtu/do-with-library-metric!
         (fn [metric]
           (let [c1      (get-in (run-task! "push" #(operations/push-task! % "main" "First")) [:outcome :commit])
                 _       (pltu/commit-snapshot! repo "dev" [c1]
                                                (ptu/renamed (remote-snapshot "main" c1) (:entity_id metric) "From dev"))
                 reached (promise)
                 release (promise)]
             (dynamic-redefs/with-dynamic-fn-redefs [merge/merge (holding #'merge/merge reached release)]
               (let [{:keys [id]} (tasks/start! "merge-branch" (mt/user->id :crowberto))
                     worker       (future (tasks/run-task! id #(operations/merge-branch-task! % "main" "dev")))]
                 (try
                   (is (true? (deref reached wait-ms false)))
                   (is (=? {:ok {:status "cancelled"}} (tasks/cancel! id)))
                   (finally
                     (deliver release true)))
                 (is (=? {:status "cancelled" :error_message "Task cancelled"} (deref worker wait-ms nil)))
                 (is (= c1 (remote-head "main"))))))))))))
