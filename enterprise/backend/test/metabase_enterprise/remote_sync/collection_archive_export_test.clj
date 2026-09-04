(ns metabase-enterprise.remote-sync.collection-archive-export-test
  "Archiving a remote-synced collection must remove its whole subtree from the remote on the next export."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(defn- new-task! []
  (t2/delete! :model/RemoteSyncTask)
  (t2/insert-returning-pk! :model/RemoteSyncTask
                           {:sync_task_type "export" :initiated_by (mt/user->id :rasta)}))

(defn- files [mock] (get @(:files-atom mock) "main"))

(defn- entity-exported? [mock eid]
  (boolean (some (fn [[_ c]]
                   (try (= eid (:entity_id (yaml/parse-string c)))
                        (catch Exception _ false)))
                 (files mock))))

(defn- eid [model id] (t2/select-one-fn :entity_id model :id id))

(defn- archive-via-api-path!
  "What PUT /api/collection/:id {:archived true} does: the model-level archive, then the update event."
  [coll-id]
  (mt/with-current-user (mt/user->id :crowberto)
    (collection/archive-collection! (t2/select-one :model/Collection :id coll-id))
    (events/publish-event! :event/collection-update
                           {:object (t2/select-one :model/Collection :id coll-id)
                            :user-id (mt/user->id :crowberto)})))

(defn- unarchive-via-api-path! [coll-id]
  (mt/with-current-user (mt/user->id :crowberto)
    (collection/unarchive-collection! (t2/select-one :model/Collection :id coll-id) {})
    (events/publish-event! :event/collection-update
                           {:object (t2/select-one :model/Collection :id coll-id)
                            :user-id (mt/user->id :crowberto)})))

(defn- ledger []
  (into {} (map (juxt (juxt :model_type :model_id) :status)) (t2/select :model/RemoteSyncObject)))

(defn- with-exported-tree!
  "Under a synced root, a collection holding a card and a sub-collection with a card, all pushed to a fresh
  mock remote. The archived collection sits under a root so that unarchiving restores it into a synced
  parent."
  [f]
  (mt/with-temporary-setting-values [remote-sync-type :read-write
                                     remote-sync-transforms false]
    (mt/with-temp [:model/Collection {root-id :id} {:name "Root" :is_remote_synced true :location "/"}
                   :model/Collection {coll-id :id} {:name "Bug Repro" :is_remote_synced true
                                                    :location (str "/" root-id "/")}
                   :model/Collection {sub-id :id} {:name "Nested" :is_remote_synced true
                                                   :location (str "/" root-id "/" coll-id "/")}
                   :model/Card {card-a :id} {:name "Card A" :collection_id coll-id}
                   :model/Card {card-b :id} {:name "Card B" :collection_id sub-id}]
      (t2/delete! :model/RemoteSyncObject)
      (doseq [[topic model model-id] [[:event/collection-create :model/Collection root-id]
                                      [:event/collection-create :model/Collection coll-id]
                                      [:event/collection-create :model/Collection sub-id]
                                      [:event/card-create :model/Card card-a]
                                      [:event/card-create :model/Card card-b]]]
        (events/publish-event! topic {:object (t2/select-one model :id model-id) :user-id (mt/user->id :crowberto)}))
      (is (= 5 (t2/count :model/RemoteSyncObject :status "create")) "events tracked all five entities")
      (let [mock (rs.test/create-mock-source :initial-files {"main" {}})]
        (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "init"))))
        (is (every? #(entity-exported? mock %) [(eid :model/Collection coll-id) (eid :model/Collection sub-id)
                                                (eid :model/Card card-a) (eid :model/Card card-b)])
            "precondition: the subtree's four entities have files on the remote")
        (f {:mock mock :root-id root-id :coll-id coll-id :sub-id sub-id :card-a card-a :card-b card-b})))))

(defn- subtree-ledger
  "The ledger without the synced root's own row."
  [root-id]
  (dissoc (ledger) ["Collection" root-id]))

(deftest unarchiving-before-push-restores-subtree-test
  (with-exported-tree!
    (fn [{:keys [mock root-id coll-id sub-id card-a card-b]}]
      (let [files-before (files mock)]
        (archive-via-api-path! coll-id)
        (unarchive-via-api-path! coll-id)
        (is (= {["Collection" coll-id] "update"
                ["Collection" sub-id]  "update"
                ["Card" card-a]        "update"
                ["Card" card-b]        "update"}
               (subtree-ledger root-id))
            "the subtree is no longer pending deletion")
        (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "unarchive"))))
        (is (= (set (keys files-before)) (set (keys (files mock)))) "every file is still on the remote")))))

(deftest directly-archived-card-stays-pending-deletion-through-unarchive-test
  (with-exported-tree!
    (fn [{:keys [mock root-id coll-id sub-id card-a card-b]}]
      (let [before (t2/select-one :model/Card :id card-a)]
        (t2/update! :model/Card card-a {:archived true :archived_directly true})
        (events/publish-event! :event/card-update {:object          (t2/select-one :model/Card :id card-a)
                                                   :previous-object before
                                                   :user-id         (mt/user->id :crowberto)}))
      (archive-via-api-path! coll-id)
      (unarchive-via-api-path! coll-id)
      (is (= {["Collection" coll-id] "update"
              ["Collection" sub-id]  "update"
              ["Card" card-a]        "delete"
              ["Card" card-b]        "update"}
             (subtree-ledger root-id)))
      (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "unarchive"))))
      (is (not (entity-exported? mock (eid :model/Card card-a))) "the directly archived card's file is removed")
      (is (entity-exported? mock (eid :model/Card card-b)) "the restored card's file remains"))))

(deftest unarchiving-after-push-re-exports-subtree-test
  (with-exported-tree!
    (fn [{:keys [mock root-id coll-id sub-id card-a card-b]}]
      (archive-via-api-path! coll-id)
      (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "archive"))))
      (is (= [(eid :model/Collection root-id)]
             (keep (fn [[_ c]] (:entity_id (yaml/parse-string c))) (files mock)))
          "only the root's own file remains")
      (unarchive-via-api-path! coll-id)
      (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "unarchive"))))
      (is (every? #(entity-exported? mock %) [(eid :model/Collection coll-id) (eid :model/Collection sub-id)
                                              (eid :model/Card card-a) (eid :model/Card card-b)])
          "the whole subtree is back on the remote"))))

(deftest archiving-collection-removes-subtree-from-remote-test
  (mt/with-temporary-setting-values [remote-sync-type :read-write
                                     remote-sync-transforms false]
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Bug Repro" :is_remote_synced true :location "/"}
                   :model/Collection {sub-id :id} {:name "Nested" :is_remote_synced true
                                                   :location (str "/" coll-id "/")}
                   :model/Card {card-a :id} {:name "Card A" :collection_id coll-id}
                   :model/Card {card-b :id} {:name "Card B" :collection_id sub-id}]
      (t2/delete! :model/RemoteSyncObject)
      (doseq [[model-type model-id] [["Collection" coll-id] ["Collection" sub-id] ["Card" card-a] ["Card" card-b]]]
        (events/publish-event! (keyword "event" (str (case model-type "Collection" "collection" "Card" "card") "-create"))
                               {:object (t2/select-one (keyword "model" model-type) :id model-id)
                                :user-id (mt/user->id :crowberto)}))
      (is (= 4 (t2/count :model/RemoteSyncObject :status "create")) "events tracked all four entities")
      (let [mock (rs.test/create-mock-source :initial-files {"main" {}})]
        (is (= :success (:status (impl/export! (source.p/snapshot mock) (new-task!) "init"))))
        (is (every? #(entity-exported? mock %) [(eid :model/Collection coll-id) (eid :model/Collection sub-id)
                                                (eid :model/Card card-a) (eid :model/Card card-b)])
            "precondition: all four entities have files on the remote")
        (archive-via-api-path! coll-id)
        (testing "the whole subtree is archived locally"
          (is (every? true? (t2/select-fn-vec :archived :model/Card :id [:in [card-a card-b]])))
          (is (true? (t2/select-one-fn :archived :model/Collection :id sub-id))))
        (testing "every entity in the subtree is pending deletion"
          (is (= {["Collection" coll-id] "delete"
                  ["Collection" sub-id]  "delete"
                  ["Card" card-a]        "delete"
                  ["Card" card-b]        "delete"}
                 (into {} (map (juxt (juxt :model_type :model_id) :status))
                       (t2/select :model/RemoteSyncObject)))))
        (let [result (impl/export! (source.p/snapshot mock) (new-task!) "archive")]
          (is (= :success (:status result)))
          (testing "no file of the archived subtree remains on the remote"
            (is (empty? (files mock)) (str "orphaned files: " (vec (keys (files mock)))))))))))
