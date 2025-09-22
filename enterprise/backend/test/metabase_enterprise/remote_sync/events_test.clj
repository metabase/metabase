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

(deftest model-in-remote-synced-collection?-test
  (testing "model-in-remote-synced-collection? detects remote-synced collections correctly"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced" :name "Remote-Sync"}
                   :model/Collection normal-collection {:name "Normal"}]
      (testing "returns true for models in remote-synced collections"
        (is (true? (#'lib.events/model-in-remote-synced-collection?
                    {:collection_id (:id remote-sync-collection)}))))

      (testing "returns false for models in normal collections"
        (is (false? (#'lib.events/model-in-remote-synced-collection?
                     {:collection_id (:id normal-collection)}))))

      (testing "returns false when collection_id is nil"
        (is (false? (#'lib.events/model-in-remote-synced-collection? {:collection_id nil}))))

      (testing "returns false when model has no collection_id"
        (is (false? (#'lib.events/model-in-remote-synced-collection? {})))))))

;;; Remote-Sync Sync Event Tests

(deftest publish-remote-sync!-test
  (testing "publish-remote-sync! publishes events correctly"
    (let [published-events (atom [])]
      (with-redefs [events/publish-event! (fn [topic event]
                                            (swap! published-events conj {:topic topic :event event})
                                            event)]
        (testing "publishes event with minimal parameters"
          (reset! published-events [])
          (lib.events/publish-remote-sync! "import" nil 123)
          (is (= 1 (count @published-events)))
          (let [{:keys [topic event]} (first @published-events)]
            (is (= :event/remote-sync topic))
            (is (=? {:sync-type "import"
                     :collection-id nil
                     :user-id 123}
                    event))
            (is (instance? java.time.Instant (:timestamp event)))))

        (testing "publishes event with all parameters including metadata"
          (reset! published-events [])
          (lib.events/publish-remote-sync! :full 456 789
                                           {:branch "main"
                                            :status "success"
                                            :message "Test sync"})
          (is (= 1 (count @published-events)))
          (let [{:keys [topic event]} (first @published-events)]
            (is (= :event/remote-sync topic))
            (is (=? {:sync-type :full
                     :collection-id 456
                     :user-id 789
                     :branch "main"
                     :status "success"
                     :message "Test sync"}
                    event))
            (is (instance? java.time.Instant (:timestamp event)))))))))

(deftest remote-sync-event-handler-test
  (testing "remote-sync event handler processes events correctly"
    (mt/with-model-cleanup [:model/RemoteSyncChangeLog]
      (testing "handler processes remote-sync events and creates database entries"
        ;; Publish an event which should trigger the handler to create a database entry
        (events/publish-event! :event/remote-sync
                               {:sync-type "import"
                                :collection-id "asdfasdf"
                                :user-id 456
                                :status "success"
                                :source-branch "main"
                                :target-branch "production"
                                :message "Test import"
                                :timestamp (t/instant)})

        ;; Query the database to verify the entry was created
        (let [entries (t2/select :model/RemoteSyncChangeLog)]
          (is (= 1 (count entries)))
          (is (=? {:sync_type "import"
                   :status "success"
                   :source_branch "main"
                   :target_branch "production"
                   :message "Test import"}
                  (first entries))))))))

;;; Model Change Event Tests

(deftest card-change-events-test
  (testing "card change events create remote-sync change log entries"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced" :name "Remote-Sync"}
                   :model/Collection normal-collection {:name "Normal"}
                   :model/Card remote-sync-card {:name "Test Card"
                                                 :collection_id (:id remote-sync-collection)}
                   :model/Card normal-card {:name "Normal Card"
                                            :collection_id (:id normal-collection)}]
      (mt/with-model-cleanup [:model/RemoteSyncChangeLog]
        (testing "card-create event creates change log entry for remote-sync cards"
          ;; Clear any existing entries
          (t2/delete! :model/RemoteSyncChangeLog)

          ;; Publish card-create event for a remote-sync card
          (events/publish-event! :event/card-create
                                 {:object remote-sync-card :user-id (mt/user->id :rasta)})

          ;; Verify entry was created in the database
          (let [entries (t2/select :model/RemoteSyncChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:model_type "Card"
                     :model_entity_id (:entity_id remote-sync-card)
                     :sync_type "create"}
                    (first entries)))))

        (testing "card-update event creates change log entry for remote-sync cards"
          (t2/delete! :model/RemoteSyncChangeLog)

          (events/publish-event! :event/card-update
                                 {:object remote-sync-card :user-id (mt/user->id :rasta)})

          (let [entries (t2/select :model/RemoteSyncChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:model_type "Card"
                     :model_entity_id (:entity_id remote-sync-card)
                     :sync_type "update"}
                    (first entries)))))

        (testing "card-update event with archived=true creates delete entry"
          (t2/delete! :model/RemoteSyncChangeLog)

          (events/publish-event! :event/card-update
                                 {:object (assoc remote-sync-card :archived true)
                                  :user-id (mt/user->id :rasta)})

          (let [entries (t2/select :model/RemoteSyncChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:model_type "Card"
                     :model_entity_id (:entity_id remote-sync-card)
                     :sync_type "delete"}
                    (first entries)))))

        (testing "card-delete event creates change log entry for remote-sync cards"
          (t2/delete! :model/RemoteSyncChangeLog)

          (events/publish-event! :event/card-delete
                                 {:object remote-sync-card :user-id (mt/user->id :rasta)})

          (let [entries (t2/select :model/RemoteSyncChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:model_type "Card"
                     :model_entity_id (:entity_id remote-sync-card)
                     :sync_type "delete"}
                    (first entries)))))

        (testing "card events in non-remote-sync collections don't create entries"
          (t2/delete! :model/RemoteSyncChangeLog)

          ;; Publish event for a card in a normal collection
          (events/publish-event! :event/card-create
                                 {:object normal-card :user-id (mt/user->id :rasta)})

          ;; Verify no entry was created
          (let [entries (t2/select :model/RemoteSyncChangeLog)]
            (is (= 0 (count entries)))))))))

(deftest dashboard-change-events-test
  (testing "dashboard change events create remote-sync change log entries"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced" :name "Remote-Sync"}
                   :model/Dashboard dashboard {:name "Test Dashboard"
                                               :collection_id (:id remote-sync-collection)}]
      (mt/with-model-cleanup [:model/RemoteSyncChangeLog]
        (testing "dashboard-create event creates change log entry"
          (t2/delete! :model/RemoteSyncChangeLog)

          (events/publish-event! :event/dashboard-create
                                 {:object dashboard :user-id (mt/user->id :rasta)})

          (let [entries (t2/select :model/RemoteSyncChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:model_type "Dashboard"
                     :model_entity_id (:entity_id dashboard)
                     :sync_type "create"}
                    (first entries)))))

        (testing "dashboard-update event creates change log entry"
          (t2/delete! :model/RemoteSyncChangeLog)

          (events/publish-event! :event/dashboard-update
                                 {:object dashboard :user-id (mt/user->id :rasta)})

          (let [entries (t2/select :model/RemoteSyncChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:model_type "Dashboard"
                     :model_entity_id (:entity_id dashboard)
                     :sync_type "update"}
                    (first entries)))))

        (testing "dashboard-update event with archived=true creates delete entry"
          (t2/delete! :model/RemoteSyncChangeLog)

          (events/publish-event! :event/dashboard-update
                                 {:object (assoc dashboard :archived true)
                                  :user-id (mt/user->id :rasta)})

          (let [entries (t2/select :model/RemoteSyncChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:model_type "Dashboard"
                     :model_entity_id (:entity_id dashboard)
                     :sync_type "delete"}
                    (first entries)))))

        (testing "dashboard-delete event creates change log entry"
          (t2/delete! :model/RemoteSyncChangeLog)

          (events/publish-event! :event/dashboard-delete
                                 {:object dashboard :user-id (mt/user->id :rasta)})

          (let [entries (t2/select :model/RemoteSyncChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:model_type "Dashboard"
                     :model_entity_id (:entity_id dashboard)
                     :sync_type "delete"}
                    (first entries)))))))))

(deftest document-change-events-test
  (testing "document change events create remote-sync change log entries"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced" :name "Remote-Sync"}
                   :model/Document document {:collection_id (u/the-id remote-sync-collection)}]
      (mt/with-model-cleanup [:model/RemoteSyncChangeLog]
        (testing "document-create event creates change log entry"
          (t2/delete! :model/RemoteSyncChangeLog)

          (events/publish-event! :event/document-create
                                 {:object document :user-id (mt/user->id :rasta)})

          (let [entries (t2/select :model/RemoteSyncChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:model_type "Document"
                     :model_entity_id (:entity_id document)
                     :sync_type "create"}
                    (first entries)))))

        (testing "document-update event creates change log entry"
          (t2/delete! :model/RemoteSyncChangeLog)

          (events/publish-event! :event/document-update
                                 {:object document :user-id (mt/user->id :rasta)})

          (let [entries (t2/select :model/RemoteSyncChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:model_type "Document"
                     :model_entity_id (:entity_id document)
                     :sync_type "update"}
                    (first entries)))))

        (testing "document-update event with archived=true creates delete entry"
          (t2/delete! :model/RemoteSyncChangeLog)

          (events/publish-event! :event/document-update
                                 {:object (assoc document :archived true)
                                  :user-id (mt/user->id :rasta)})

          (let [entries (t2/select :model/RemoteSyncChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:model_type "Document"
                     :model_entity_id (:entity_id document)
                     :sync_type "delete"}
                    (first entries)))))

        (testing "document-delete event creates change log entry"
          (t2/delete! :model/RemoteSyncChangeLog)

          (events/publish-event! :event/document-delete
                                 {:object document :user-id (mt/user->id :rasta)})

          (let [entries (t2/select :model/RemoteSyncChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:model_type "Document"
                     :model_entity_id (:entity_id document)
                     :sync_type "delete"}
                    (first entries)))))))))

(deftest collection-touch-events-test
  (testing "collection touch events create remote-sync change log entries"
    (mt/with-temp [:model/Collection remote-sync-collection {:type "remote-synced"
                                                             :name "Remote-Sync"}
                   :model/Collection normal-collection {:name "Normal"}]
      (mt/with-model-cleanup [:model/RemoteSyncChangeLog]
        (testing "collection-touch event creates change log entry for remote-sync collections"
          (t2/delete! :model/RemoteSyncChangeLog)

          (events/publish-event! :event/collection-touch
                                 {:object remote-sync-collection :user-id (mt/user->id :rasta)})

          (let [entries (t2/select :model/RemoteSyncChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:model_type "Collection"
                     :model_entity_id (:entity_id remote-sync-collection)
                     :sync_type "update"}
                    (first entries)))))

        (testing "collection-touch event with archived=true creates delete entry"
          (t2/delete! :model/RemoteSyncChangeLog)

          (events/publish-event! :event/collection-touch
                                 {:object (assoc remote-sync-collection :archived true)
                                  :user-id (mt/user->id :rasta)})

          (let [entries (t2/select :model/RemoteSyncChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:model_type "Collection"
                     :model_entity_id (:entity_id remote-sync-collection)
                     :sync_type "delete"}
                    (first entries)))))

        (testing "collection-touch event doesn't create entry for non-remote-sync collections"
          (t2/delete! :model/RemoteSyncChangeLog)

          (events/publish-event! :event/collection-touch
                                 {:object normal-collection :user-id (mt/user->id :rasta)})

          (let [entries (t2/select :model/RemoteSyncChangeLog)]
            (is (= 0 (count entries)))))))))

(deftest create-remote-sync-change-log-entry!-test
  (testing "create-remote-sync-change-log-entry! creates correct entries"
    (mt/with-model-cleanup [:model/RemoteSyncChangeLog]
      (mt/with-current-user (mt/user->id :rasta)
        (testing "creates entry with explicit user-id using entity_id"
          (t2/delete! :model/RemoteSyncChangeLog)

          (#'lib.events/create-remote-sync-change-log-entry! "Card" "entity-id-card-123456" "update" 456)

          (let [entries (t2/select :model/RemoteSyncChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:model_type "Card"
                     :model_entity_id "entity-id-card-123456"
                     :sync_type "update"
                     :source_branch nil
                     :target_branch nil
                     :status "success"}
                    (first entries)))
            (is (re-find #"update Card by user 456" (:message (first entries))))))

        (testing "creates entry with current user-id when not specified"
          (t2/delete! :model/RemoteSyncChangeLog)

          (#'lib.events/create-remote-sync-change-log-entry! "Dashboard" "entity-id-dash-789012" "create")

          (let [entries (t2/select :model/RemoteSyncChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:model_type "Dashboard"
                     :model_entity_id "entity-id-dash-789012"
                     :sync_type "create"}
                    (first entries)))
            (is (re-find #"create Dashboard by user .*" (:message (first entries))))))))))

(deftest event-derivation-test
  (testing "events properly derive from :metabase/event"
    (testing "remote-sync events"
      (is (isa? ::lib.events/remote-sync-event :metabase/event))
      (is (isa? :event/remote-sync ::lib.events/remote-sync-event)))

    (testing "card events"
      (is (isa? ::lib.events/card-change-event :metabase/event))
      (is (isa? :event/card-create ::lib.events/card-change-event))
      (is (isa? :event/card-update ::lib.events/card-change-event))
      (is (isa? :event/card-delete ::lib.events/card-change-event)))

    (testing "dashboard events"
      (is (isa? ::lib.events/dashboard-change-event :metabase/event))
      (is (isa? :event/dashboard-create ::lib.events/dashboard-change-event))
      (is (isa? :event/dashboard-update ::lib.events/dashboard-change-event))
      (is (isa? :event/dashboard-delete ::lib.events/dashboard-change-event)))

    (testing "document events"
      (is (isa? ::lib.events/document-change-event :metabase/event))
      (is (isa? :event/document-create ::lib.events/document-change-event))
      (is (isa? :event/document-update ::lib.events/document-change-event))
      (is (isa? :event/document-delete ::lib.events/document-change-event)))

    (testing "collection events"
      (is (isa? ::lib.events/collection-touch-event :metabase/event))
      (is (isa? :event/collection-touch ::lib.events/collection-touch-event)))))
