(ns metabase-enterprise.library-branching.status-api-test
  "The status routes through HTTP, on the app DB and a remote on disk: the status, the local changes, the remote
  changes with their cache, and the push preview. The workers read at read points of their own, so these tests commit
  their content and delete it afterwards; they change the one base row and the task rows, so they are not parallel."
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.repository-test-util/with-remote clojure.core/fn}}}
  (:require
   [clojure.test :refer :all]
   ;; loads the settings of remote sync, which library branching reuses
   [metabase-enterprise.core.init]
   [metabase-enterprise.library-branching.api]
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
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def ^:private routes
  ["/status" "/is-dirty" "/dirty" "/has-remote-changes" "/push-preview"])

(defn- get-route
  [route expected-status & params]
  (apply mt/user-http-request :crowberto :get expected-status (str "ee/library-branching" route) params))

(deftest status-routes-need-a-repository-test
  ;; Scenario M6-022.
  (mt/with-premium-features #{:remote-sync}
    (with-settings {}
      (doseq [route routes]
        (testing route
          (is (= "Library branching is not configured." (get-route route 400))))))))

(deftest status-routes-need-a-branch-test
  (mt/with-premium-features #{:remote-sync}
    (with-settings {:remote-sync-url "https://git.example.com/a.git"}
      (doseq [route routes]
        (testing route
          (is (= "Library branching has no branch." (get-route route 400))))))))

(defn- run-task!
  [kind work]
  (let [{:keys [id]} (tasks/start! kind (mt/user->id :crowberto))]
    (tasks/run-task! id work)))

(defn- remote-snapshot
  [branch commit]
  (repository/do-with-store (fn [s]
                              (store/head s branch)
                              (ptu/commit-snapshot s commit))))

(deftest status-routes-on-the-app-db-test
  (testing (str "the status routes after a push, a local change and a remote change; app DB " (mdb/db-type))
    (mt/with-premium-features #{:remote-sync}
      (with-remote [repo url]
        (with-settings {:remote-sync-url url :remote-sync-branch "main"}
          (rtu/do-with-library-metric!
           (fn [{:keys [entity_id] :as metric}]
             (let [c1   (get-in (run-task! "push" #(operations/push-task! % "main" "First push")) [:outcome :commit])
                   base (remote-snapshot "main" c1)]
               (testing "scenarios M6-013 and M6-016: with no local change, not dirty, and an empty change list"
                 (is (= {:is_dirty false} (get-route "/is-dirty" 200)))
                 (is (= {:dirty []} (get-route "/dirty" 200))))
               (testing "scenario M6-025: the head is the base"
                 (is (= {:has_changes false :remote_version c1 :local_version c1 :cached false}
                        (get-route "/has-remote-changes" 200 :force-refresh true))))
               (testing "scenario M6-026: the second answer is cached"
                 (is (= {:has_changes false :remote_version c1 :local_version c1 :cached true}
                        (get-route "/has-remote-changes" 200))))
               (t2/update! :model/Card (:id metric) {:name "After"})
               (testing "scenarios M6-014, M6-017 and M6-078: a local change, listed with its identity, kind, name and
                        change type"
                 (is (= {:is_dirty true} (get-route "/is-dirty" 200)))
                 (is (= {:dirty [{:id entity_id :kind "metric" :name "After" :change "updated"}]}
                        (get-route "/dirty" 200))))
               (let [h1 (pltu/commit-snapshot! repo "main" [c1] (ptu/renamed base entity_id "Remote"))]
                 (testing "scenario M6-027: a force refresh reads the remote again"
                   (is (= {:has_changes true :remote_version h1 :local_version c1 :cached false}
                          (get-route "/has-remote-changes" 200 :force-refresh true))))
                 (testing "the status"
                   (is (= {:base c1 :head h1 :branch_missing false :base_lost false :head_findings nil
                           :local  {:created [] :deleted [] :updated [entity_id]}
                           :remote {:created [] :deleted [] :updated [entity_id]}
                           :shadowed_tables []
                           :read_only false
                           :drift nil}
                          (get-route "/status" 200))))
                 (testing "the push preview names the conflict"
                   (is (= {:has_changes true :clean false :conflicts [{:id entity_id :kind "metric" :name "After"}]
                           :violations [] :summary {:added 0 :updated 0 :removed 0} :branch_missing false
                           :base_lost false :head_findings nil}
                          (get-route "/push-preview" 200)))))
               (testing "scenario M6-029: a branch deleted upstream"
                 (with-settings {:remote-sync-url url :remote-sync-branch "gone"}
                   (is (= {:has_changes false :remote_version nil :local_version c1 :cached false :branch_missing true}
                          (get-route "/has-remote-changes" 200)))
                   (is (=? {:base c1 :head nil :branch_missing true} (get-route "/status" 200)))))))))))))

(deftest has-remote-changes-with-no-base-test
  ;; Scenario M6-023.
  (mt/with-premium-features #{:remote-sync}
    (with-remote [repo url]
      (let [h (rtu/commit-branch! repo "main")]
        (with-settings {:remote-sync-url url :remote-sync-branch "main"}
          (rtu/do-with-library-metric!
           (fn [_metric]
             (is (= {:has_changes true :remote_version h :local_version nil :cached false}
                    (get-route "/has-remote-changes" 200))))))))))

(deftest status-routes-with-a-repository-that-went-away-test
  ;; Scenario M6-031 (changed): a remote failure that is not a missing branch is a 400 with the message.
  (mt/with-premium-features #{:remote-sync}
    (with-settings {:remote-sync-url    "file:///no/such/library-branching/repository"
                    :remote-sync-branch "main"}
      (rtu/do-with-library-metric!
       (fn [_metric]
         (doseq [route ["/status" "/has-remote-changes" "/push-preview"]]
           (testing route
             (is (= "Repository not found: Please check the repository URL" (get-route route 400))))))))))
