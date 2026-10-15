(ns metabase-enterprise.library-branching.roles-operations-test
  "Instance roles on the configured repository and the app DB instance: the switch to the consumption role, which
  refuses drift; the boot checks of a consumption instance; the admin's \"discard the changes\" through the deploy
  route; and the drift in the status route. The workers read at read points of their own, so these tests commit their
  content and delete it afterwards; they change the one base row and the task rows of the app DB, so they are not
  parallel."
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
   [metabase.app-db.core :as mdb]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- reset-base! []
  (t2/query {:update :library_branching_base :set {:commit_id nil :digests nil} :where [:= :id 1]}))

(defn- run-task!
  "Starts a task of `kind`, runs `(work id)` as its worker, and returns the ended task."
  [kind work]
  (let [{:keys [id]} (tasks/start! kind (mt/user->id :crowberto))]
    (tasks/run-task! id work)))

(defn- do-with-pushed-metric!
  "Calls `(f metric base repo)` on a creation instance on the new remote `repo`: `metric` is a committed metric of the
  Library, and `base` the commit of a push of the synced content, which creates the branch main; it is the base of the
  instance. Library branching is on, with no task row before the push. Clears the base afterwards."
  [f]
  (with-remote [repo url]
    (with-settings {:remote-sync-url url :remote-sync-branch "main"}
      (reset-base!)
      (try
        (rtu/do-with-library-metric!
         (fn [metric]
           (let [pushed (run-task! "push" #(operations/push-task! % "main" "The base"))
                 base   (get-in pushed [:outcome :commit])]
             (assert base (pr-str pushed))
             (f metric base repo))))
        (finally
          (reset-base!))))))

(defn- rename! [metric metric-name]
  (t2/update! :model/Card (:id metric) {:name metric-name}))

(defn- base [] (instance/base (operations/instance)))

(defn- remote-snapshot
  [commit]
  (repository/do-with-store (fn [s]
                              (store/head s "main")
                              (ptu/commit-snapshot s commit))))

;;; ---------------------------------------------------- Role switch ---------------------------------------------------

(def ^:private unsaved-message
  "There are unsaved changes in the synced content which will be overwritten switching to read-only mode.")

(deftest switch-to-read-only-refuses-local-changes-test
  (testing (str "the switch of a creation instance to the consumption role; app DB " (mdb/db-type))
    (mt/with-premium-features #{:remote-sync}
      (rtu/with-synchronous-tasks
        (do-with-pushed-metric!
         (fn [metric c1 _repo]
           (testing "a local change: the switch is refused, and nothing changes (scenario M12-028)"
             (rename! metric "Local")
             (let [newest (:id (tasks/newest-task))]
               (is (= unsaved-message
                      (mt/user-http-request :crowberto :put 400 "ee/library-branching/settings"
                                            {:remote-sync-type :read-only})))
               (is (= :read-write (setting/get :remote-sync-type)))
               (is (= newest (:id (tasks/newest-task))) "no settings task and no deploy")))
           (testing "with no local change, the switch saves and starts a deploy, which finds nothing unsaved (M12-071)"
             (rename! metric "Before")
             (let [{:keys [task_id]} (mt/user-http-request :crowberto :put 200 "ee/library-branching/settings"
                                                           {:remote-sync-type :read-only})]
               (is (= :read-only (setting/get :remote-sync-type)))
               (is (=? {:task_type "deploy" :status "successful" :outcome {:kind "up-to-date" :commit c1}}
                       (tasks/task task_id)))))
           (testing "a switch back to the creation role keeps the base, also with a change"
             (rename! metric "Later")
             (is (= {:success true} (mt/user-http-request :crowberto :put 200 "ee/library-branching/settings"
                                                          {:remote-sync-type :read-write})))
             (is (= :read-write (setting/get :remote-sync-type)))
             (is (= c1 (base))))))))))

;;; ------------------------------------------------------- Boot -------------------------------------------------------

(defn- boot-check []
  (try
    (operations/check-boot!)
    :starts
    (catch clojure.lang.ExceptionInfo e
      (ex-message e))))

(def ^:private drift-message
  (str "Library branching is enabled with read-only type, but there are unpublished changes: 1 changed item that no "
       "commit holds. To discard them, set `MB_REMOTE_SYNC_ALLOW=overwrite-unpublished`."))

(deftest boot-of-a-consumption-instance-with-no-branch-test
  ;; Scenario M9-010.
  (mt/with-temporary-setting-values [library-branching-enabled true]
    (with-settings {:remote-sync-url "file:///my/repo.git" :remote-sync-type :read-only}
      (is (= "Library branching is enabled with read-only type, but no branch is set." (boot-check))))
    (testing "a creation instance with no branch starts"
      (with-settings {:remote-sync-url "file:///my/repo.git"}
        (is (= :starts (boot-check)))))
    (testing "an instance with no repository starts"
      (with-settings {:remote-sync-type :read-only}
        (is (= :starts (boot-check)))))))

(deftest boot-of-a-consumption-instance-with-drift-test
  ;; Scenarios M9-011 and M9-012 (changed).
  (rtu/with-synchronous-tasks
    (do-with-pushed-metric!
     (fn [metric c1 _repo]
       (mt/with-temporary-setting-values [remote-sync-type :read-only remote-sync-allow nil]
         (testing "no drift: the instance starts, and starts no deploy, as it has a base"
           (is (= :starts (boot-check)))
           (is (nil? (operations/start-initial-deploy!))))
         (testing "drift: the instance does not start"
           (rename! metric "Script")
           (is (= drift-message (boot-check))))
         (testing "a creation instance with the same change starts: its change is a local change"
           (mt/with-temporary-setting-values [remote-sync-type :read-write]
             (is (= :starts (boot-check)))))
         (testing "when the drift cannot be read, the instance starts; the deploy checks the drift itself"
           (mt/with-dynamic-fn-redefs [repository/do-with-store (fn [& _] (throw (ex-info "the remote is down" {})))]
             (is (= :starts (boot-check)))))
         (testing "MB_REMOTE_SYNC_ALLOW=overwrite-unpublished: the instance starts and discards the drift"
           (mt/with-temporary-setting-values [remote-sync-allow "overwrite-unpublished"]
             (is (= :starts (boot-check)))
             (let [{:keys [id]} (operations/start-initial-deploy!)]
               (is (=? {:task_type "deploy" :initiated_by nil :status "successful"
                        :outcome {:kind "deployed" :commit c1 :discarded 1}}
                       (tasks/task id))))
             (is (= "Before" (t2/select-one-fn :name :model/Card (:id metric))))
             (is (= c1 (base))))))))))

;;; --------------------------------------------------- Deploy route ---------------------------------------------------

(deftest discard-the-changes-through-the-deploy-route-test
  (mt/with-premium-features #{:remote-sync}
    (rtu/with-synchronous-tasks
      (do-with-pushed-metric!
       (fn [metric c1 repo]
         (mt/with-temporary-setting-values [remote-sync-type :read-only]
           (rename! metric "Script")
           (testing "the status shows the drift of the read-only instance, with the identity of the item"
             (is (=? {:read_only true :drift [(:entity_id metric)]}
                     (mt/user-http-request :crowberto :get 200 "ee/library-branching/status"))))
           (let [h (pltu/commit-snapshot! repo "main" [c1] (ptu/renamed (remote-snapshot c1) (:entity_id metric) "Main"))]
             (testing "a deploy of a new head stops on the drift, and the drift stays"
               (let [{:keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/library-branching/deploy" {})]
                 (is (=? {:status        "failed"
                          :error_message "This read-only instance has 1 changed item that no commit holds, so nothing was deployed."}
                         (tasks/task task_id))))
               (is (= "Script" (t2/select-one-fn :name :model/Card (:id metric))))
               (is (= c1 (base))))
             (testing "the admin discards the changes: the deploy writes the head over them"
               (let [{:keys [task_id]} (mt/user-http-request :crowberto :post 200 "ee/library-branching/deploy"
                                                             {:discard_changes true})]
                 (is (=? {:status "successful" :outcome {:kind "deployed" :commit h :discarded 1}}
                         (tasks/task task_id))))
               (is (= "Main" (t2/select-one-fn :name :model/Card (:id metric))))
               (is (= h (base)))))
           (testing "no drift left"
             (is (=? {:read_only true :drift []}
                     (mt/user-http-request :crowberto :get 200 "ee/library-branching/status")))))
         (testing "a creation instance has no drift in its status"
           (is (=? {:read_only false :drift nil}
                   (mt/user-http-request :crowberto :get 200 "ee/library-branching/status")))))))))
