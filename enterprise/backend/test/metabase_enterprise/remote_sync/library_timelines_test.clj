(ns metabase-enterprise.remote-sync.library-timelines-test
  "Timelines in the Library's Dashboards collection do not sync: they are not exported, tracked, or removed by a pull.
  Timelines in other synced collections sync."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.core :as remote-sync.core]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(defn- new-task! [task-type]
  (t2/delete! :model/RemoteSyncTask)
  (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type task-type :initiated_by (mt/user->id :rasta)}))

(defn- exported-entity-ids [mock]
  (into #{}
        (keep (fn [[_ content]] (try (:entity_id (yaml/parse-string content)) (catch Exception _ nil))))
        (get @(:files-atom mock) "main")))

(deftest library-dashboards-timelines-do-not-sync-test
  (mt/with-temporary-setting-values [remote-sync-type       :read-write
                                     remote-sync-transforms false]
    (rs.test/ensure-library!)
    (rs.test/set-library-remote-synced! true)
    (let [dashboards-id (t2/select-one-pk :model/Collection :entity_id collection/library-dashboards-entity-id)]
      (mt/with-temp [:model/Collection {bench-id :id}             {:name "Bench" :is_remote_synced true :location "/"}
                     :model/Timeline   {lib-tl :id lib-eid :entity_id} {:name "Launches" :collection_id dashboards-id}
                     :model/Timeline   {bench-tl :id bench-eid :entity_id} {:name "Releases" :collection_id bench-id}]
        (testing "tracking: a timeline in the Library's Dashboards collection gets no RemoteSyncObject"
          (t2/delete! :model/RemoteSyncObject)
          (events/publish-event! :event/timeline-create {:object (t2/select-one :model/Timeline :id lib-tl)
                                                         :user-id (mt/user->id :rasta)})
          (events/publish-event! :event/timeline-create {:object (t2/select-one :model/Timeline :id bench-tl)
                                                         :user-id (mt/user->id :rasta)})
          (is (not (t2/exists? :model/RemoteSyncObject :model_type "Timeline" :model_id lib-tl)))
          (is (t2/exists? :model/RemoteSyncObject :model_type "Timeline" :model_id bench-tl)))
        (testing "eligibility"
          (is (false? (get (remote-sync.core/batch-model-eligible? :model/Timeline
                                                                   [(t2/select-one :model/Timeline :id lib-tl)])
                           lib-tl))))
        (testing "export: only the timeline outside the Library is written"
          (let [mock (rs.test/create-mock-source :initial-files {"main" {}})]
            (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task! "export") "full" :force? true))))
            (is (contains? (exported-entity-ids mock) bench-eid))
            (is (not (contains? (exported-entity-ids mock) lib-eid)))
            (testing "pull: the Library timeline, absent from the repo, stays"
              (let [result (impl/import! (source.p/snapshot mock) (new-task! "import") :force? true)]
                (is (= :success (:status result)) (:message result)))
              (is (t2/exists? :model/Timeline :id lib-tl))
              (is (t2/exists? :model/Timeline :id bench-tl))
              (is (not (t2/exists? :model/RemoteSyncObject :model_type "Timeline" :model_id lib-tl))))))
        (testing "a pull still removes a timeline outside the Library that the repo lacks"
          (mt/with-temp [:model/Timeline {gone :id} {:name "Gone" :collection_id bench-id}]
            (t2/insert! :model/RemoteSyncObject {:model_type "Timeline" :model_id gone :model_name "Gone"
                                                 :status "synced" :status_changed_at (t/offset-date-time)})
            (let [mock (rs.test/create-mock-source :initial-files {"main" {}})]
              (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task! "export") "full" :force? true))))
              (swap! (:files-atom mock) update "main"
                     (fn [files] (into {} (remove (fn [[_ c]] (re-find #"name: Gone" c))) files)))
              (is (= :success (:status (impl/import! (source.p/snapshot mock) (new-task! "import") :force? true))))
              (is (not (t2/exists? :model/Timeline :id gone)))
              (is (t2/exists? :model/Timeline :id lib-tl)))))))))
