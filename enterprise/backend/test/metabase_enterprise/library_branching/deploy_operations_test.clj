(ns metabase-enterprise.library-branching.deploy-operations-test
  "The deploy as a task on the configured repository and the app DB instance: its start on a consumption instance
  only, its worker, its route, the deploy that a save of the settings starts, and the first deploy at boot. The
  workers read at read points of their own, so these tests commit their content and delete it afterwards; they change
  the one base row and the task rows of the app DB, so they are not parallel."
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.repository-test-util/with-remote clojure.core/fn}}}
  (:require
   [clojure.test :refer :all]
   ;; loads the settings of remote sync, which library branching reuses
   [metabase-enterprise.core.init]
   [metabase-enterprise.library-branching.api]
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
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;;; --------------------------------------------------- Task results ---------------------------------------------------

(deftest deploy-task-result-test
  (is (= {:outcome {:kind "deployed" :branch "main" :commit "h" :count 2 :trashed 1}}
         (operations/deploy-task-result "main" {:result         :deployed
                                                :head           "h"
                                                :steps          [{:id "a" :write {}} {:id "a" :link #{}} {:id "b" :trash true}]
                                                :trashed-in-use {"b" [{:kind :card :id "x" :name "X"}]}})))
  (is (= {:outcome {:kind "up-to-date" :branch "main" :commit "h"}}
         (operations/deploy-task-result "main" {:result :up-to-date :head "h"})))
  (doseq [[result message]
          [[{:result :invalid :head "h" :findings [{:rule :env-resolves :id "a"} {:rule :acyclic :ids #{"b"}}]}
            "The head of branch main breaks the rules acyclic, env-resolves, so nothing was deployed."]
           [{:result :invalid :head "h" :findings [{:type :no-format :reason "The tree has no format version file."}]}
            "The head of branch main breaks the rules no-format, so nothing was deployed."]
           [{:result :drift :head "h" :ids ["a" "b"]}
            "This read-only instance has 2 changed items that no commit holds, so nothing was deployed."]
           [{:result :drift :head "h" :ids ["a"]}
            "This read-only instance has 1 changed item that no commit holds, so nothing was deployed."]
           [{:result :stale :head "h" :ids ["a"]}
            "Saves during the deploy changed 1 item, so nothing was deployed. Try again."]
           [{:result :rewritten :head "h"}
            "The branch main was rewritten during the deploy, so nothing was deployed. Try again."]
           [{:result :refused :head "h" :refused [{:id "a" :reason :place :message "The container is not in scope."}]}
            "The instance refused 1 item (The container is not in scope.), so nothing was deployed."]
           [{:result :base-moved :head "h" :base "b"}
            "Another task moved the base, so nothing was deployed."]
           [{:result :fenced :head "h" :reason {:fenced "cancelled"}}
            "The task ended before the deploy applied, so nothing was deployed."]
           [{:result :no-branch}
            "The repository has no branch main."]
           [{:result :disabled}
            "Library branching is not enabled."]]]
    (testing (pr-str result)
      (is (= {:error message} (operations/deploy-task-result "main" result))))))

;;; -------------------------------------------------- Preconditions ---------------------------------------------------

(defn- start [f]
  (try
    (f)
    :started
    (catch clojure.lang.ExceptionInfo e
      {:status-code (:status-code (ex-data e)) :message (ex-message e)})))

(deftest start-deploy-preconditions-test
  (with-remote [repo url]
    (rtu/remote-with-branches! repo ["main"])
    (tasks.tu/with-no-tasks
      (testing "library branching is off"
        (mt/with-temporary-setting-values [library-branching-enabled false]
          (with-settings {:remote-sync-url url :remote-sync-branch "main" :remote-sync-type :read-only}
            (is (= {:status-code 400 :message "Library branching is not enabled."}
                   (start #(operations/start-deploy! nil)))))))
      (mt/with-temporary-setting-values [library-branching-enabled true]
        (testing "no repository"
          (with-settings {:remote-sync-type :read-only}
            (is (= {:status-code 400 :message "Library branching is not configured."}
                   (start #(operations/start-deploy! nil))))))
        (testing "a creation instance does not deploy"
          (with-settings {:remote-sync-url url :remote-sync-branch "main"}
            (is (= {:status-code 400 :message "Deploy is only allowed when remote-sync-type is read-only."}
                   (start #(operations/start-deploy! nil))))))
        (testing "a task runs"
          (with-settings {:remote-sync-url url :remote-sync-branch "main" :remote-sync-type :read-only}
            (let [running (tasks/start! "pull" nil)]
              (is (= {:status-code 400 :message "Library branching task in progress"}
                     (start #(operations/start-deploy! nil))))
              (tasks/cancel! (:id running)))))
        (testing "no task row for a refused start"
          (is (every? #{"cancelled"} (map :status (t2/query {:select [:status] :from [:library_branching_task]})))))))))

;;; ---------------------------------------------- The worker on the app DB --------------------------------------------

(defn- reset-base! []
  (t2/query {:update :library_branching_base :set {:commit_id nil :digests nil} :where [:= :id 1]}))

(defn- children-location
  [{:keys [id location]}]
  (str location id "/"))

(defn- sum-query []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :venues :price)))))))

(defn- metric-query
  [card-id]
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate (lib.metadata/metric mp card-id)))))

(defn- do-with-library-metrics!
  "Calls `(f m)` with committed rows: two metrics `:kept` and `:removed` in a metrics collection `:metrics` of the
  Library, and a question `:outside` outside the Library that uses `:removed`. Library branching is on, with no task
  row and no base. Deletes the rows that it inserted afterwards, and clears the base."
  [f]
  (let [rows    (atom ())
        insert! (fn [model row]
                  (let [inserted (t2/insert-returning-instance! model row)]
                    (swap! rows conj [model inserted])
                    inserted))
        metric  (fn [collection metric-name]
                  (insert! :model/Card {:name                   metric-name
                                        :type                   :metric
                                        :collection_id          (:id collection)
                                        :creator_id             (mt/user->id :crowberto)
                                        :display                :scalar
                                        :visualization_settings {}
                                        :dataset_query          (sum-query)}))]
    (reset-base!)
    (tasks.tu/with-no-tasks
      (try
        (mt/with-temporary-setting-values [library-branching-enabled true]
          (let [library (or (t2/select-one :model/Collection :type "library" :archived false)
                            (insert! :model/Collection {:name "Library" :type "library" :location "/"}))
                metrics (insert! :model/Collection {:name     "Deploy metrics"
                                                    :type     "library-metrics"
                                                    :location (children-location library)})
                kept    (metric metrics "Before")
                removed (metric metrics "Removed")
                outside (insert! :model/Card {:name                   "Outside question"
                                              :type                   :question
                                              :display                :table
                                              :creator_id             (mt/user->id :crowberto)
                                              :visualization_settings {}
                                              :dataset_query          (metric-query (:id removed))})]
            (f {:metrics metrics :kept kept :removed removed :outside outside})))
        (finally
          (doseq [[model row] @rows]
            (t2/delete! model :id (:id row)))
          (reset-base!))))))

(defn- run-task!
  "Starts a task of `kind`, runs `(work id)` as its worker, and returns the ended task."
  [kind work]
  (let [{:keys [id]} (tasks/start! kind (mt/user->id :crowberto))]
    (tasks/run-task! id work)))

(defn- remote-snapshot
  [commit]
  (repository/do-with-store (fn [s]
                              (store/head s "main")
                              (ptu/commit-snapshot s commit))))

(deftest deploy-worker-on-the-app-db-test
  (testing (str "deploys on a consumption instance, each as the worker of its task; app DB " (mdb/db-type))
    (with-remote [repo url]
      (with-settings {:remote-sync-url url :remote-sync-branch "main"}
        (do-with-library-metrics!
         (fn [{:keys [metrics kept removed outside]}]
           ;; a sandbox pushed this content to main; this instance holds the same content, and has no base yet
           (let [c1   (get-in (run-task! "push" #(operations/push-task! % "main" "From a sandbox")) [:outcome :commit])
                 base (remote-snapshot c1)]
             (reset-base!)
             (mt/with-temporary-setting-values [remote-sync-type :read-only]
               (testing "the first deploy: the local content equals the head, so it writes nothing and takes the base"
                 (is (=? {:status "successful" :outcome {:kind "deployed" :commit c1 :count 0}}
                         (run-task! "deploy" #(operations/deploy-task! % "main"))))
                 (is (= c1 (instance/base (operations/instance)))))
               (let [h1 (pltu/commit-snapshot! repo "main" [c1] (-> base
                                                                    (ptu/renamed (:entity_id kept) "After")
                                                                    (dissoc (:entity_id removed))))]
                 (testing "main renames a metric and removes the one that a question outside the Library uses"
                   (is (=? {:status "successful" :outcome {:kind "deployed" :commit h1 :count 2 :trashed 1}}
                           (run-task! "deploy" #(operations/deploy-task! % "main"))))
                   (is (= "After" (t2/select-one-fn :name :model/Card (:id kept))))
                   (is (true? (t2/select-one-fn :archived :model/Card (:id removed))))
                   (is (= h1 (instance/base (operations/instance)))))
                 (testing "the outside question still runs"
                   (is (= :completed (:status (mt/process-query (t2/select-one-fn :dataset_query :model/Card (:id outside)))))))
                 (testing "a change that no commit holds stops the deploy, and stays"
                   (t2/update! :model/Card (:id kept) {:name "Script"})
                   (pltu/commit-snapshot! repo "main" [h1] (-> base
                                                               (ptu/renamed (:entity_id kept) "Later")
                                                               (dissoc (:entity_id removed))))
                   (is (=? {:status        "failed"
                            :error_message "This read-only instance has 1 changed item that no commit holds, so nothing was deployed."}
                           (run-task! "deploy" #(operations/deploy-task! % "main"))))
                   (is (= "Script" (t2/select-one-fn :name :model/Card (:id kept))))
                   (is (= h1 (instance/base (operations/instance))))
                   (t2/update! :model/Card (:id kept) {:name "After"}))
                 (testing "a head that names a table that this instance does not have is not deployed"
                   (let [missing ["test-data" "PUBLIC" "NO_SUCH_TABLE"]
                         new-id  "lbDeployMissingTable1"]
                     (pltu/commit-snapshot! repo "main" [(ptu/remote-head repo)]
                                            (assoc base new-id (ptu/item new-id :metric "Missing" (:entity_id metrics)
                                                                         {:display "scalar" :query (ptu/count-query missing)})))
                     (is (=? {:status        "failed"
                              :error_message "The head of branch main breaks the rules env-resolves, so nothing was deployed."}
                             (run-task! "deploy" #(operations/deploy-task! % "main"))))
                     (is (not (t2/exists? :model/Card :entity_id new-id)))
                     (is (= h1 (instance/base (operations/instance)))))))))))))))

;;; ------------------------------------------------------- Routes -----------------------------------------------------

(deftest deploy-route-test
  (mt/with-premium-features #{:remote-sync}
    (with-remote [repo url]
      (rtu/remote-with-branches! repo ["main"])
      (tasks.tu/with-no-tasks
        (mt/with-temporary-setting-values [library-branching-enabled true]
          (rtu/with-synchronous-tasks
            (testing "a consumption instance deploys through the route"
              (with-settings {:remote-sync-url url :remote-sync-branch "main" :remote-sync-type :read-only}
                (let [{:keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/library-branching/deploy" {})]
                  (is (=? {:id task_id :task_type "deploy" :initiated_by (mt/user->id :crowberto)} (tasks/task task_id)))
                  (is (tasks/ended-statuses (:status (tasks/task task_id)))))))
            (testing "a creation instance does not deploy"
              (with-settings {:remote-sync-url url :remote-sync-branch "main"}
                (is (= "Deploy is only allowed when remote-sync-type is read-only."
                       (mt/user-http-request :crowberto :post 400 "ee/library-branching/deploy" {})))))
            (testing "a push and a pull are refused on a consumption instance"
              (with-settings {:remote-sync-url url :remote-sync-branch "main" :remote-sync-type :read-only}
                (is (= "Push, pull, merge-branch and the branch operations are only allowed when remote-sync-type is read-write."
                       (mt/user-http-request :crowberto :post 400 "ee/library-branching/pull" {})))))))))))

(deftest settings-save-on-a-consumption-instance-starts-a-deploy-test
  (mt/with-premium-features #{:remote-sync}
    (with-remote [repo url]
      (rtu/remote-with-branches! repo ["main"])
      (tasks.tu/with-no-tasks
        (mt/with-temporary-setting-values [library-branching-enabled true]
          (rtu/with-synchronous-tasks
            (with-settings {}
              (testing "a save that makes this instance a consumption instance starts a deploy, and returns its task"
                (let [{:keys [success task_id]} (mt/user-http-request :crowberto :put 200 "ee/library-branching/settings"
                                                                      {:remote-sync-url    url
                                                                       :remote-sync-branch "main"
                                                                       :remote-sync-type   :read-only})]
                  (is (true? success))
                  (is (= "deploy" (:task_type (tasks/task task_id))))
                  (is (contains? tasks/ended-statuses (:status (tasks/task task_id))))))
              (testing "a save on a consumption instance starts a deploy"
                (let [{:keys [task_id]} (mt/user-http-request :crowberto :put 200 "ee/library-branching/settings"
                                                              {:remote-sync-auto-import false})]
                  (is (=? {:task_type "deploy"} (tasks/task task_id)))))
              (testing "a save on a creation instance starts no deploy"
                (let [newest (:id (tasks/newest-task))]
                  (is (= {:success true} (mt/user-http-request :crowberto :put 200 "ee/library-branching/settings"
                                                               {:remote-sync-type :read-write})))
                  (is (= "settings" (:task_type (tasks/newest-task))))
                  (is (< newest (:id (tasks/newest-task))))))
              (testing "a save that turns library branching off starts no deploy"
                (mt/user-http-request :crowberto :put 200 "ee/library-branching/settings" {:remote-sync-type :read-only})
                (is (= {:success true} (mt/user-http-request :crowberto :put 200 "ee/library-branching/settings"
                                                             {:remote-sync-url ""})))))))))))

;;; -------------------------------------------------------- Boot ------------------------------------------------------

(deftest first-deploy-at-boot-test
  (with-remote [repo url]
    (rtu/remote-with-branches! repo ["main"])
    (tasks.tu/with-no-tasks
      (mt/with-temporary-setting-values [library-branching-enabled true]
        (rtu/with-synchronous-tasks
          (reset-base!)
          (try
            (testing "a consumption instance with no base deploys its branch at boot, as the system"
              (with-settings {:remote-sync-url url :remote-sync-branch "main" :remote-sync-type :read-only}
                (let [{:keys [id]} (operations/start-initial-deploy!)]
                  (is (=? {:task_type "deploy" :initiated_by nil} (tasks/task id))))))
            (testing "a consumption instance with a base does not deploy at boot"
              (with-settings {:remote-sync-url url :remote-sync-branch "main" :remote-sync-type :read-only}
                (instance/set-base! (operations/instance) nil (rtu/commit-branch! repo "main") {})
                (is (nil? (operations/start-initial-deploy!)))))
            (testing "a creation instance, and an instance with no branch, do not deploy at boot"
              (reset-base!)
              (with-settings {:remote-sync-url url :remote-sync-branch "main"}
                (is (nil? (operations/start-initial-deploy!))))
              (with-settings {:remote-sync-url url :remote-sync-type :read-only}
                (is (nil? (operations/start-initial-deploy!)))))
            (finally
              (reset-base!))))))))
