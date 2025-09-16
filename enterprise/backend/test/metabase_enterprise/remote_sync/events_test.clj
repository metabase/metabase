(ns metabase-enterprise.remote-sync.events-test
  "Tests for the library events system.

   Tests event publishing, handling, and model change tracking functionality."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.events :as lib.events]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

;;; Helper Functions Tests

(deftest ^:parallel model-in-library-collection?-test
  (testing "model-in-library-collection? detects library collections correctly"
    (mt/with-temp [:model/Collection library-collection {:type "library" :name "Library"}
                   :model/Collection normal-collection {:name "Normal"}]
      (testing "returns true for models in library collections"
        (is (true? (#'lib.events/model-in-library-collection?
                    {:collection_id (:id library-collection)}))))

      (testing "returns false for models in normal collections"
        (is (false? (#'lib.events/model-in-library-collection?
                     {:collection_id (:id normal-collection)}))))

      (testing "returns false when collection_id is nil"
        (is (false? (#'lib.events/model-in-library-collection? {:collection_id nil}))))

      (testing "returns false when model has no collection_id"
        (is (false? (#'lib.events/model-in-library-collection? {})))))))

;;; Library Sync Event Tests

(deftest publish-library-sync!-test
  (testing "publish-library-sync! publishes events correctly"
    (let [published-events (atom [])]
      (with-redefs [events/publish-event! (fn [topic event]
                                            (swap! published-events conj {:topic topic :event event})
                                            event)]
        (testing "publishes event with minimal parameters"
          (reset! published-events [])
          (lib.events/publish-library-sync! "import" nil 123)
          (is (= 1 (count @published-events)))
          (let [{:keys [topic event]} (first @published-events)]
            (is (= :event/library-sync topic))
            (is (=? {:sync-type "import"
                     :library-id nil
                     :user-id 123}
                    event))
            (is (instance? java.time.Instant (:timestamp event)))))

        (testing "publishes event with all parameters including metadata"
          (reset! published-events [])
          (lib.events/publish-library-sync! :full 456 789
                                            {:branch "main"
                                             :status "success"
                                             :message "Test sync"})
          (is (= 1 (count @published-events)))
          (let [{:keys [topic event]} (first @published-events)]
            (is (= :event/library-sync topic))
            (is (=? {:sync-type :full
                     :library-id 456
                     :user-id 789
                     :branch "main"
                     :status "success"
                     :message "Test sync"}
                    event))
            (is (instance? java.time.Instant (:timestamp event)))))))))

(deftest library-sync-event-handler-test
  (testing "library-sync event handler processes events correctly"
    (mt/with-model-cleanup [:model/LibraryChangeLog]
      (testing "handler processes library-sync events and creates database entries"
        ;; Publish an event which should trigger the handler to create a database entry
        (events/publish-event! :event/library-sync
                               {:sync-type "import"
                                :library-id 123
                                :user-id 456
                                :status "success"
                                :source-branch "main"
                                :target-branch "production"
                                :message "Test import"
                                :timestamp (t/instant)})

        ;; Query the database to verify the entry was created
        (let [entries (t2/select :model/LibraryChangeLog)]
          (is (= 1 (count entries)))
          (is (=? {:sync_type "import"
                   :status "success"
                   :source_branch "main"
                   :target_branch "production"
                   :message "Test import"}
                  (first entries))))))))

;;; Model Change Event Tests

(deftest card-change-events-test
  (testing "card change events create library change log entries"
    (mt/with-temp [:model/Collection library-collection {:type "library" :name "Library"}
                   :model/Collection normal-collection {:name "Normal"}
                   :model/Card library-card {:name "Test Card"
                                             :collection_id (:id library-collection)}
                   :model/Card normal-card {:name "Normal Card"
                                            :collection_id (:id normal-collection)}]
      (mt/with-model-cleanup [:model/LibraryChangeLog]
        (testing "card-create event creates change log entry for library cards"
          ;; Clear any existing entries
          (t2/delete! :model/LibraryChangeLog)

          ;; Publish card-create event for a library card
          (events/publish-event! :event/card-create
                                 {:object library-card :user-id (mt/user->id :rasta)})

          ;; Verify entry was created in the database
          (let [entries (t2/select :model/LibraryChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:model_type "card"
                     :model_entity_id (re-pattern (str (:id library-card) ".*"))
                     :sync_type "create"}
                    (first entries)))))

        (testing "card-update event creates change log entry for library cards"
          (t2/delete! :model/LibraryChangeLog)

          (events/publish-event! :event/card-update
                                 {:object library-card :user-id (mt/user->id :rasta)})

          (let [entries (t2/select :model/LibraryChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:sync_type "update"}
                    (first entries)))))

        (testing "card-delete event creates change log entry for library cards"
          (t2/delete! :model/LibraryChangeLog)

          (events/publish-event! :event/card-delete
                                 {:object library-card :user-id (mt/user->id :rasta)})

          (let [entries (t2/select :model/LibraryChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:sync_type "delete"}
                    (first entries)))))

        (testing "card events in non-library collections don't create entries"
          (t2/delete! :model/LibraryChangeLog)

          ;; Publish event for a card in a normal collection
          (events/publish-event! :event/card-create
                                 {:object normal-card :user-id (mt/user->id :rasta)})

          ;; Verify no entry was created
          (let [entries (t2/select :model/LibraryChangeLog)]
            (is (= 0 (count entries)))))))))

(deftest dashboard-change-events-test
  (testing "dashboard change events create library change log entries"
    (mt/with-temp [:model/Collection library-collection {:type "library" :name "Library"}
                   :model/Dashboard dashboard {:name "Test Dashboard"
                                               :collection_id (:id library-collection)}]
      (mt/with-model-cleanup [:model/LibraryChangeLog]
        (testing "dashboard-create event creates change log entry"
          (t2/delete! :model/LibraryChangeLog)

          (events/publish-event! :event/dashboard-create
                                 {:object dashboard :user-id (mt/user->id :rasta)})

          (let [entries (t2/select :model/LibraryChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:model_type "dashboard"
                     :model_entity_id (re-pattern (str (:id dashboard) ".*"))
                     :sync_type "create"}
                    (first entries)))))

        (testing "dashboard-update event creates change log entry"
          (t2/delete! :model/LibraryChangeLog)

          (events/publish-event! :event/dashboard-update
                                 {:object dashboard :user-id (mt/user->id :rasta)})

          (let [entries (t2/select :model/LibraryChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:sync_type "update"}
                    (first entries)))))

        (testing "dashboard-delete event creates change log entry"
          (t2/delete! :model/LibraryChangeLog)

          (events/publish-event! :event/dashboard-delete
                                 {:object dashboard :user-id (mt/user->id :rasta)})

          (let [entries (t2/select :model/LibraryChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:sync_type "delete"}
                    (first entries)))))))))

(deftest document-change-events-test
  (testing "document change events create library change log entries"
    (mt/with-temp [:model/Collection library-collection {:type "library" :name "Library"}]
      (mt/with-model-cleanup [:model/LibraryChangeLog]
        ;; Mock document since it might not exist in the model
        (let [document {:id 999 :name "Test Document" :collection_id (:id library-collection)}]

          (testing "document-create event creates change log entry"
            (t2/delete! :model/LibraryChangeLog)

            (events/publish-event! :event/document-create
                                   {:object document :user-id (mt/user->id :rasta)})

            (let [entries (t2/select :model/LibraryChangeLog)]
              (is (= 1 (count entries)))
              (is (=? {:model_type "document"
                       :model_entity_id (re-pattern (str (:id document) ".*"))
                       :sync_type "create"}
                      (first entries)))))

          (testing "document-update event creates change log entry"
            (t2/delete! :model/LibraryChangeLog)

            (events/publish-event! :event/document-update
                                   {:object document :user-id (mt/user->id :rasta)})

            (let [entries (t2/select :model/LibraryChangeLog)]
              (is (= 1 (count entries)))
              (is (=? {:sync_type "update"}
                      (first entries)))))

          (testing "document-delete event creates change log entry"
            (t2/delete! :model/LibraryChangeLog)

            (events/publish-event! :event/document-delete
                                   {:object document :user-id (mt/user->id :rasta)})

            (let [entries (t2/select :model/LibraryChangeLog)]
              (is (= 1 (count entries)))
              (is (=? {:sync_type "delete"}
                      (first entries))))))))))

(deftest collection-touch-events-test
  (testing "collection touch events create library change log entries"
    (mt/with-temp [:model/Collection library-collection {:type "library" :name "Library"}
                   :model/Collection normal-collection {:name "Normal"}]
      (mt/with-model-cleanup [:model/LibraryChangeLog]
        (testing "collection-touch event creates change log entry for library collections"
          (t2/delete! :model/LibraryChangeLog)

          (events/publish-event! :event/collection-touch
                                 {:object library-collection :user-id (mt/user->id :rasta)})

          (let [entries (t2/select :model/LibraryChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:model_type "collection"
                     :model_entity_id (re-pattern (str (:id library-collection) ".*"))
                     :sync_type "touch"}
                    (first entries)))))

        (testing "collection-touch event doesn't create entry for non-library collections"
          (t2/delete! :model/LibraryChangeLog)

          (events/publish-event! :event/collection-touch
                                 {:object normal-collection :user-id (mt/user->id :rasta)})

          (let [entries (t2/select :model/LibraryChangeLog)]
            (is (= 0 (count entries)))))))))

(deftest create-library-change-log-entry!-test
  (testing "create-library-change-log-entry! creates correct entries"
    (mt/with-model-cleanup [:model/LibraryChangeLog]
      (mt/with-current-user (mt/user->id :rasta)
        (testing "creates entry with explicit user-id"
          (t2/delete! :model/LibraryChangeLog)

          (#'lib.events/create-library-change-log-entry! "card" 123 "update" 456)

          (let [entries (t2/select :model/LibraryChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:model_type "card"
                     :model_entity_id #"123.*"
                     :sync_type "update"
                     :source_branch nil
                     :target_branch nil
                     :status "success"}
                    (first entries)))
            (is (re-find #"update card by user 456" (:message (first entries))))))

        (testing "creates entry with current user-id when not specified"
          (t2/delete! :model/LibraryChangeLog)

          (#'lib.events/create-library-change-log-entry! "dashboard" 789 "create")

          (let [entries (t2/select :model/LibraryChangeLog)]
            (is (= 1 (count entries)))
            (is (=? {:model_type "dashboard"
                     :model_entity_id #"789.*"
                     :sync_type "create"}
                    (first entries)))
            (is (re-find #"create dashboard by user .*" (:message (first entries))))))))))

(deftest ^:parallel event-derivation-test
  (testing "events properly derive from :metabase/event"
    (testing "library-sync events"
      (is (isa? ::lib.events/library-sync-event :metabase/event))
      (is (isa? :event/library-sync ::lib.events/library-sync-event)))

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
