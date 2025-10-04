(ns metabase-enterprise.remote-sync.events-test
  "Tests for the remote-sync events system.

   Tests event publishing, handling, and model change tracking functionality."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.events :as lib.events]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

;;; Helper Functions Tests

(deftest model-in-remote-synced-collection-returns-true-test
  (testing "model-in-remote-synced-collection? returns true for models in remote-synced collections"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced" :name "Remote-Sync"}]
      (is (true? (#'lib.events/model-in-remote-synced-collection?
                  {:collection_id (:id remote-sync-collection)}))))))

(deftest model-in-remote-synced-collection-returns-false-for-normal-test
  (testing "model-in-remote-synced-collection? returns false for models in normal collections"
    (mt/with-temp [:model/Collection normal-collection {:name "Normal"}]
      (is (false? (#'lib.events/model-in-remote-synced-collection?
                   {:collection_id (:id normal-collection)}))))))

(deftest model-in-remote-synced-collection-returns-false-for-nil-test
  (testing "model-in-remote-synced-collection? returns false when collection_id is nil"
    (is (false? (#'lib.events/model-in-remote-synced-collection? {:collection_id nil})))))

(deftest model-in-remote-synced-collection-returns-false-for-missing-test
  (testing "model-in-remote-synced-collection? returns false when model has no collection_id"
    (is (false? (#'lib.events/model-in-remote-synced-collection? {})))))

;;; Model Change Event Tests

(deftest card-create-event-creates-entry-test
  (testing "card-create event creates remote sync object entry with create status"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced" :name "Remote-Sync"}
                   :model/Card remote-sync-card {:name "Test Card"
                                                 :collection_id (:id remote-sync-collection)}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        (events/publish-event! :event/card-create
                               {:object remote-sync-card :user-id (mt/user->id :rasta)})

        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 1 (count entries)))
          (is (=? {:model_type "Card"
                   :model_id (:id remote-sync-card)
                   :status "create"}
                  (first entries))))))))

(deftest card-update-event-creates-entry-test
  (testing "card-update event creates or updates remote sync object entry with update status"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced" :name "Remote-Sync"}
                   :model/Card remote-sync-card {:name "Test Card"
                                                 :collection_id (:id remote-sync-collection)}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        (events/publish-event! :event/card-update
                               {:object remote-sync-card :user-id (mt/user->id :rasta)})

        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 1 (count entries)))
          (is (=? {:model_type "Card"
                   :model_id (:id remote-sync-card)
                   :status "update"}
                  (first entries))))))))

(deftest card-update-archived-sets-delete-test
  (testing "card-update event with archived=true sets delete status"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced" :name "Remote-Sync"}
                   :model/Card remote-sync-card {:name "Test Card"
                                                 :collection_id (:id remote-sync-collection)}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        (events/publish-event! :event/card-update
                               {:object (assoc remote-sync-card :archived true)
                                :user-id (mt/user->id :rasta)})

        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 1 (count entries)))
          (is (=? {:model_type "Card"
                   :model_id (:id remote-sync-card)
                   :status "delete"}
                  (first entries))))))))

(deftest card-delete-event-creates-entry-test
  (testing "card-delete event creates remote sync object entry with delete status"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced" :name "Remote-Sync"}
                   :model/Card remote-sync-card {:name "Test Card"
                                                 :collection_id (:id remote-sync-collection)}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        (events/publish-event! :event/card-delete
                               {:object remote-sync-card :user-id (mt/user->id :rasta)})

        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 1 (count entries)))
          (is (=? {:model_type "Card"
                   :model_id (:id remote-sync-card)
                   :status "delete"}
                  (first entries))))))))

(deftest card-multiple-events-update-same-object-test
  (testing "multiple card events do not update object when status is create"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced" :name "Remote-Sync"}
                   :model/Card remote-sync-card {:name "Test Card"
                                                 :collection_id (:id remote-sync-collection)}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        ;; Create initial entry at time T1
        (let [clock-t1 (t/mock-clock (t/instant "2024-01-01T10:00:00Z") (t/zone-id "UTC"))]
          (t/with-clock clock-t1
            (events/publish-event! :event/card-create
                                   {:object remote-sync-card :user-id (mt/user->id :rasta)}))

          (let [initial-entry (t2/select-one :model/RemoteSyncObject
                                             :model_type "Card"
                                             :model_id (:id remote-sync-card))]

            ;; Update the card at time T2 (1 hour later)
            (let [clock-t2 (t/mock-clock (t/instant "2024-01-01T11:00:00Z") (t/zone-id "UTC"))]
              (t/with-clock clock-t2
                (events/publish-event! :event/card-update
                                       {:object remote-sync-card :user-id (mt/user->id :rasta)})))

            (let [entries (t2/select :model/RemoteSyncObject)]
              ;; Should still be just one entry
              (is (= 1 (count entries)))
              (let [update-entry (first entries)]
                ;; Should be the same ID
                (is (= (:id initial-entry) (:id update-entry)))
                ;; Status should remain "create" (not update)
                (is (= "create" (:status update-entry)))
                ;; Timestamp should not change
                (is (= (:status_changed_at initial-entry) (:status_changed_at update-entry)))))))))))

(deftest card-event-in-normal-collection-no-entry-test
  (testing "card events in non-remote-sync collections don't create entries"
    (mt/with-temp [:model/Collection normal-collection {:name "Normal"}
                   :model/Card normal-card {:name "Normal Card"
                                            :collection_id (:id normal-collection)}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        (events/publish-event! :event/card-create
                               {:object normal-card :user-id (mt/user->id :rasta)})

        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 0 (count entries))))))))

(deftest dashboard-create-event-creates-entry-test
  (testing "dashboard-create event creates remote sync object entry with create status"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced" :name "Remote-Sync"}
                   :model/Dashboard dashboard {:name "Test Dashboard"
                                               :collection_id (:id remote-sync-collection)}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        (events/publish-event! :event/dashboard-create
                               {:object dashboard :user-id (mt/user->id :rasta)})

        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 1 (count entries)))
          (is (=? {:model_type "Dashboard"
                   :model_id (:id dashboard)
                   :status "create"}
                  (first entries))))))))

(deftest dashboard-update-event-creates-entry-test
  (testing "dashboard-update event creates or updates remote sync object entry"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced" :name "Remote-Sync"}
                   :model/Dashboard dashboard {:name "Test Dashboard"
                                               :collection_id (:id remote-sync-collection)}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        (events/publish-event! :event/dashboard-update
                               {:object dashboard :user-id (mt/user->id :rasta)})

        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 1 (count entries)))
          (is (=? {:model_type "Dashboard"
                   :model_id (:id dashboard)
                   :status "update"}
                  (first entries))))))))

(deftest dashboard-update-archived-sets-delete-test
  (testing "dashboard-update event with archived=true sets delete status"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced" :name "Remote-Sync"}
                   :model/Dashboard dashboard {:name "Test Dashboard"
                                               :collection_id (:id remote-sync-collection)}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        (events/publish-event! :event/dashboard-update
                               {:object (assoc dashboard :archived true)
                                :user-id (mt/user->id :rasta)})

        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 1 (count entries)))
          (is (=? {:model_type "Dashboard"
                   :model_id (:id dashboard)
                   :status "delete"}
                  (first entries))))))))

(deftest dashboard-delete-event-creates-entry-test
  (testing "dashboard-delete event creates remote sync object entry with delete status"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced" :name "Remote-Sync"}
                   :model/Dashboard dashboard {:name "Test Dashboard"
                                               :collection_id (:id remote-sync-collection)}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        (events/publish-event! :event/dashboard-delete
                               {:object dashboard :user-id (mt/user->id :rasta)})

        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 1 (count entries)))
          (is (=? {:model_type "Dashboard"
                   :model_id (:id dashboard)
                   :status "delete"}
                  (first entries))))))))

(deftest document-create-event-creates-entry-test
  (testing "document-create event creates remote sync object entry with create status"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced" :name "Remote-Sync"}
                   :model/Document document {:collection_id (u/the-id remote-sync-collection)}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        (events/publish-event! :event/document-create
                               {:object document :user-id (mt/user->id :rasta)})

        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 1 (count entries)))
          (is (=? {:model_type "Document"
                   :model_id (:id document)
                   :status "create"}
                  (first entries))))))))

(deftest document-update-event-creates-entry-test
  (testing "document-update event creates or updates remote sync object entry with update status"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced" :name "Remote-Sync"}
                   :model/Document document {:collection_id (u/the-id remote-sync-collection)}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        (events/publish-event! :event/document-update
                               {:object document :user-id (mt/user->id :rasta)})

        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 1 (count entries)))
          (is (=? {:model_type "Document"
                   :model_id (:id document)
                   :status "update"}
                  (first entries))))))))

(deftest document-update-archived-sets-delete-test
  (testing "document-update event with archived=true sets delete status"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced" :name "Remote-Sync"}
                   :model/Document document {:collection_id (u/the-id remote-sync-collection)}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        (events/publish-event! :event/document-update
                               {:object (assoc document :archived true)
                                :user-id (mt/user->id :rasta)})

        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 1 (count entries)))
          (is (=? {:model_type "Document"
                   :model_id (:id document)
                   :status "delete"}
                  (first entries))))))))

(deftest document-delete-event-creates-entry-test
  (testing "document-delete event creates remote sync object entry with delete status"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced" :name "Remote-Sync"}
                   :model/Document document {:collection_id (u/the-id remote-sync-collection)}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        (events/publish-event! :event/document-delete
                               {:object document :user-id (mt/user->id :rasta)})

        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 1 (count entries)))
          (is (=? {:model_type "Document"
                   :model_id (:id document)
                   :status "delete"}
                  (first entries))))))))

(deftest collection-create-event-creates-entry-test
  (testing "collection-create event creates remote sync object entry with create status"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced"
                                                             :name "Remote-Sync"}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        (events/publish-event! :event/collection-create
                               {:object remote-sync-collection :user-id (mt/user->id :rasta)})

        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 1 (count entries)))
          (is (=? {:model_type "Collection"
                   :model_id (:id remote-sync-collection)
                   :status "create"}
                  (first entries))))))))

(deftest collection-create-event-no-entry-for-normal-collection-test
  (testing "collection-create event doesn't create entry for non-remote-synced collections"
    (mt/with-temp [:model/Collection normal-collection {:name "Normal"}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        (events/publish-event! :event/collection-create
                               {:object normal-collection :user-id (mt/user->id :rasta)})

        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 0 (count entries))))))))

(deftest collection-create-event-archived-sets-delete-test
  (testing "collection-create event with archived=true sets delete status"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced"
                                                             :name "Remote-Sync"}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        (events/publish-event! :event/collection-create
                               {:object (assoc remote-sync-collection :archived true)
                                :user-id (mt/user->id :rasta)})

        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 1 (count entries)))
          (is (=? {:model_type "Collection"
                   :model_id (:id remote-sync-collection)
                   :status "delete"}
                  (first entries))))))))

(deftest collection-update-event-creates-entry-test
  (testing "collection-update event creates or updates remote sync object entry with update status"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced"
                                                             :name "Remote-Sync"}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        (events/publish-event! :event/collection-update
                               {:object remote-sync-collection :user-id (mt/user->id :rasta)})

        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 1 (count entries)))
          (is (=? {:model_type "Collection"
                   :model_id (:id remote-sync-collection)
                   :status "update"}
                  (first entries))))))))

(deftest collection-update-event-archived-sets-delete-test
  (testing "collection-update event with archived=true sets delete status"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced"
                                                             :name "Remote-Sync"}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        (events/publish-event! :event/collection-update
                               {:object (assoc remote-sync-collection :archived true)
                                :user-id (mt/user->id :rasta)})

        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 1 (count entries)))
          (is (=? {:model_type "Collection"
                   :model_id (:id remote-sync-collection)
                   :status "delete"}
                  (first entries))))))))

(deftest collection-update-event-unarchived-sets-update-test
  (testing "collection-update event with archived=false sets update status"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced"
                                                             :name "Remote-Sync"}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        (events/publish-event! :event/collection-update
                               {:object (assoc remote-sync-collection :archived false)
                                :user-id (mt/user->id :rasta)})

        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 1 (count entries)))
          (is (=? {:model_type "Collection"
                   :model_id (:id remote-sync-collection)
                   :status "update"}
                  (first entries))))))))

(deftest collection-update-event-no-entry-for-normal-collection-test
  (testing "collection-update event doesn't create entry for non-remote-synced collections"
    (mt/with-temp [:model/Collection normal-collection {:name "Normal"}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        (events/publish-event! :event/collection-update
                               {:object normal-collection :user-id (mt/user->id :rasta)})

        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 0 (count entries))))))))

(deftest collection-multiple-update-events-update-same-object-test
  (testing "multiple collection-update events update the same remote sync object"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced"
                                                             :name "Remote-Sync"}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        ;; First update at time T1
        (let [clock-t1 (t/mock-clock (t/instant "2024-01-01T10:00:00Z") (t/zone-id "UTC"))]
          (t/with-clock clock-t1
            (events/publish-event! :event/collection-update
                                   {:object remote-sync-collection :user-id (mt/user->id :rasta)}))

          (let [initial-entry (t2/select-one :model/RemoteSyncObject
                                             :model_type "Collection"
                                             :model_id (:id remote-sync-collection))]

            ;; Second update at time T2 (1 hour later)
            (let [clock-t2 (t/mock-clock (t/instant "2024-01-01T11:00:00Z") (t/zone-id "UTC"))]
              (t/with-clock clock-t2
                (events/publish-event! :event/collection-update
                                       {:object remote-sync-collection :user-id (mt/user->id :rasta)})))

            (let [entries (t2/select :model/RemoteSyncObject :model_id (:id remote-sync-collection))]
              ;; Should still be just one entry
              (is (= 1 (count entries)))
              ;; Should be the same ID
              (is (= (:id initial-entry) (:id (first entries))))
              ;; But with update timestamp
              (is (t/after? (:status_changed_at (first entries))
                            (:status_changed_at initial-entry))))))))))

(deftest create-remote-sync-object-entry-creates-new-entry-test
  (testing "create-remote-sync-object-entry! creates new entry when none exists"
    (mt/with-model-cleanup [:model/RemoteSyncObject]
      (mt/with-current-user (mt/user->id :rasta)
        (t2/delete! :model/RemoteSyncObject)

        (#'lib.events/create-remote-sync-object-entry! "Card" 123 "create" 456)

        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 1 (count entries)))
          (is (=? {:model_type "Card"
                   :model_id 123
                   :status "create"}
                  (first entries))))))))

(deftest create-remote-sync-object-entry-updates-existing-entry-test
  (testing "create-remote-sync-object-entry! updates existing entry when one exists"
    (mt/with-model-cleanup [:model/RemoteSyncObject]
      (mt/with-current-user (mt/user->id :rasta)
        (t2/delete! :model/RemoteSyncObject)

        ;; Create initial entry with "update" status at time T1
        (let [clock-t1 (t/mock-clock (t/instant "2024-01-01T10:00:00Z") (t/zone-id "UTC"))]
          (t/with-clock clock-t1
            (#'lib.events/create-remote-sync-object-entry! "Dashboard" 789 "update"))

          (let [initial-entry (t2/select-one :model/RemoteSyncObject :model_type "Dashboard" :model_id 789)
                initial-time (:status_changed_at initial-entry)]

            ;; Update to synced status at time T2 (1 hour later)
            (let [clock-t2 (t/mock-clock (t/instant "2024-01-01T11:00:00Z") (t/zone-id "UTC"))]
              (t/with-clock clock-t2
                (#'lib.events/create-remote-sync-object-entry! "Dashboard" 789 "synced")))

            (let [entries (t2/select :model/RemoteSyncObject :model_type "Dashboard" :model_id 789)]
              ;; Should still be just one entry
              (is (= 1 (count entries)))
              (let [update-entry (first entries)]
                ;; Should be the same ID
                (is (= (:id initial-entry) (:id update-entry)))
                ;; Should have update status
                (is (= "synced" (:status update-entry)))
                ;; Should have update timestamp
                (is (t/after? (:status_changed_at update-entry) initial-time))))))))))

(deftest create-remote-sync-object-entry-does-not-update-create-status-test
  (testing "create-remote-sync-object-entry! does not update entry when status is 'create'"
    (mt/with-model-cleanup [:model/RemoteSyncObject]
      (mt/with-current-user (mt/user->id :rasta)
        (t2/delete! :model/RemoteSyncObject)

        ;; Create initial entry with "create" status at time T1
        (let [clock-t1 (t/mock-clock (t/instant "2024-01-01T10:00:00Z") (t/zone-id "UTC"))]
          (t/with-clock clock-t1
            (#'lib.events/create-remote-sync-object-entry! "Dashboard" 789 "create"))

          (let [initial-entry (t2/select-one :model/RemoteSyncObject :model_type "Dashboard" :model_id 789)]

            ;; Try to update to synced status at time T2 (1 hour later)
            (let [clock-t2 (t/mock-clock (t/instant "2024-01-01T11:00:00Z") (t/zone-id "UTC"))]
              (t/with-clock clock-t2
                (#'lib.events/create-remote-sync-object-entry! "Dashboard" 789 "synced")))

            (let [entries (t2/select :model/RemoteSyncObject :model_type "Dashboard" :model_id 789)]
              ;; Should still be just one entry
              (is (= 1 (count entries)))
              (let [update-entry (first entries)]
                ;; Should be the same ID
                (is (= (:id initial-entry) (:id update-entry)))
                ;; Status should remain "create" (not update)
                (is (= "create" (:status update-entry)))
                ;; Timestamp should not change
                (is (= (:status_changed_at initial-entry) (:status_changed_at update-entry)))))))))))

(deftest create-remote-sync-object-entry-uses-current-user-test
  (testing "create-remote-sync-object-entry! uses current user when user-id not specified"
    (mt/with-model-cleanup [:model/RemoteSyncObject]
      (mt/with-current-user (mt/user->id :rasta)
        (t2/delete! :model/RemoteSyncObject)

        (#'lib.events/create-remote-sync-object-entry! "Collection" 999 "create")

        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 1 (count entries)))
          (is (=? {:model_type "Collection"
                   :model_id 999
                   :status "create"}
                  (first entries))))))))

(deftest card-moved-out-of-remote-synced-collection-test
  (testing "card moved out of remote-synced collection is marked as removed"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced" :name "Remote-Sync"}
                   :model/Collection normal-collection {:name "Normal"}
                   :model/Card card {:name "Test Card"
                                     :collection_id (:id remote-sync-collection)}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        ;; Create initial entry for card in remote-synced collection
        (events/publish-event! :event/card-create
                               {:object card :user-id (mt/user->id :rasta)})

        (let [initial-entry (t2/select-one :model/RemoteSyncObject :model_type "Card" :model_id (:id card))]
          (is (= "create" (:status initial-entry)))

          ;; Move card to normal collection
          (events/publish-event! :event/card-update
                                 {:object (assoc card :collection_id (:id normal-collection))
                                  :user-id (mt/user->id :rasta)})

          (let [update-entry (t2/select-one :model/RemoteSyncObject :model_type "Card" :model_id (:id card))]
            (is (= "removed" (:status update-entry)))
            (is (= (:id initial-entry) (:id update-entry)))))))))

(deftest dashboard-moved-out-of-remote-synced-collection-test
  (testing "dashboard moved out of remote-synced collection is marked as removed"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced" :name "Remote-Sync"}
                   :model/Collection normal-collection {:name "Normal"}
                   :model/Dashboard dashboard {:name "Test Dashboard"
                                               :collection_id (:id remote-sync-collection)}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        ;; Create initial entry for dashboard in remote-synced collection
        (events/publish-event! :event/dashboard-create
                               {:object dashboard :user-id (mt/user->id :rasta)})

        (let [initial-entry (t2/select-one :model/RemoteSyncObject :model_type "Dashboard" :model_id (:id dashboard))]
          (is (= "create" (:status initial-entry)))

          ;; Move dashboard to normal collection
          (events/publish-event! :event/dashboard-update
                                 {:object (assoc dashboard :collection_id (:id normal-collection))
                                  :user-id (mt/user->id :rasta)})

          (let [update-entry (t2/select-one :model/RemoteSyncObject :model_type "Dashboard" :model_id (:id dashboard))]
            (is (= "removed" (:status update-entry)))
            (is (= (:id initial-entry) (:id update-entry)))))))))

(deftest document-moved-out-of-remote-synced-collection-test
  (testing "document moved out of remote-synced collection is marked as removed"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced" :name "Remote-Sync"}
                   :model/Collection normal-collection {:name "Normal"}
                   :model/Document document {:collection_id (u/the-id remote-sync-collection)}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        ;; Create initial entry for document in remote-synced collection
        (events/publish-event! :event/document-create
                               {:object document :user-id (mt/user->id :rasta)})

        (let [initial-entry (t2/select-one :model/RemoteSyncObject :model_type "Document" :model_id (:id document))]
          (is (= "create" (:status initial-entry)))

          ;; Move document to normal collection
          (events/publish-event! :event/document-update
                                 {:object (assoc document :collection_id (:id normal-collection))
                                  :user-id (mt/user->id :rasta)})

          (let [update-entry (t2/select-one :model/RemoteSyncObject :model_type "Document" :model_id (:id document))]
            (is (= "removed" (:status update-entry)))
            (is (= (:id initial-entry) (:id update-entry)))))))))

(deftest collection-type-changed-from-remote-synced-test
  (testing "collection type changed from remote-synced is marked as removed"
    (mt/with-temp [:model/Collection collection {:type "remote-synced" :name "Remote-Sync"}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        ;; Create initial entry for remote-synced collection
        (events/publish-event! :event/collection-create
                               {:object collection :user-id (mt/user->id :rasta)})

        (let [initial-entry (t2/select-one :model/RemoteSyncObject :model_type "Collection" :model_id (:id collection))]
          (is (= "create" (:status initial-entry)))

          ;; Change collection type to default
          (events/publish-event! :event/collection-update
                                 {:object (assoc collection :type nil)
                                  :user-id (mt/user->id :rasta)})

          (let [update-entry (t2/select-one :model/RemoteSyncObject :model_type "Collection" :model_id (:id collection))]
            (is (= "removed" (:status update-entry)))
            (is (= (:id initial-entry) (:id update-entry)))))))))

(deftest model-not-tracked-moved-to-normal-collection-test
  (testing "model not previously tracked doesn't create removed entry when moved to normal collection"
    (mt/with-temp [:model/Collection normal-collection {:name "Normal"}
                   :model/Card card {:name "Test Card"
                                     :collection_id (:id normal-collection)}]
      (mt/with-model-cleanup [:model/RemoteSyncObject]
        (t2/delete! :model/RemoteSyncObject)

        ;; Update card while it's in normal collection (no prior entry exists)
        (events/publish-event! :event/card-update
                               {:object card :user-id (mt/user->id :rasta)})

        ;; Should not create any entry
        (let [entries (t2/select :model/RemoteSyncObject :model_type "Card" :model_id (:id card))]
          (is (= 0 (count entries))))))))

(deftest card-event-derivation-test
  (testing "card events properly derive from :metabase/event"
    (is (isa? ::lib.events/card-change-event :metabase/event))
    (is (isa? :event/card-create ::lib.events/card-change-event))
    (is (isa? :event/card-update ::lib.events/card-change-event))
    (is (isa? :event/card-delete ::lib.events/card-change-event))))

(deftest dashboard-event-derivation-test
  (testing "dashboard events properly derive from :metabase/event"
    (is (isa? ::lib.events/dashboard-change-event :metabase/event))
    (is (isa? :event/dashboard-create ::lib.events/dashboard-change-event))
    (is (isa? :event/dashboard-update ::lib.events/dashboard-change-event))
    (is (isa? :event/dashboard-delete ::lib.events/dashboard-change-event))))

(deftest document-event-derivation-test
  (testing "document events properly derive from :metabase/event"
    (is (isa? ::lib.events/document-change-event :metabase/event))
    (is (isa? :event/document-create ::lib.events/document-change-event))
    (is (isa? :event/document-update ::lib.events/document-change-event))
    (is (isa? :event/document-delete ::lib.events/document-change-event))))

(deftest collection-event-derivation-test
  (testing "collection events properly derive from :metabase/event"
    (is (isa? ::lib.events/collection-change-event :metabase/event))
    (is (isa? :event/collection-create ::lib.events/collection-change-event))
    (is (isa? :event/collection-update ::lib.events/collection-change-event))))
