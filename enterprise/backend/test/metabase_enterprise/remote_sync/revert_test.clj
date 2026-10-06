(ns metabase-enterprise.remote-sync.revert-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users :web-server))
(use-fixtures :each test-helpers/clean-remote-sync-state test-helpers/commit-with-temp)

(defn- push!
  "Exports the dirty entities to `source`, and returns the status of the export. Deletes all task rows first: the mock
  source always reports one version, so the version of an earlier task makes the export see a diverged remote."
  [source]
  (t2/delete! :model/RemoteSyncTask)
  (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "export"
                                                                :initiated_by   (mt/user->id :rasta)})
        result  (impl/export! (source.p/snapshot source) task-id "push")]
    (impl/handle-task-result! result task-id)
    (:status result)))

(defn- pull!
  "Imports all of `source` with `:force? true`, and returns the status of the import."
  [source]
  (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type "import"
                                                                :initiated_by   (mt/user->id :rasta)})
        result  (impl/import! (source.p/snapshot source) task-id :force? true)]
    (impl/handle-task-result! result task-id)
    (:status result)))

(defn- ledger-status [model-type id]
  (t2/select-one-fn :status :model/RemoteSyncObject :model_type model-type :model_id id))

(defn- repo-names
  "The set of top-level `name:` values in the files on the main branch of `source`."
  [source]
  (into #{}
        (keep #(second (re-find #"(?m)^name: (.*)$" %)))
        (vals (get @(:files-atom source) "main"))))

(defn- revision-id-with-name [model id entity-name]
  (some (fn [r] (when (= entity-name (get-in r [:object :name])) (:id r)))
        (t2/select :model/Revision :model model :model_id id {:order-by [[:id :asc]]})))

(defn- revert! [entity id revision-id]
  (mt/user-http-request :crowberto :post 200 "revision/revert"
                        {:entity entity :id id :revision_id revision-id}))

(deftest dashboard-and-card-name-revert-is-pushed-test
  (mt/with-premium-features #{:remote-sync}
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-model-cleanup [:model/Dashboard :model/Card :model/Revision :model/RemoteSyncTask]
        (mt/with-temp [:model/Collection {coll-id :id :as coll} {:name "Synced" :is_remote_synced true :location "/"}]
          ;; without the ledger row of the collection, the export omits it, and the forced pull deletes its content
          (events/publish-event! :event/collection-create {:object coll :user-id (mt/user->id :crowberto)})
          (let [dash-id  (:id (mt/user-http-request :crowberto :post 200 "dashboard"
                                                    {:name "Dash one" :collection_id coll-id}))
                card-id  (:id (mt/user-http-request :crowberto :post 200 "card"
                                                    {:name                   "Card one"
                                                     :collection_id          coll-id
                                                     :display                "table"
                                                     :visualization_settings {}
                                                     :dataset_query          (mt/native-query {:query "SELECT 1"})}))
                source   (test-helpers/create-mock-source :initial-files {"main" {}})
                dash-eid (t2/select-one-fn :entity_id :model/Dashboard :id dash-id)
                card-eid (t2/select-one-fn :entity_id :model/Card :id card-id)]
            (mt/user-http-request :crowberto :put 200 (str "dashboard/" dash-id) {:name "Dash two"})
            (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:name "Card two"})
            (is (= :success (push! source)))
            (is (= ["synced" "synced"] [(ledger-status "Dashboard" dash-id) (ledger-status "Card" card-id)]))
            (is (= #{"Synced" "Dash two" "Card two"} (repo-names source)))
            (revert! "dashboard" dash-id (revision-id-with-name "Dashboard" dash-id "Dash one"))
            (revert! "card" card-id (revision-id-with-name "Card" card-id "Card one"))
            (is (= ["Dash one" "Card one"]
                   [(t2/select-one-fn :name :model/Dashboard dash-id) (t2/select-one-fn :name :model/Card card-id)]))
            (testing "the reverts mark both ledger rows as updated"
              (is (= ["update" "update"] [(ledger-status "Dashboard" dash-id) (ledger-status "Card" card-id)])))
            (testing "the next push writes the reverted names"
              (is (= :success (push! source)))
              (is (= #{"Synced" "Dash one" "Card one"} (repo-names source))))
            (testing "a pull keeps the reverted names"
              (is (= :success (pull! source)))
              (is (= "Dash one" (t2/select-one-fn :name :model/Dashboard :entity_id dash-eid)))
              (is (= "Card one" (t2/select-one-fn :name :model/Card :entity_id card-eid))))))))))

(deftest transform-name-revert-is-pushed-test
  (mt/with-premium-features #{:remote-sync :transforms-basic}
    (mt/with-temporary-setting-values [remote-sync-type       :read-write
                                       remote-sync-transforms true]
      ;; `with-temporary-setting-values` writes the getter's value back, which leaves a "false" row behind
      (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
        (mt/with-model-cleanup [:model/Revision :model/RemoteSyncTask]
          (mt/with-temp [:model/Collection {coll-id :id}      {:name      "Transforms"
                                                               :namespace collection/transforms-ns
                                                               :location  "/"}
                         :model/Transform  {transform-id :id} {:name "Transform one" :collection_id coll-id}]
            (let [source         (test-helpers/create-mock-source :initial-files {"main" {}})
                  push-revision! (fn [creation?]
                                   (revision/push-revision! {:entity       :model/Transform
                                                             :id           transform-id
                                                             :object       (t2/select-one :model/Transform :id transform-id)
                                                             :user-id      (mt/user->id :crowberto)
                                                             :is-creation? creation?}))]
              ;; `with-temp` publishes no event, so the test writes the ledger row and the revisions itself
              (events/publish-event! :event/transform-create {:object (t2/select-one :model/Transform :id transform-id)})
              (push-revision! true)
              (t2/update! :model/Transform transform-id {:name "Transform two"})
              (push-revision! false)
              (is (= :success (push! source)))
              (is (= "synced" (ledger-status "Transform" transform-id)))
              (is (= #{"Transforms" "Transform two"} (repo-names source)))
              (revert! "transform" transform-id (revision-id-with-name "Transform" transform-id "Transform one"))
              (is (= "Transform one" (t2/select-one-fn :name :model/Transform transform-id)))
              (testing "the revert marks the ledger row as updated"
                (is (= "update" (ledger-status "Transform" transform-id))))
              (testing "the next push writes the reverted name"
                (is (= :success (push! source)))
                (is (= #{"Transforms" "Transform one"} (repo-names source)))))))))))
