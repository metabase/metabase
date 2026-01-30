(ns metabase-enterprise.remote-sync.events-test
  "Tests for the remote-sync events system.

   Tests event publishing, handling, and model change tracking functionality."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.events :as remote-sync.events]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.test-utils :refer [with-library-synced]]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

;;; Model Change Event Tests

(deftest card-create-event-creates-entry-test
  (testing "card-create event creates remote sync object entry with create status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Card remote-sync-card {:name "Test Card"
                                                 :dataset_query (mt/mbql-query venues)
                                                 :collection_id (:id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/card-create
                             {:object remote-sync-card :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Card"
                 :model_id (:id remote-sync-card)
                 :status "create"}
                (first entries)))))))

(deftest card-update-event-creates-entry-test
  (testing "card-update event creates or updates remote sync object entry with update status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Card remote-sync-card {:name "Test Card"
                                                 :dataset_query (mt/mbql-query venues)
                                                 :collection_id (:id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/card-update
                             {:object remote-sync-card :previous-object remote-sync-card :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Card"
                 :model_id (:id remote-sync-card)
                 :status "update"}
                (first entries)))))))

(deftest card-update-archived-sets-delete-test
  (testing "card-update event with archived=true sets delete status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Card remote-sync-card {:name "Test Card"
                                                 :dataset_query (mt/mbql-query venues)
                                                 :collection_id (:id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/card-update
                             {:object (assoc remote-sync-card :archived true)
                              :previous-object remote-sync-card
                              :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Card"
                 :model_id (:id remote-sync-card)
                 :status "delete"}
                (first entries)))))))

(deftest card-delete-event-creates-entry-test
  (testing "card-delete event creates remote sync object entry with delete status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Card remote-sync-card {:name "Test Card"
                                                 :dataset_query (mt/mbql-query venues)
                                                 :collection_id (:id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/card-delete
                             {:object remote-sync-card :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Card"
                 :model_id (:id remote-sync-card)
                 :status "delete"}
                (first entries)))))))

(deftest card-multiple-events-update-same-object-test
  (testing "multiple card events do not update object when status is create"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Card remote-sync-card {:name "Test Card"
                                                 :dataset_query (mt/mbql-query venues)
                                                 :collection_id (:id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (let [clock-t1 (t/mock-clock (t/instant "2024-01-01T10:00:00Z") (t/zone-id "UTC"))]
        (t/with-clock clock-t1
          (events/publish-event! :event/card-create
                                 {:object remote-sync-card :user-id (mt/user->id :rasta)}))
        (let [initial-entry (t2/select-one :model/RemoteSyncObject
                                           :model_type "Card"
                                           :model_id (:id remote-sync-card))]
          (let [clock-t2 (t/mock-clock (t/instant "2024-01-01T11:00:00Z") (t/zone-id "UTC"))]
            (t/with-clock clock-t2
              (events/publish-event! :event/card-update
                                     {:object remote-sync-card :previous-object remote-sync-card :user-id (mt/user->id :rasta)})))
          (let [entries (t2/select :model/RemoteSyncObject)]
            (is (= 1 (count entries)))
            (let [update-entry (first entries)]
              (is (= (:id initial-entry) (:id update-entry)))
              (is (= "create" (:status update-entry)))
              (is (= (:status_changed_at initial-entry) (:status_changed_at update-entry))))))))))

(deftest card-event-in-normal-collection-no-entry-test
  (testing "card events in non-remote-sync collections don't create entries"
    (mt/with-temp [:model/Collection normal-collection {:name "Normal"}
                   :model/Card normal-card {:name "Normal Card"
                                            :dataset_query (mt/mbql-query venues)
                                            :collection_id (:id normal-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/card-create
                             {:object normal-card :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 0 (count entries)))))))

(deftest dashboard-create-event-creates-entry-test
  (testing "dashboard-create event creates remote sync object entry with create status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Dashboard dashboard {:name "Test Dashboard"
                                               :collection_id (:id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/dashboard-create
                             {:object dashboard :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Dashboard"
                 :model_id (:id dashboard)
                 :status "create"}
                (first entries)))))))

(deftest dashboard-update-event-creates-entry-test
  (testing "dashboard-update event creates or updates remote sync object entry"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Dashboard dashboard {:name "Test Dashboard"
                                               :collection_id (:id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/dashboard-update
                             {:object dashboard :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Dashboard"
                 :model_id (:id dashboard)
                 :status "update"}
                (first entries)))))))

(deftest dashboard-update-archived-sets-delete-test
  (testing "dashboard-update event with archived=true sets delete status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Dashboard dashboard {:name "Test Dashboard"
                                               :collection_id (:id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/dashboard-update
                             {:object (assoc dashboard :archived true)
                              :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Dashboard"
                 :model_id (:id dashboard)
                 :status "delete"}
                (first entries)))))))

(deftest dashboard-delete-event-creates-entry-test
  (testing "dashboard-delete event creates remote sync object entry with delete status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Dashboard dashboard {:name "Test Dashboard"
                                               :collection_id (:id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/dashboard-delete
                             {:object dashboard :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Dashboard"
                 :model_id (:id dashboard)
                 :status "delete"}
                (first entries)))))))

(deftest document-create-event-creates-entry-test
  (testing "document-create event creates remote sync object entry with create status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Document document {:collection_id (u/the-id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/document-create
                             {:object document :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Document"
                 :model_id (:id document)
                 :status "create"}
                (first entries)))))))

(deftest document-update-event-creates-entry-test
  (testing "document-update event creates or updates remote sync object entry with update status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Document document {:collection_id (u/the-id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/document-update
                             {:object document :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Document"
                 :model_id (:id document)
                 :status "update"}
                (first entries)))))))

(deftest document-update-archived-sets-delete-test
  (testing "document-update event with archived=true sets delete status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Document document {:collection_id (u/the-id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/document-update
                             {:object (assoc document :archived true)
                              :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Document"
                 :model_id (:id document)
                 :status "delete"}
                (first entries)))))))

(deftest document-delete-event-creates-entry-test
  (testing "document-delete event creates remote sync object entry with delete status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Document document {:collection_id (u/the-id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/document-delete
                             {:object document :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Document"
                 :model_id (:id document)
                 :status "delete"}
                (first entries)))))))

(deftest snippet-create-event-creates-entry-test
  (testing "snippet-create event creates remote sync object entry with create status when Library is synced"
    (with-library-synced
      (mt/with-temp [:model/Collection snippet-collection {:name "Snippets" :namespace "snippets"}
                     :model/NativeQuerySnippet snippet {:name "Test Snippet"
                                                        :content "SELECT 1"
                                                        :collection_id (:id snippet-collection)}]
        (t2/delete! :model/RemoteSyncObject)
        (events/publish-event! :event/snippet-create
                               {:object snippet :user-id (mt/user->id :rasta)})
        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 1 (count entries)))
          (is (=? {:model_type "NativeQuerySnippet"
                   :model_id (:id snippet)
                   :status "create"}
                  (first entries))))))))

(deftest snippet-update-event-creates-entry-test
  (testing "snippet-update event creates or updates remote sync object entry with update status when Library is synced"
    (with-library-synced
      (mt/with-temp [:model/Collection snippet-collection {:name "Snippets" :namespace "snippets"}
                     :model/NativeQuerySnippet snippet {:name "Test Snippet"
                                                        :content "SELECT 1"
                                                        :collection_id (:id snippet-collection)}]
        (t2/delete! :model/RemoteSyncObject)
        (events/publish-event! :event/snippet-update
                               {:object snippet :user-id (mt/user->id :rasta)})
        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 1 (count entries)))
          (is (=? {:model_type "NativeQuerySnippet"
                   :model_id (:id snippet)
                   :status "update"}
                  (first entries))))))))

(deftest snippet-update-archived-sets-delete-test
  (testing "snippet-update event with archived=true sets delete status when Library is synced"
    (with-library-synced
      (mt/with-temp [:model/Collection snippet-collection {:name "Snippets" :namespace "snippets"}
                     :model/NativeQuerySnippet snippet {:name "Test Snippet"
                                                        :content "SELECT 1"
                                                        :collection_id (:id snippet-collection)}]
        (t2/delete! :model/RemoteSyncObject)
        (events/publish-event! :event/snippet-update
                               {:object (assoc snippet :archived true)
                                :user-id (mt/user->id :rasta)})
        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 1 (count entries)))
          (is (=? {:model_type "NativeQuerySnippet"
                   :model_id (:id snippet)
                   :status "delete"}
                  (first entries))))))))

(deftest snippet-delete-event-creates-entry-test
  (testing "snippet-delete event creates remote sync object entry with delete status when Library is synced"
    (with-library-synced
      (mt/with-temp [:model/Collection snippet-collection {:name "Snippets" :namespace "snippets"}
                     :model/NativeQuerySnippet snippet {:name "Test Snippet"
                                                        :content "SELECT 1"
                                                        :collection_id (:id snippet-collection)}]
        (t2/delete! :model/RemoteSyncObject)
        (events/publish-event! :event/snippet-delete
                               {:object snippet :user-id (mt/user->id :rasta)})
        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 1 (count entries)))
          (is (=? {:model_type "NativeQuerySnippet"
                   :model_id (:id snippet)
                   :status "delete"}
                  (first entries))))))))

(deftest snippet-event-when-library-not-synced-no-entry-test
  (testing "snippet events don't create entries when Library is not synced"
    (when-let [library (collection/library-collection)]
      (t2/update! :model/Collection (:id library) {:is_remote_synced false}))
    (mt/with-temp [:model/Collection snippet-collection {:name "Snippets" :namespace "snippets"}
                   :model/NativeQuerySnippet snippet {:name "Test Snippet"
                                                      :content "SELECT 1"
                                                      :collection_id (:id snippet-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/snippet-create
                             {:object snippet :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 0 (count entries)))))))

(deftest collection-create-event-creates-entry-test
  (testing "collection-create event creates remote sync object entry with create status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true
                                                             :name "Remote-Sync"}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/collection-create
                             {:object remote-sync-collection :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Collection"
                 :model_id (:id remote-sync-collection)
                 :status "create"}
                (first entries)))))))

(deftest collection-create-event-no-entry-for-normal-collection-test
  (testing "collection-create event doesn't create entry for non-remote-synced collections"
    (mt/with-temp [:model/Collection normal-collection {:name "Normal"}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/collection-create
                             {:object normal-collection :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 0 (count entries)))))))

(deftest collection-create-event-archived-sets-delete-test
  (testing "collection-create event with archived=true sets delete status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true
                                                             :name "Remote-Sync"}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/collection-create
                             {:object (assoc remote-sync-collection :archived true)
                              :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Collection"
                 :model_id (:id remote-sync-collection)
                 :status "delete"}
                (first entries)))))))

(deftest collection-update-event-creates-entry-test
  (testing "collection-update event creates or updates remote sync object entry with update status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true
                                                             :name "Remote-Sync"}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/collection-update
                             {:object remote-sync-collection :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Collection"
                 :model_id (:id remote-sync-collection)
                 :status "update"}
                (first entries)))))))

(deftest collection-update-event-archived-sets-delete-test
  (testing "collection-update event with archived=true sets delete status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true
                                                             :name "Remote-Sync"}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/collection-update
                             {:object (assoc remote-sync-collection :archived true)
                              :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Collection"
                 :model_id (:id remote-sync-collection)
                 :status "delete"}
                (first entries)))))))

(deftest collection-update-event-unarchived-sets-update-test
  (testing "collection-update event with archived=false sets update status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true
                                                             :name "Remote-Sync"}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/collection-update
                             {:object (assoc remote-sync-collection :archived false)
                              :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Collection"
                 :model_id (:id remote-sync-collection)
                 :status "update"}
                (first entries)))))))

(deftest collection-update-event-no-entry-for-normal-collection-test
  (testing "collection-update event doesn't create entry for non-remote-synced collections"
    (mt/with-temp [:model/Collection normal-collection {:name "Normal"}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/collection-update
                             {:object normal-collection :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 0 (count entries)))))))

(deftest collection-multiple-update-events-update-same-object-test
  (testing "multiple collection-update events update the same remote sync object"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true
                                                             :name "Remote-Sync"}]
      (t2/delete! :model/RemoteSyncObject)
      (let [clock-t1 (t/mock-clock (t/instant "2024-01-01T10:00:00Z") (t/zone-id "UTC"))]
        (t/with-clock clock-t1
          (events/publish-event! :event/collection-update
                                 {:object remote-sync-collection :user-id (mt/user->id :rasta)}))
        (let [initial-entry (t2/select-one :model/RemoteSyncObject
                                           :model_type "Collection"
                                           :model_id (:id remote-sync-collection))
              clock-t2 (t/mock-clock (t/instant "2024-01-01T11:00:00Z") (t/zone-id "UTC"))]
          (t/with-clock clock-t2
            (events/publish-event! :event/collection-update
                                   {:object remote-sync-collection :user-id (mt/user->id :rasta)}))
          (let [entries (t2/select :model/RemoteSyncObject :model_id (:id remote-sync-collection))]
            (is (= 1 (count entries)))
            (is (= (:id initial-entry) (:id (first entries))))
            (is (t/after? (:status_changed_at (first entries))
                          (:status_changed_at initial-entry)))))))))

(deftest create-remote-sync-object-entry-creates-new-entry-test
  (testing "create-remote-sync-object-entry! creates new entry when none exists"
    (mt/with-temp [:model/Card card {:name "Test Card"
                                     :dataset_query (mt/mbql-query venues)}]
      (mt/with-current-user (mt/user->id :rasta)
        (t2/delete! :model/RemoteSyncObject)
        (let [hydrate-fn (fn [id] (t2/select-one [:model/Card :name :collection_id :display] :id id))]
          (#'remote-sync.events/create-or-update-remote-sync-object-entry! "Card" (:id card) "create" hydrate-fn)
          (let [entries (t2/select :model/RemoteSyncObject)]
            (is (= 1 (count entries)))
            (is (=? {:model_type "Card"
                     :model_id (:id card)
                     :status "create"}
                    (first entries)))))))))

(deftest create-remote-sync-object-entry-updates-existing-entry-test
  (testing "create-remote-sync-object-entry! updates existing entry when one exists"
    (mt/with-temp [:model/Dashboard dashboard {:name "Test Dashboard"}]
      (mt/with-current-user (mt/user->id :rasta)
        (t2/delete! :model/RemoteSyncObject)
        (let [clock-t1 (t/mock-clock (t/instant "2024-01-01T10:00:00Z") (t/zone-id "UTC"))
              hydrate-fn (fn [id] (t2/select-one [:model/Dashboard :name :collection_id] :id id))]
          (t/with-clock clock-t1
            (#'remote-sync.events/create-or-update-remote-sync-object-entry! "Dashboard" (:id dashboard) "update" hydrate-fn))
          (let [initial-entry (t2/select-one :model/RemoteSyncObject :model_type "Dashboard" :model_id (:id dashboard))
                initial-time (:status_changed_at initial-entry)
                clock-t2 (t/mock-clock (t/instant "2024-01-01T11:00:00Z") (t/zone-id "UTC"))]
            (t/with-clock clock-t2
              (#'remote-sync.events/create-or-update-remote-sync-object-entry! "Dashboard" (:id dashboard) "synced" hydrate-fn))
            (let [entries (t2/select :model/RemoteSyncObject :model_type "Dashboard" :model_id (:id dashboard))]
              (is (= 1 (count entries)))
              (let [update-entry (first entries)]
                (is (= (:id initial-entry) (:id update-entry)))
                (is (= "synced" (:status update-entry)))
                (is (t/after? (:status_changed_at update-entry) initial-time))))))))))

(deftest create-remote-sync-object-entry-does-not-update-create-status-test
  (testing "create-remote-sync-object-entry! does not update entry when status is 'create'"
    (mt/with-temp [:model/Dashboard dashboard {:name "Test Dashboard"}]
      (mt/with-current-user (mt/user->id :rasta)
        (t2/delete! :model/RemoteSyncObject)
        (let [clock-t1 (t/mock-clock (t/instant "2024-01-01T10:00:00Z") (t/zone-id "UTC"))
              hydrate-fn (fn [id] (t2/select-one [:model/Dashboard :name :collection_id] :id id))]
          (t/with-clock clock-t1
            (#'remote-sync.events/create-or-update-remote-sync-object-entry! "Dashboard" (:id dashboard) "create" hydrate-fn))
          (let [initial-entry (t2/select-one :model/RemoteSyncObject :model_type "Dashboard" :model_id (:id dashboard))
                clock-t2 (t/mock-clock (t/instant "2024-01-01T11:00:00Z") (t/zone-id "UTC"))]
            (t/with-clock clock-t2
              (#'remote-sync.events/create-or-update-remote-sync-object-entry! "Dashboard" (:id dashboard) "synced" hydrate-fn))
            (let [entries (t2/select :model/RemoteSyncObject :model_type "Dashboard" :model_id (:id dashboard))]
              (is (= 1 (count entries)))
              (let [update-entry (first entries)]
                (is (= (:id initial-entry) (:id update-entry)))
                (is (= "create" (:status update-entry)))
                (is (= (:status_changed_at initial-entry) (:status_changed_at update-entry)))))))))))

(deftest create-remote-sync-object-entry-with-hydrate-fn-test
  (testing "create-remote-sync-object-entry! creates entry with hydrated details from hydrate-fn"
    (mt/with-current-user (mt/user->id :rasta)
      (t2/delete! :model/RemoteSyncObject)
      (let [existing-collection-id (t2/select-one-fn :id [:model/Collection :id])
            hydrate-fn (fn [id] (t2/select-one [:model/Collection :name [:id :collection_id]] :id id))]
        (#'remote-sync.events/create-or-update-remote-sync-object-entry! "Collection" existing-collection-id "create" hydrate-fn)
        (let [entries (t2/select :model/RemoteSyncObject)]
          (is (= 1 (count entries)))
          (is (=? {:model_type "Collection"
                   :model_id existing-collection-id
                   :status "create"}
                  (first entries))))))))

(deftest existing-card-moved-out-of-remote-synced-collection-test
  (testing "existing card moved out of remote-synced collection is marked as removed"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Collection normal-collection {:name "Normal"}
                   :model/Card card {:name "Test Card"
                                     :dataset_query (mt/mbql-query venues)
                                     :collection_id (:id remote-sync-collection)}]
      (#'impl/sync-objects! (t/instant) {:by-entity-id {"Card" #{(:entity_id card)}}})

      (let [initial-entry (t2/select-one :model/RemoteSyncObject :model_type "Card" :model_id (:id card))]
        (is (= "synced" (:status initial-entry)))
        (events/publish-event! :event/card-update
                               {:object (assoc card :collection_id (:id normal-collection))
                                :previous-object card
                                :user-id (mt/user->id :rasta)})

        (let [update-entry (t2/select-one :model/RemoteSyncObject :model_type "Card" :model_id (:id card))]
          (is (= "removed" (:status update-entry)))
          (is (= (:id initial-entry) (:id update-entry))))))))

(deftest new-card-moved-out-of-remote-synced-collection-test
  (testing "new card moved out of remote-synced collection is no longer tracked"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Collection normal-collection {:name "Normal"}
                   :model/Card card {:name "Test Card"
                                     :dataset_query (mt/mbql-query venues)
                                     :collection_id (:id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/card-create
                             {:object card :user-id (mt/user->id :rasta)})
      (let [initial-entry (t2/select-one :model/RemoteSyncObject :model_type "Card" :model_id (:id card))]
        (is (= "create" (:status initial-entry)))
        (events/publish-event! :event/card-update
                               {:object (assoc card :collection_id (:id normal-collection))
                                :previous-object card
                                :user-id (mt/user->id :rasta)})
        (let [update-entry (t2/select-one :model/RemoteSyncObject :model_type "Card" :model_id (:id card))]
          (is (nil? update-entry)))))))

(deftest existing-dashboard-moved-out-of-remote-synced-collection-test
  (testing "existing dashboard moved out of remote-synced collection is marked as removed"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Collection normal-collection {:name "Normal"}
                   :model/Dashboard dashboard {:name "Test Dashboard"
                                               :collection_id (:id remote-sync-collection)}]
      (#'impl/sync-objects! (t/instant) {:by-entity-id {"Dashboard" #{(:entity_id dashboard)}}})

      (let [initial-entry (t2/select-one :model/RemoteSyncObject :model_type "Dashboard" :model_id (:id dashboard))]
        (is (= "synced" (:status initial-entry)))
        (events/publish-event! :event/dashboard-update
                               {:object (assoc dashboard :collection_id (:id normal-collection))
                                :user-id (mt/user->id :rasta)})

        (let [update-entry (t2/select-one :model/RemoteSyncObject :model_type "Dashboard" :model_id (:id dashboard))]
          (is (= "removed" (:status update-entry)))
          (is (= (:id initial-entry) (:id update-entry))))))))

(deftest new-dashboard-moved-out-of-remote-synced-collection-test
  (testing "new dashboard moved out of remote-synced collection is no longer tracked"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Collection normal-collection {:name "Normal"}
                   :model/Dashboard dashboard {:name "Test Dashboard"
                                               :collection_id (:id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/dashboard-create
                             {:object dashboard :user-id (mt/user->id :rasta)})
      (let [initial-entry (t2/select-one :model/RemoteSyncObject :model_type "Dashboard" :model_id (:id dashboard))]
        (is (= "create" (:status initial-entry)))
        (events/publish-event! :event/dashboard-update
                               {:object (assoc dashboard :collection_id (:id normal-collection))
                                :user-id (mt/user->id :rasta)})
        (let [update-entry (t2/select-one :model/RemoteSyncObject :model_type "Dashboard" :model_id (:id dashboard))]
          (is (nil? update-entry)))))))

(deftest existing-document-moved-out-of-remote-synced-collection-test
  (testing "existing document moved out of remote-synced collection is marked as removed"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Collection normal-collection {:name "Normal"}
                   :model/Document document {:collection_id (u/the-id remote-sync-collection)}]
      (#'impl/sync-objects! (t/instant) {:by-entity-id {"Document" #{(:entity_id document)}}})

      (let [initial-entry (t2/select-one :model/RemoteSyncObject :model_type "Document" :model_id (:id document))]
        (is (= "synced" (:status initial-entry)))
        (events/publish-event! :event/document-update
                               {:object (assoc document :collection_id (:id normal-collection))
                                :user-id (mt/user->id :rasta)})

        (let [update-entry (t2/select-one :model/RemoteSyncObject :model_type "Document" :model_id (:id document))]
          (is (= "removed" (:status update-entry)))
          (is (= (:id initial-entry) (:id update-entry))))))))

(deftest new-document-moved-out-of-remote-synced-collection-test
  (testing "new document moved out of remote-synced collection is no longer tracked"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Collection normal-collection {:name "Normal"}
                   :model/Document document {:collection_id (u/the-id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/document-create
                             {:object document :user-id (mt/user->id :rasta)})
      (let [initial-entry (t2/select-one :model/RemoteSyncObject :model_type "Document" :model_id (:id document))]
        (is (= "create" (:status initial-entry)))
        (events/publish-event! :event/document-update
                               {:object (assoc document :collection_id (:id normal-collection))
                                :user-id (mt/user->id :rasta)})
        (let [update-entry (t2/select-one :model/RemoteSyncObject :model_type "Document" :model_id (:id document))]
          (is (nil? update-entry)))))))

(deftest existing-collection-type-changed-from-remote-synced-test
  (testing "existing collection type changed from remote-synced is marked as removed"
    (mt/with-temp [:model/Collection collection {:is_remote_synced true :name "Remote-Sync"}]
      (#'impl/sync-objects! (t/instant) {:by-entity-id {"Collection" #{(:entity_id collection)}}})
      (let [initial-entry (t2/select-one :model/RemoteSyncObject :model_type "Collection" :model_id (:id collection))]
        (is (= "synced" (:status initial-entry)))
        (events/publish-event! :event/collection-update
                               {:object (assoc collection :is_remote_synced false)
                                :user-id (mt/user->id :rasta)})
        (let [update-entry (t2/select-one :model/RemoteSyncObject :model_type "Collection" :model_id (:id collection))]
          (is (= "removed" (:status update-entry)))
          (is (= (:id initial-entry) (:id update-entry))))))))

(deftest new-collection-type-changed-from-remote-synced-test
  (testing "new collection type changed from remote-synced is marked as removed"
    (mt/with-temp [:model/Collection collection {:is_remote_synced true :name "Remote-Sync"}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/collection-create
                             {:object collection :user-id (mt/user->id :rasta)})
      (let [initial-entry (t2/select-one :model/RemoteSyncObject :model_type "Collection" :model_id (:id collection))]
        (is (= "create" (:status initial-entry)))
        (events/publish-event! :event/collection-update
                               {:object (assoc collection :is_remote_synced false)
                                :user-id (mt/user->id :rasta)})

        (let [update-entry (t2/select-one :model/RemoteSyncObject :model_type "Collection" :model_id (:id collection))]
          (is (nil? update-entry)))))))

(deftest model-not-tracked-moved-to-normal-collection-test
  (testing "model not previously tracked doesn't create removed entry when moved to normal collection"
    (mt/with-temp [:model/Collection normal-collection {:name "Normal"}
                   :model/Card card {:name "Test Card"
                                     :dataset_query (mt/mbql-query venues)
                                     :collection_id (:id normal-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/card-update
                             {:object card :previous-object card :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject :model_type "Card" :model_id (:id card))]
        (is (= 0 (count entries)))))))

(deftest ^:parallel card-event-derivation-test
  (testing "card events properly derive from :metabase/event"
    (is (isa? ::remote-sync.events/card-change-event :metabase/event))
    (is (isa? :event/card-create ::remote-sync.events/card-change-event))
    (is (isa? :event/card-update ::remote-sync.events/card-change-event))
    (is (isa? :event/card-delete ::remote-sync.events/card-change-event))))

(deftest ^:parallel dashboard-event-derivation-test
  (testing "dashboard events properly derive from :metabase/event"
    (is (isa? ::remote-sync.events/dashboard-change-event :metabase/event))
    (is (isa? :event/dashboard-create ::remote-sync.events/dashboard-change-event))
    (is (isa? :event/dashboard-update ::remote-sync.events/dashboard-change-event))
    (is (isa? :event/dashboard-delete ::remote-sync.events/dashboard-change-event))))

(deftest ^:parallel document-event-derivation-test
  (testing "document events properly derive from :metabase/event"
    (is (isa? ::remote-sync.events/document-change-event :metabase/event))
    (is (isa? :event/document-create ::remote-sync.events/document-change-event))
    (is (isa? :event/document-update ::remote-sync.events/document-change-event))
    (is (isa? :event/document-delete ::remote-sync.events/document-change-event))))

(deftest ^:parallel snippet-event-derivation-test
  (testing "snippet events properly derive from :metabase/event"
    (is (isa? ::remote-sync.events/snippet-change-event :metabase/event))
    (is (isa? :event/snippet-create ::remote-sync.events/snippet-change-event))
    (is (isa? :event/snippet-update ::remote-sync.events/snippet-change-event))
    (is (isa? :event/snippet-delete ::remote-sync.events/snippet-change-event))))

(deftest ^:parallel collection-event-derivation-test
  (testing "collection events properly derive from :metabase/event"
    (is (isa? ::remote-sync.events/collection-change-event :metabase/event))
    (is (isa? :event/collection-create ::remote-sync.events/collection-change-event))
    (is (isa? :event/collection-update ::remote-sync.events/collection-change-event))))

(deftest timeline-create-event-creates-entry-test
  (testing "timeline-create event creates remote sync object entry with create status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Timeline timeline {:name "Test Timeline"
                                             :collection_id (:id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/timeline-create
                             {:object timeline :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Timeline"
                 :model_id (:id timeline)
                 :status "create"}
                (first entries)))))))

(deftest timeline-update-event-creates-entry-test
  (testing "timeline-update event creates remote sync object entry with update status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Timeline timeline {:name "Test Timeline"
                                             :collection_id (:id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/timeline-update
                             {:object timeline :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Timeline"
                 :model_id (:id timeline)
                 :status "update"}
                (first entries)))))))

(deftest timeline-update-archived-sets-delete-test
  (testing "timeline-update event with archived timeline sets delete status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Timeline timeline {:name "Test Timeline"
                                             :collection_id (:id remote-sync-collection)
                                             :archived true}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/timeline-update
                             {:object timeline :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Timeline"
                 :model_id (:id timeline)
                 :status "delete"}
                (first entries)))))))

(deftest timeline-delete-event-creates-entry-test
  (testing "timeline-delete event creates remote sync object entry with delete status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Timeline timeline {:name "Test Timeline"
                                             :collection_id (:id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/timeline-delete
                             {:object timeline :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Timeline"
                 :model_id (:id timeline)
                 :status "delete"}
                (first entries)))))))

(deftest timeline-event-in-normal-collection-no-entry-test
  (testing "timeline events in normal collections don't create remote sync entries"
    (mt/with-temp [:model/Collection normal-collection {:name "Normal Collection"}
                   :model/Timeline timeline {:name "Test Timeline"
                                             :collection_id (:id normal-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/timeline-create
                             {:object timeline :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 0 (count entries)))))))

(deftest existing-timeline-moved-out-of-remote-synced-collection-test
  (testing "existing timeline moved out of remote-synced collection gets marked as removed"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Collection normal-collection {:name "Normal Collection"}
                   :model/Timeline timeline {:name "Test Timeline"
                                             :collection_id (:id remote-sync-collection)}]
      (#'impl/sync-objects! (t/instant) {:by-entity-id {"Timeline" #{(:entity_id timeline)}}})
      (is (= 1 (count (t2/select :model/RemoteSyncObject))))
      (events/publish-event! :event/timeline-update
                             {:object (assoc timeline :collection_id (:id normal-collection))
                              :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Timeline"
                 :model_id (:id timeline)
                 :status "removed"}
                (first entries)))))))

(deftest new-timeline-moved-out-of-remote-synced-collection-test
  (testing "new timeline moved out of remote-synced collection is no longer tracked"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Collection normal-collection {:name "Normal Collection"}
                   :model/Timeline timeline {:name "Test Timeline"
                                             :collection_id (:id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/timeline-create
                             {:object timeline :user-id (mt/user->id :rasta)})
      (is (= 1 (count (t2/select :model/RemoteSyncObject))))
      (events/publish-event! :event/timeline-update
                             {:object (assoc timeline :collection_id (:id normal-collection))
                              :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 0 (count entries)))))))

(deftest soft-delete-then-hard-delete-preserves-dirty-status-test
  (testing "doc that is soft-deleted then hard-deleted should maintain dirty status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Document doc {:name "Test Doc"
                                        :collection_id (:id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)

      ;; Trash the doc
      (t2/update! :model/Document (:id doc) {:archived true})
      (events/publish-event! :event/document-update
                             {:object (assoc doc :archived true)
                              :user-id (mt/user->id :rasta)})

      (let [soft-delete-entry (t2/select-one :model/RemoteSyncObject :model_type "Document" :model_id (:id doc))]
        (is (= "delete" (:status soft-delete-entry))))

      ;; Permanently delete from trash
      (t2/delete! :model/Document (:id doc))
      (events/publish-event! :event/document-delete
                             {:object doc :user-id (mt/user->id :rasta)})

      ;; The remote sync object entry should still exist with delete status
      ;; so the collection remains dirty
      (let [hard-delete-entry (t2/select-one :model/RemoteSyncObject :model_type "Document" :model_id (:id doc))]
        (is (= "delete" (:status hard-delete-entry)))
        (is (not (nil? hard-delete-entry)))))))

;;; Table Event Tests

(deftest table-update-event-creates-entry-for-published-table-test
  (testing "table-update event creates remote sync object entry for published table in remote-synced collection"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Table table {:name "Test Table"
                                       :is_published true
                                       :collection_id (:id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/table-update
                             {:object table :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Table"
                 :model_id (:id table)
                 :status "update"}
                (first entries)))))))

(deftest table-update-event-no-entry-for-unpublished-table-test
  (testing "table-update event doesn't create entry for unpublished table"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Table table {:name "Test Table"
                                       :is_published false
                                       :collection_id (:id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/table-update
                             {:object table :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 0 (count entries)))))))

(deftest table-update-event-no-entry-for-normal-collection-test
  (testing "table-update event doesn't create entry for table in non-remote-synced collection"
    (mt/with-temp [:model/Collection normal-collection {:name "Normal"}
                   :model/Table table {:name "Test Table"
                                       :is_published true
                                       :collection_id (:id normal-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/table-update
                             {:object table :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 0 (count entries)))))))

(deftest table-update-archived-sets-delete-test
  (testing "table-update event with archived_at sets delete status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Table table {:name "Test Table"
                                       :is_published true
                                       :collection_id (:id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/table-update
                             {:object (assoc table :archived_at (t/offset-date-time))
                              :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Table"
                 :model_id (:id table)
                 :status "delete"}
                (first entries)))))))

(deftest table-unpublished-marks-as-removed-test
  (testing "table that becomes unpublished is marked as removed"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Table table {:name "Test Table"
                                       :is_published true
                                       :collection_id (:id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      ;; First, create an entry with status "synced" directly
      (t2/insert! :model/RemoteSyncObject {:model_type "Table"
                                           :model_id (:id table)
                                           :model_name "Test Table"
                                           :model_table_id (:id table)
                                           :model_table_name "Test Table"
                                           :status "synced"
                                           :status_changed_at (t/offset-date-time)})
      (let [initial-entry (t2/select-one :model/RemoteSyncObject :model_type "Table" :model_id (:id table))]
        (is (= "synced" (:status initial-entry)))
        ;; Now unpublish the table
        (events/publish-event! :event/table-update
                               {:object (assoc table :is_published false)
                                :user-id (mt/user->id :rasta)})
        (let [update-entry (t2/select-one :model/RemoteSyncObject :model_type "Table" :model_id (:id table))]
          (is (= "removed" (:status update-entry))))))))

(deftest table-moved-to-normal-collection-marks-as-removed-test
  (testing "table moved to non-remote-synced collection is marked as removed"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Collection normal-collection {:name "Normal"}
                   :model/Table table {:name "Test Table"
                                       :is_published true
                                       :collection_id (:id remote-sync-collection)}]
      (t2/delete! :model/RemoteSyncObject)
      ;; First, create an entry with status "synced" directly
      (t2/insert! :model/RemoteSyncObject {:model_type "Table"
                                           :model_id (:id table)
                                           :model_name "Test Table"
                                           :model_table_id (:id table)
                                           :model_table_name "Test Table"
                                           :status "synced"
                                           :status_changed_at (t/offset-date-time)})
      (let [initial-entry (t2/select-one :model/RemoteSyncObject :model_type "Table" :model_id (:id table))]
        (is (= "synced" (:status initial-entry)))
        ;; Now move to normal collection
        (events/publish-event! :event/table-update
                               {:object (assoc table :collection_id (:id normal-collection))
                                :user-id (mt/user->id :rasta)})
        (let [update-entry (t2/select-one :model/RemoteSyncObject :model_type "Table" :model_id (:id table))]
          (is (= "removed" (:status update-entry))))))))

(deftest ^:parallel table-event-derivation-test
  (testing "table events properly derive from :metabase/event"
    (is (isa? ::remote-sync.events/table-change-event :metabase/event))
    (is (isa? :event/table-create ::remote-sync.events/table-change-event))
    (is (isa? :event/table-update ::remote-sync.events/table-change-event))
    (is (isa? :event/table-delete ::remote-sync.events/table-change-event))))

;;; Segment Event Tests

(deftest segment-create-event-creates-entry-test
  (testing "segment-create event creates remote sync object entry for segment in published table in remote-synced collection"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Table table {:name "Test Table"
                                       :is_published true
                                       :collection_id (:id remote-sync-collection)}
                   :model/Segment segment {:name "Test Segment"
                                           :table_id (:id table)
                                           :definition {:source-table (:id table)
                                                        :filter [:> [:field 1 nil] 0]}}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/segment-create
                             {:object segment :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Segment"
                 :model_id (:id segment)
                 :status "create"}
                (first entries)))))))

(deftest segment-update-event-creates-entry-test
  (testing "segment-update event creates remote sync object entry with update status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Table table {:name "Test Table"
                                       :is_published true
                                       :collection_id (:id remote-sync-collection)}
                   :model/Segment segment {:name "Test Segment"
                                           :table_id (:id table)
                                           :definition {:source-table (:id table)
                                                        :filter [:> [:field 1 nil] 0]}}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/segment-update
                             {:object segment :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Segment"
                 :model_id (:id segment)
                 :status "update"}
                (first entries)))))))

(deftest segment-update-archived-sets-delete-test
  (testing "segment-update event with archived=true sets delete status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Table table {:name "Test Table"
                                       :is_published true
                                       :collection_id (:id remote-sync-collection)}
                   :model/Segment segment {:name "Test Segment"
                                           :table_id (:id table)
                                           :definition {:source-table (:id table)
                                                        :filter [:> [:field 1 nil] 0]}}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/segment-update
                             {:object (assoc segment :archived true)
                              :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Segment"
                 :model_id (:id segment)
                 :status "delete"}
                (first entries)))))))

(deftest segment-delete-event-creates-entry-test
  (testing "segment-delete event creates remote sync object entry with delete status"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Table table {:name "Test Table"
                                       :is_published true
                                       :collection_id (:id remote-sync-collection)}
                   :model/Segment segment {:name "Test Segment"
                                           :table_id (:id table)
                                           :definition {:source-table (:id table)
                                                        :filter [:> [:field 1 nil] 0]}}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/segment-delete
                             {:object segment :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Segment"
                 :model_id (:id segment)
                 :status "delete"}
                (first entries)))))))

(deftest segment-event-in-normal-collection-no-entry-test
  (testing "segment events in non-remote-synced collections don't create entries"
    (mt/with-temp [:model/Collection normal-collection {:name "Normal"}
                   :model/Table table {:name "Test Table"
                                       :is_published true
                                       :collection_id (:id normal-collection)}
                   :model/Segment segment {:name "Test Segment"
                                           :table_id (:id table)
                                           :definition {:source-table (:id table)
                                                        :filter [:> [:field 1 nil] 0]}}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/segment-create
                             {:object segment :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 0 (count entries)))))))

(deftest segment-event-unpublished-table-no-entry-test
  (testing "segment events for unpublished tables don't create entries"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Table table {:name "Test Table"
                                       :is_published false
                                       :collection_id (:id remote-sync-collection)}
                   :model/Segment segment {:name "Test Segment"
                                           :table_id (:id table)
                                           :definition {:source-table (:id table)
                                                        :filter [:> [:field 1 nil] 0]}}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/segment-create
                             {:object segment :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 0 (count entries)))))))

(deftest existing-segment-table-unpublished-marks-as-removed-test
  (testing "existing segment is marked as removed when its table is unpublished"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Table table {:name "Test Table"
                                       :is_published true
                                       :collection_id (:id remote-sync-collection)}
                   :model/Segment segment {:name "Test Segment"
                                           :table_id (:id table)
                                           :definition {:source-table (:id table)
                                                        :filter [:> [:field 1 nil] 0]}}]
      (t2/delete! :model/RemoteSyncObject)
      ;; First create a synced entry
      (t2/insert! :model/RemoteSyncObject {:model_type "Segment"
                                           :model_id (:id segment)
                                           :model_name "Test Segment"
                                           :model_table_id (:id table)
                                           :model_table_name "Test Table"
                                           :status "synced"
                                           :status_changed_at (t/offset-date-time)})
      (let [initial-entry (t2/select-one :model/RemoteSyncObject :model_type "Segment" :model_id (:id segment))]
        (is (= "synced" (:status initial-entry)))
        ;; Now "unpublish" the table by simulating an update where the segment's table is no longer in sync scope
        (events/publish-event! :event/segment-update
                               {:object (assoc segment :table_id (:id table))
                                :user-id (mt/user->id :rasta)})
        ;; Since table is still published, should be "update"
        (let [update-entry (t2/select-one :model/RemoteSyncObject :model_type "Segment" :model_id (:id segment))]
          (is (= "update" (:status update-entry))))))))

(deftest ^:parallel segment-event-derivation-test
  (testing "segment events properly derive from :metabase/event"
    (is (isa? ::remote-sync.events/segment-change-event :metabase/event))
    (is (isa? :event/segment-create ::remote-sync.events/segment-change-event))
    (is (isa? :event/segment-update ::remote-sync.events/segment-change-event))
    (is (isa? :event/segment-delete ::remote-sync.events/segment-change-event))))

;;; Field Event Tests

(deftest field-update-event-creates-entry-test
  (testing "field-update event creates remote sync object entry for field in published table in remote-synced collection"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Table table {:name "Test Table"
                                       :is_published true
                                       :collection_id (:id remote-sync-collection)}
                   :model/Field field {:name "test_field"
                                       :table_id (:id table)
                                       :base_type :type/Text}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/field-update
                             {:object field :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 1 (count entries)))
        (is (=? {:model_type "Field"
                 :model_id (:id field)
                 :status "update"}
                (first entries)))))))

(deftest field-update-event-no-entry-for-unpublished-table-test
  (testing "field-update event doesn't create entry for unpublished table"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Table table {:name "Test Table"
                                       :is_published false
                                       :collection_id (:id remote-sync-collection)}
                   :model/Field field {:name "test_field"
                                       :table_id (:id table)
                                       :base_type :type/Text}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/field-update
                             {:object field :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 0 (count entries)))))))

(deftest field-update-event-no-entry-for-normal-collection-test
  (testing "field-update event doesn't create entry for table in non-remote-synced collection"
    (mt/with-temp [:model/Collection normal-collection {:name "Normal"}
                   :model/Table table {:name "Test Table"
                                       :is_published true
                                       :collection_id (:id normal-collection)}
                   :model/Field field {:name "test_field"
                                       :table_id (:id table)
                                       :base_type :type/Text}]
      (t2/delete! :model/RemoteSyncObject)
      (events/publish-event! :event/field-update
                             {:object field :user-id (mt/user->id :rasta)})
      (let [entries (t2/select :model/RemoteSyncObject)]
        (is (= 0 (count entries)))))))

(deftest existing-field-table-unpublished-marks-as-removed-test
  (testing "existing field is marked as removed when its table is no longer in sync scope"
    (mt/with-temp [:model/Collection remote-sync-collection {:is_remote_synced true :name "Remote-Sync"}
                   :model/Collection normal-collection {:name "Normal"}
                   :model/Table table {:name "Test Table"
                                       :is_published true
                                       :collection_id (:id remote-sync-collection)}
                   :model/Field field {:name "test_field"
                                       :table_id (:id table)
                                       :base_type :type/Text}]
      (t2/delete! :model/RemoteSyncObject)
      ;; First create a synced entry
      (t2/insert! :model/RemoteSyncObject {:model_type "Field"
                                           :model_id (:id field)
                                           :model_name "test_field"
                                           :model_table_id (:id table)
                                           :model_table_name "Test Table"
                                           :status "synced"
                                           :status_changed_at (t/offset-date-time)})
      (let [initial-entry (t2/select-one :model/RemoteSyncObject :model_type "Field" :model_id (:id field))]
        (is (= "synced" (:status initial-entry)))
        ;; Move table to normal collection
        (t2/update! :model/Table (:id table) {:collection_id (:id normal-collection)})
        ;; Now trigger field update event - field's table is no longer in sync scope
        (events/publish-event! :event/field-update
                               {:object field :user-id (mt/user->id :rasta)})
        (let [update-entry (t2/select-one :model/RemoteSyncObject :model_type "Field" :model_id (:id field))]
          (is (= "removed" (:status update-entry))))))))

(deftest ^:parallel field-event-derivation-test
  (testing "field events properly derive from :metabase/event"
    (is (isa? ::remote-sync.events/field-change-event :metabase/event))
    (is (isa? :event/field-create ::remote-sync.events/field-change-event))
    (is (isa? :event/field-update ::remote-sync.events/field-change-event))
    (is (isa? :event/field-delete ::remote-sync.events/field-change-event))))
