(ns metabase.audit-app.events.audit-log-test
  "Tests for `publish-event!` handlers which record events to the audit log. These tests generally call `publish-event!`
  with the appropriate arguments for a given event, and check that the correct data was written to the audit_log table.
  Integration tests that check that feature code is calling `publish-event!` in the correct places should be placed in
  the test code for the feature."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.audit-app.db :as audit-app.db]
   [metabase.audit-app.events.audit-log :as events.audit-log]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.notification.test-util :as notification.tu]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment events.audit-log/keep-me)

(clojure.test/use-fixtures :once
  (fn [test-fn]
    (mt/with-premium-features #{:audit-app}
      (test-fn))))

(deftest card-create-test
  (testing ":card-create event"
    (mt/with-test-user :rasta
      (mt/with-temp [:model/Card card {:name "My Cool Card"}]
        (is (partial=
             {:topic    :card-create
              :user_id  (mt/user->id :rasta)
              :model    "Card"
              :model_id (:id card)
              :details  {:name "My Cool Card", :description nil, :database_id (mt/id) :table_id nil}}
             (mt/latest-audit-log-entry "card-create" (:id card))))))))

(deftest card-create-nested-query-test
  (testing :card-create
    (testing "when I save a Card that uses a NESTED query, is the activity recorded? :D"
      (mt/with-test-user :rasta
        (mt/with-temp [:model/Card card-1 {:name          "My Cool Card"
                                           :dataset_query {:database (mt/id)
                                                           :type     :query
                                                           :query    {:source-table (mt/id :venues)}}}
                       :model/Card card-2 {:name          "My Cool NESTED Card"
                                           :dataset_query {:database lib.schema.id/saved-questions-virtual-database-id
                                                           :type     :query
                                                           :query    {:source-table (str "card__" (u/the-id card-1))}}}]
          (is (partial=
               {:topic    :card-create
                :user_id  (mt/user->id :rasta)
                :model    "Card"
                :model_id (:id card-2)
                :details  {:name        "My Cool NESTED Card"
                           :description nil
                           :database_id (mt/id)
                           :table_id    (mt/id :venues)}}
               (mt/latest-audit-log-entry "card-create" (:id card-2)))))))))

(deftest card-update-event-test
  (testing :card-update
    (doseq [card-type [:question :model]]
      (testing card-type
        (mt/with-test-user :rasta
          (mt/with-temp [:model/Card card {:name "Old Name", :type :question}]
            (t2/update! :model/Card :id (:id card) {:name "My Cool Card", :type card-type})
            (is (partial=
                 {:topic    :card-update
                  :user_id  (mt/user->id :rasta)
                  :model    "Card"
                  :model_id (:id card)
                  :details  {:previous (cond-> {:name "Old Name"}
                                         (= card-type :model) (assoc :model? false))
                             :new (cond-> {:name "My Cool Card"}
                                    (= card-type :model) (assoc :model? true))}}
                 (mt/latest-audit-log-entry "card-update" (:id card))))))))))

(deftest card-delete-event-test
  (testing :card-delete
    (doseq [card-type [:question :model]]
      (testing card-type
        (mt/with-test-user :rasta
          (mt/with-temp [:model/Card card {:name "My Cool Card", :type card-type}]
            (t2/delete! :model/Card :id (:id card))
            (is (partial=
                 {:topic    :card-delete
                  :user_id  (mt/user->id :rasta)
                  :model    "Card"
                  :model_id (:id card)
                  :details  (cond-> {:name "My Cool Card", :description nil}
                              (= card-type :model) (assoc :model? true))}
                 (mt/latest-audit-log-entry "card-delete" (:id card))))))))))

(deftest dashboard-create-event-test
  (testing :dashboard-create
    (mt/with-test-user :rasta
      (mt/with-temp [:model/Dashboard dashboard {:name "My Cool Dashboard"}]
        (is (partial=
             {:topic    :dashboard-create
              :user_id  (mt/user->id :rasta)
              :model    "Dashboard"
              :model_id (:id dashboard)
              :details  {:name "My Cool Dashboard", :description nil}}
             (mt/latest-audit-log-entry "dashboard-create" (:id dashboard))))))))

(deftest dashboard-delete-event-test
  (testing :dashboard-delete
    (mt/with-test-user :rasta
      (mt/with-temp [:model/Dashboard dashboard {:name "My Cool Dashboard"}]
        (t2/delete! :model/Dashboard :id (:id dashboard))
        (is (partial=
             {:topic    :dashboard-delete
              :user_id  (mt/user->id :rasta)
              :model    "Dashboard"
              :model_id (:id dashboard)
              :details  {:name "My Cool Dashboard", :description nil}}
             (mt/latest-audit-log-entry "dashboard-delete" (:id dashboard))))))))

(defn- dashcard-details
  [dashboard card dashcard]
  {:name        (:name dashboard)
   :description nil
   :dashcards   [{:description (:description card)
                  :name        (:name card)
                  :id          (:id dashcard)
                  :card_id     (:id card)}]})

(deftest dashboard-add-cards-event-test
  (testing :dashboard-add-cards
    (mt/with-temp [:model/Dashboard dashboard {:name "My Cool Dashboard"}
                   :model/Card      card {}]
      (mt/with-test-user :rasta
        (let [dashcard (t2/insert-returning-instance! :model/DashboardCard {:dashboard_id (:id dashboard)
                                                                            :card_id      (:id card)
                                                                            :row 0 :col 0 :size_x 4 :size_y 4})]
          (is (partial=
               {:topic    :dashboard-add-cards
                :user_id  (mt/user->id :rasta)
                :model    "Dashboard"
                :model_id (:id dashboard)
                :details  (dashcard-details dashboard card dashcard)}
               (mt/latest-audit-log-entry "dashboard-add-cards" (:id dashboard)))))))))

(deftest dashboard-remove-cards-event-test
  (testing :dashboard-remove-cards
    (mt/with-temp [:model/Dashboard     dashboard {:name "My Cool Dashboard"}
                   :model/Card          card {}
                   :model/DashboardCard dashcard  {:dashboard_id (:id dashboard), :card_id (:id card)}]
      (mt/with-test-user :rasta
        (t2/delete! :model/DashboardCard :id (:id dashcard))
        (is (partial=
             {:topic    :dashboard-remove-cards
              :user_id  (mt/user->id :rasta)
              :model    "Dashboard"
              :model_id (:id dashboard)
              :details  (dashcard-details dashboard card dashcard)}
             (mt/latest-audit-log-entry "dashboard-remove-cards" (:id dashboard))))))))

(deftest install-event-test
  (testing :install
    (is (= {}
           (events/publish-event! :event/install {})))
    (is (= {:topic       :install
            :user_id     nil
            :model       nil
            :model_id    nil
            :details     {}}
           (mt/latest-audit-log-entry "install")))))

(deftest subscription-unsubscribe-event-test
  (testing :subscription-unsubscribe
    (mt/with-test-user :rasta
      (events/publish-event! :event/subscription-unsubscribe {:object {:email "test"}})
      (is (= {:topic       :subscription-unsubscribe
              :user_id     (mt/user->id :rasta)
              :model       "Pulse"
              :model_id    nil
              :details     {:email "test"}}
             (mt/latest-audit-log-entry "subscription-unsubscribe"))))))

(deftest subscription-unsubscribe-undo-event-test
  (testing :subscription-unsubscribe-undo
    (mt/with-test-user :rasta
      (events/publish-event! :event/subscription-unsubscribe-undo {:object {:email "test"}})
      (is (= {:topic       :subscription-unsubscribe-undo
              :user_id     (mt/user->id :rasta)
              :model       "Pulse"
              :model_id    nil
              :details     {:email "test"}}
             (mt/latest-audit-log-entry "subscription-unsubscribe-undo"))))))

(deftest subscription-send-event-test
  (testing :subscription-send
    (mt/with-premium-features #{:audit-app}
      (let [id 1]
        (mt/with-test-user :rasta
          (events/publish-event! :event/subscription-send {:id      id
                                                           :user-id (mt/user->id :lucky)
                                                           :object  {:recipients [[{:email "test"}]]
                                                                     :filters    []}}))
        (is (= {:topic       :subscription-send
                :user_id     (mt/user->id :lucky)
                :model       "Pulse"
                :model_id    id
                :details     {:recipients [[{:email "test"}]]
                              :filters    []}}
               (mt/latest-audit-log-entry "subscription-send" id)))))))

(deftest alert-send-event-test
  (testing :alert-send
    (mt/with-model-cleanup [:model/AuditLog]
      (let [id 1]
        (mt/with-test-user :rasta
          (events/publish-event! :event/alert-send {:id      id
                                                    :user-id (mt/user->id :lucky)
                                                    :object  {:recipients [[{:email "test"}]]
                                                              :filters    []}}))
        (is (= {:topic       :alert-send
                :user_id     (mt/user->id :lucky)
                :model       "Pulse"
                :model_id    id
                :details     {:recipients [[{:email "test"}]]
                              :filters    []}}
               (mt/latest-audit-log-entry "alert-send" id)))))))

(deftest alert-unsubscribe-event-test
  (testing :alert-unsubscribe
    (mt/with-test-user :rasta
      (events/publish-event! :event/alert-unsubscribe {:object {:email "test"}})
      (is (= {:topic       :alert-unsubscribe
              :user_id     (mt/user->id :rasta)
              :model       "Pulse"
              :model_id    nil
              :details     {:email "test"}}
             (mt/latest-audit-log-entry "alert-unsubscribe"))))))

(deftest segment-create-event-test
  (testing :segment-create
    (mt/with-test-user :rasta
      (mt/with-temp [:model/Segment segment]
        (is (= {:topic       :segment-create
                :user_id     (mt/user->id :rasta)
                :model       "Segment"
                :model_id    (:id segment)
                :details     {:name        (:name segment)
                              :description (:description segment)
                              :database_id (mt/id)
                              :table_id    (mt/id :checkins)}}
               (mt/latest-audit-log-entry "segment-create" (:id segment))))))))

(deftest segment-update-event-test
  (testing :segment-update
    (mt/with-test-user :rasta
      (mt/with-temp [:model/Segment segment]
        (events/with-event-context {:revision-message "update this mofo"}
          (t2/update! :model/Segment :id (:id segment) {:name "Renamed segment"}))
        (is (= {:topic       :segment-update
                :user_id     (mt/user->id :rasta)
                :model       "Segment"
                :model_id    (:id segment)
                :details     {:name             "Renamed segment"
                              :description      (:description segment)
                              :revision-message "update this mofo"
                              :database_id      (mt/id)
                              :table_id         (mt/id :checkins)}}
               (mt/latest-audit-log-entry "segment-update" (:id segment))))))))

(deftest segment-delete-event-test
  (testing :segment-delete
    (mt/with-test-user :rasta
      (mt/with-temp [:model/Segment segment]
        (events/with-event-context {:revision-message "deleted"}
          (t2/delete! :model/Segment :id (:id segment)))
        (is (= {:topic       :segment-delete
                :user_id     (mt/user->id :rasta)
                :model       "Segment"
                :model_id    (:id segment)
                :details     {:name             (:name segment)
                              :description      (:description segment)
                              :revision-message "deleted"
                              :database_id      (mt/id)
                              :table_id         (mt/id :checkins)}}
               (mt/latest-audit-log-entry "segment-delete" (:id segment))))))))

(deftest user-joined-event-test
  (testing :user-joined
    (is (= {:user-id (mt/user->id :rasta)}
           (events/publish-event! :event/user-joined {:user-id (mt/user->id :rasta)})))
    (is (= {:topic       :user-joined
            :user_id     (mt/user->id :rasta)
            :model       "User"
            :model_id    (mt/user->id :rasta)
            :details     {}}
           (mt/latest-audit-log-entry :user-joined (mt/user->id :rasta))))))

(deftest user-invited-event-test
  (testing :event/user-invited
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-temp [:model/User {:keys [id] :as new-user}]
        (let [details {:invitor {:first_name "Ngoc"
                                 :email      "ngoc@metabase.com"}}]
          (is (= {:object  new-user
                  :details details}
                 (events/publish-event! :event/user-invited {:object new-user
                                                             :details details})))
          (is (partial=
               {:model_id id
                :user_id  (mt/user->id :rasta)
                :details  (assoc (select-keys new-user [:first_name :last_name :email])
                                 :user_group_memberships [{:id 1}]
                                 :invitor (:invitor details))
                :topic    :user-invited
                :model    "User"}
               (mt/latest-audit-log-entry :user-invited id))))))))

(deftest user-update-event-test
  (testing :event/user-update
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-temp [:model/User user {:last_name "Charms"}]
        (t2/update! :model/User :id (:id user) {:last_name "Pigeon"})
        (is (partial=
             {:model_id (:id user)
              :user_id  (mt/user->id :rasta)
              :details  {:previous {:last_name "Charms"}
                         :new      {:last_name "Pigeon"}}
              :topic    :user-update
              :model    "User"}
             (mt/latest-audit-log-entry :user-update (:id user))))))))

(deftest password-reset-initiated-event-test
  (testing :event/password-reset-initiated
    (mt/with-current-user (mt/user->id :rasta)
      (let [user (assoc (mt/fetch-user :rasta) :token "hash")]
        (is (= {:object user}
               (events/publish-event! :event/password-reset-initiated {:object user})))
        (is (= {:model_id (mt/user->id :rasta)
                :user_id  (mt/user->id :rasta)
                :details  {:token "hash"}
                :topic    :password-reset-initiated
                :model    "User"}
               (mt/latest-audit-log-entry :password-reset-initiated (mt/user->id :rasta))))))))

(deftest password-reset-successful-event-test
  (testing :event/password-reset-successful
    (mt/with-current-user (mt/user->id :rasta)
      (let [user (assoc (mt/fetch-user :rasta) :token "hash")]
        (is (= {:object user}
               (events/publish-event! :event/password-reset-successful {:object user})))
        (is (= {:model_id (mt/user->id :rasta)
                :user_id  (mt/user->id :rasta)
                :details  {:token "hash"}
                :topic    :password-reset-successful
                :model    "User"}
               (mt/latest-audit-log-entry :password-reset-successful (mt/user->id :rasta))))))))

(deftest password-changed-event-test
  (testing :event/password-changed
    (mt/with-current-user (mt/user->id :crowberto)
      (let [user (mt/fetch-user :rasta)]
        (is (= {:object user :user-id (mt/user->id :crowberto)}
               (events/publish-event! :event/password-changed {:object user :user-id (mt/user->id :crowberto)})))
        (is (= {:model_id (mt/user->id :rasta)
                :user_id  (mt/user->id :crowberto)
                :details  {}
                :topic    :password-changed
                :model    "User"}
               (mt/latest-audit-log-entry :password-changed (mt/user->id :rasta))))))))

(deftest create-channel-event-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-temp [:model/Channel channel notification.tu/default-can-connect-channel]
      (testing :event/channel-create
        (is (= {:model_id (:id channel)
                :user_id  (mt/user->id :rasta)
                :details  {:id          (:id channel)
                           :name        "Test channel"
                           :description "Test channel description"
                           :type        notification.tu/test-channel-type
                           :active      true}
                :topic    :channel-create
                :model    "Channel"}
               (mt/latest-audit-log-entry :channel-create (:id channel)))))
      (testing :event/channel-update
        (t2/update! :model/Channel :id (:id channel) {:name "New Name"})
        (is (= {:model_id (:id channel)
                :user_id  (mt/user->id :rasta)
                :details  {:previous {:name "Test channel"}
                           :new      {:name "New Name"}}
                :topic    :channel-update
                :model    "Channel"}
               (mt/latest-audit-log-entry :channel-update (:id channel))))))))

(deftest transform-run-start-event-test
  (mt/when-ee-evailable
   (testing :event/transform-run-start
     (mt/with-current-user (mt/user->id :rasta)
       (mt/with-temp [:model/Transform transform {:name "Test Transform"}
                      :model/TransformRun transform-run {:transform_id (:id transform)
                                                         :status :started
                                                         :run_method :manual
                                                         :is_active true}]
         (is (= {:object transform-run}
                (events/publish-event! :event/transform-run-start {:object transform-run})))
         (is (= {:model_id (:id transform-run)
                 :user_id (mt/user->id :rasta)
                 :details {:transform_id (:id transform)
                           :status "started"
                           :run_method "manual"}
                 :topic :transform-run-start
                 :model "TransformRun"}
                (mt/latest-audit-log-entry :transform-run-start (:id transform-run)))))))))

(deftest document-events-test
  (mt/when-ee-evailable
   (mt/with-current-user (mt/user->id :rasta)
     (mt/with-temp [:model/Document document {:name "Test Document"
                                              :collection_id nil}]
       (testing :event/document-create
         (is (= {:model_id (:id document)
                 :user_id (mt/user->id :rasta)
                 :details {:name "Test Document"
                           :collection_id nil}
                 :topic :document-create
                 :model "Document"}
                (mt/latest-audit-log-entry :document-create (:id document)))))
       (testing :event/document-update
         (t2/update! :model/Document :id (:id document) {:name "Updated Document"})
         (is (= {:model_id (:id document)
                 :user_id (mt/user->id :rasta)
                 :details {:name "Updated Document"
                           :collection_id nil}
                 :topic :document-update
                 :model "Document"}
                (mt/latest-audit-log-entry :document-update (:id document)))))
       (testing :event/document-delete
         (t2/delete! :model/Document :id (:id document))
         (is (= {:model_id (:id document)
                 :user_id (mt/user->id :rasta)
                 :details {:name "Updated Document"
                           :collection_id nil}
                 :topic :document-delete
                 :model "Document"}
                (mt/latest-audit-log-entry :document-delete (:id document)))))))))

(deftest comment-events-test
  (mt/when-ee-evailable
   (mt/with-current-user (mt/user->id :rasta)
     (mt/with-temp [:model/Document {doc-id :id} {}
                    :model/Comment  comment      {:target_id doc-id
                                                  :content   {:type "doc", :content []}}]
       (testing :event/comment-create
         (is (= {:model_id (:id comment)
                 :user_id (mt/user->id :rasta)
                 :details {:target_id doc-id
                           :target_type "document"
                           :child_target_id nil
                           :parent_comment_id nil}
                 :topic :comment-create
                 :model "Comment"}
                (mt/latest-audit-log-entry :comment-create (:id comment)))))
       (testing :event/comment-update
         (t2/update! :model/Comment :id (:id comment) {:content {:type "doc", :content [{:type "paragraph"}]}})
         (is (=? {:model_id (:id comment)
                  :user_id (mt/user->id :rasta)
                  :details {}
                  :topic :comment-update
                  :model "Comment"}
                 (mt/latest-audit-log-entry :comment-update (:id comment)))))
       (testing :event/comment-delete
         (t2/delete! :model/Comment :id (:id comment))
         (is (= {:model_id (:id comment)
                 :user_id (mt/user->id :rasta)
                 :details {:target_type "document"
                           :target_id doc-id
                           :child_target_id nil
                           :parent_comment_id nil}
                 :topic :comment-delete
                 :model "Comment"}
                (mt/latest-audit-log-entry :comment-delete (:id comment)))))))))

(deftest transform-events-test
  (mt/when-ee-evailable
   (mt/with-current-user (mt/user->id :rasta)
     (mt/with-temp [:model/Transform transform {:name "Test Transform"
                                                :description "Test description"}]
       (testing :event/transform-create
         (is (partial=
              {:model_id (:id transform)
               :user_id (mt/user->id :rasta)
               :details {:name "Test Transform"
                         :description "Test description"}
               :topic :transform-create
               :model "Transform"}
              (mt/latest-audit-log-entry :transform-create (:id transform)))))
       (testing :event/transform-update
         (t2/update! :model/Transform :id (:id transform) {:name "Updated Transform"})
         (is (partial=
              {:model_id (:id transform)
               :user_id (mt/user->id :rasta)
               :details {:name "Updated Transform"}
               :topic :update-transform
               :model "Transform"}
              (mt/latest-audit-log-entry :update-transform (:id transform)))))
       (testing :event/transform-delete
         (t2/delete! :model/Transform :id (:id transform))
         (is (partial=
              {:model_id (:id transform)
               :user_id (mt/user->id :rasta)
               :details {:name "Updated Transform"
                         :description "Test description"}
               :topic :transform-delete
               :model "Transform"}
              (mt/latest-audit-log-entry :transform-delete (:id transform)))))))))

(deftest glossary-events-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-temp [:model/Glossary glossary {:term "Test Term" :definition "Definition"}]
      (testing :event/glossary-create
        (is (= {:model_id (:id glossary)
                :user_id (mt/user->id :rasta)
                :details {:term "Test Term"}
                :topic :glossary-create
                :model "Glossary"}
               (mt/latest-audit-log-entry :glossary-create (:id glossary)))))
      (testing :event/glossary-update
        (t2/update! :model/Glossary :id (:id glossary) {:term "Updated Term"})
        (is (= {:model_id (:id glossary)
                :user_id (mt/user->id :rasta)
                :details {:previous {:term "Test Term"}
                          :new {:term "Updated Term"}}
                :topic :glossary-update
                :model "Glossary"}
               (mt/latest-audit-log-entry :glossary-update (:id glossary)))))
      (testing :event/glossary-delete
        (t2/delete! :model/Glossary :id (:id glossary))
        (is (= {:model_id (:id glossary)
                :user_id (mt/user->id :rasta)
                :details {:term "Updated Term"}
                :topic :glossary-delete
                :model "Glossary"}
               (mt/latest-audit-log-entry :glossary-delete (:id glossary))))))))

(deftest ^:synchronized remote-sync-event-version-after-completion-test
  (testing "remote-sync audit log entries include version when event is published after task completion (#73329)"
    (mt/when-ee-evailable
     (mt/with-current-user (mt/user->id :rasta)
       (mt/with-temp [:model/RemoteSyncTask {task-id :id}
                      {:sync_task_type "import"
                       :version nil
                       :initiated_by (mt/user->id :rasta)
                       :started_at (t/offset-date-time 2025 9 30 14 0 0)
                       :ended_at (t/offset-date-time 2025 9 30 14 0 0)}]
         (testing "event published with re-fetched task after version is set"
           (t2/update! :model/RemoteSyncTask :id task-id {:version "abc123"})
           (let [completed-task (t2/select-one :model/RemoteSyncTask :id task-id)]
             (events/publish-event! :event/remote-sync-import
                                    {:object completed-task
                                     :details {:branch "main"}
                                     :user-id (mt/user->id :rasta)}))
           (is (= "abc123"
                  (:version (:details (mt/latest-audit-log-entry :remote-sync-import task-id))))
               "version should be the git hash from the completed task"))
         (testing "event published with original task (before version set) has nil version"
           (mt/with-temp [:model/RemoteSyncTask {task-id-2 :id :as task-2}
                          {:sync_task_type "import"
                           :version nil
                           :initiated_by (mt/user->id :rasta)
                           :started_at (t/offset-date-time 2025 9 30 14 0 0)
                           :ended_at (t/offset-date-time 2025 9 30 14 0 0)}]
             (events/publish-event! :event/remote-sync-import
                                    {:object task-2
                                     :details {:branch "main"}
                                     :user-id (mt/user->id :rasta)})
             (is (nil? (:version (:details (mt/latest-audit-log-entry :remote-sync-import task-id-2))))
                 "version is nil when event is published before task sets it"))))))))

(deftest remote-sync-events-test
  (mt/when-ee-evailable
   (mt/with-current-user (mt/user->id :rasta)
     (mt/with-temp [:model/RemoteSyncTask {task-id :id :as task}
                    {:sync_task_type "import"
                     :version "v1"
                     :initiated_by (mt/user->id :rasta)
                     :started_at (t/offset-date-time 2025 9 30 14 0 0)
                     :ended_at (t/offset-date-time 2025 9 30 14 0 0)}]
       (testing :event/remote-sync-import
         (is (= {:object task}
                (events/publish-event! :event/remote-sync-import {:object task})))
         (is (= {:model_id task-id
                 :user_id (mt/user->id :rasta)
                 :details {:sync_task_type "import"
                           :version "v1"}
                 :topic :remote-sync-import
                 :model "RemoteSyncTask"}
                (mt/latest-audit-log-entry :remote-sync-import task-id))))
       (testing :event/remote-sync-export
         (is (= {:object task}
                (events/publish-event! :event/remote-sync-export {:object task})))
         (is (= {:model_id task-id
                 :user_id (mt/user->id :rasta)
                 :details {:sync_task_type "import"
                           :version "v1"}
                 :topic :remote-sync-export
                 :model "RemoteSyncTask"}
                (mt/latest-audit-log-entry :remote-sync-export task-id))))
       (testing :event/remote-sync-settings-update
         (is (= {:object task}
                (events/publish-event! :event/remote-sync-settings-update {:object task})))
         (is (= {:model_id task-id
                 :user_id (mt/user->id :rasta)
                 :details {:sync_task_type "import"
                           :version "v1"}
                 :topic :remote-sync-settings-update
                 :model "RemoteSyncTask"}
                (mt/latest-audit-log-entry :remote-sync-settings-update task-id))))
       (testing :event/remote-sync-create-branch
         (is (= {:object task}
                (events/publish-event! :event/remote-sync-create-branch {:object task})))
         (is (= {:model_id task-id
                 :user_id (mt/user->id :rasta)
                 :details {:sync_task_type "import"
                           :version "v1"}
                 :topic :remote-sync-create-branch
                 :model "RemoteSyncTask"}
                (mt/latest-audit-log-entry :remote-sync-create-branch task-id))))
       (testing :event/remote-sync-stash
         (is (= {:object task}
                (events/publish-event! :event/remote-sync-stash {:object task})))
         (is (= {:model_id task-id
                 :user_id (mt/user->id :rasta)
                 :details {:sync_task_type "import"
                           :version "v1"}
                 :topic :remote-sync-stash
                 :model "RemoteSyncTask"}
                (mt/latest-audit-log-entry :remote-sync-stash task-id))))))))

(deftest action-v2-events-test
  (mt/when-ee-evailable
   (mt/with-current-user (mt/user->id :rasta)
     (testing :event/action-v2-execute
       (is (=
            {:details
             {:action "data-grid.row/create"
              :scope {:table_id 123}
              :input_count 1}}
            (events/publish-event! :event/action-v2-execute
                                   {:details
                                    {:action "data-grid.row/create"
                                     :scope {:table_id 123}
                                     :input_count 1}})))
       (is (= {:user_id (mt/user->id :rasta)
               :details {:action "data-grid.row/create"
                         :scope {:table_id 123}
                         :input_count 1}
               :topic :table-data-edit
               :model "Table"
               :model_id 123}
              (mt/latest-audit-log-entry :table-data-edit)))))))

(deftest batch-of-audited-writes-is-one-insert-test
  (testing "the audit rows of a batch of writes by a user are inserted by one statement, in the order of the writes"
    (mt/with-temp [:model/Card {a :id} {:name "A"}
                   :model/Card {b :id} {:name "B"}
                   :model/Card {c :id} {:name "C"}]
      (let [inserts (atom 0)
            before  (or (:id (t2/query-one {:select [[:%max.id :id]] :from [:audit_log]})) 0)]
        (mt/with-dynamic-fn-redefs [audit-app.db/insert-audit-logs! (let [f (mt/original-fn #'audit-app.db/insert-audit-logs!)]
                                                                      (fn [rows] (swap! inserts inc) (f rows)))]
          (mt/with-current-user (mt/user->id :rasta)
            (events/with-batched-events
              (t2/update! :model/Card :id b {:name "B2"})
              (t2/update! :model/Card :id c {:name "C2"})
              (t2/update! :model/Card :id a {:name "A2"}))))
        (is (= 1 @inserts))
        (is (= [["card-update" b] ["card-update" c] ["card-update" a]]
               (mapv (juxt :topic :model_id)
                     (t2/query {:select   [:topic :model_id]
                                :from     [:audit_log]
                                :where    [:and [:> :id before] [:in :model_id [a b c]] [:= :model "Card"]]
                                :order-by [[:id :asc]]}))))))))

(deftest user-activation-is-recorded-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (mt/with-current-user (mt/user->id :rasta)
      (t2/update! :model/User :id user-id {:is_active false})
      (is (= {:model_id user-id :user_id (mt/user->id :rasta) :details {} :topic :user-deactivated :model "User"}
             (mt/latest-audit-log-entry :user-deactivated user-id)))
      (t2/update! :model/User :id user-id {:is_active true})
      (is (= {:model_id user-id :user_id (mt/user->id :rasta) :details {} :topic :user-reactivated :model "User"}
             (mt/latest-audit-log-entry :user-reactivated user-id))))))

(deftest table-publication-is-recorded-test
  (mt/with-temp [:model/Table table {:name "My Cool Table"}]
    (mt/with-current-user (mt/user->id :rasta)
      (doseq [[published? topic] [[true :table-publish] [false :table-unpublish]]]
        (t2/update! :model/Table :id (:id table) {:is_published published?})
        (is (=? {:topic    topic
                 :user_id  (mt/user->id :rasta)
                 :model    "Table"
                 :model_id (:id table)
                 :details  {:name "My Cool Table", :id (:id table), :db_id (:db_id table)}}
                (mt/latest-audit-log-entry topic (:id table))))))))

(deftest public-links-are-recorded-test
  (mt/with-temp [:model/Card      {card-id :id}      {}
                 :model/Dashboard {dashboard-id :id} {}]
    (mt/with-current-user (mt/user->id :rasta)
      (doseq [[model id prefix] [[:model/Card card-id "card"] [:model/Dashboard dashboard-id "dashboard"]]]
        (t2/update! model :id id {:public_uuid (str (random-uuid)) :made_public_by_id (mt/user->id :rasta)})
        (is (some? (mt/latest-audit-log-entry (keyword (str prefix "-public-link-created")) id))
            "created")
        (t2/update! model :id id {:public_uuid nil :made_public_by_id nil})
        (is (some? (mt/latest-audit-log-entry (keyword (str prefix "-public-link-deleted")) id))
            "deleted")))))

(deftest database-router-events-test
  (mt/when-ee-evailable
   (mt/with-premium-features #{:audit-app :database-routing}
     (mt/with-temp [:model/Database {db-id :id} {:engine :h2 :details (:details (mt/db)) :name "Routed"}]
       (mt/with-current-user (mt/user->id :crowberto)
         (let [router-id (t2/insert-returning-pk! :model/DatabaseRouter {:database_id db-id :user_attribute "tenant"})]
           (testing "creating a router is recorded as an update of its database"
             (is (= {:model_id db-id
                     :user_id  (mt/user->id :crowberto)
                     :details  {:db_routing "enabled" :routing_attribute "tenant"}
                     :topic    :database-update
                     :model    "Database"}
                    (mt/latest-audit-log-entry :database-update db-id))))
           (testing "deleting a router is recorded as an update of its database"
             (t2/delete! :model/DatabaseRouter :id router-id)
             (is (= {:model_id db-id
                     :user_id  (mt/user->id :crowberto)
                     :details  {:db_routing "disabled"}
                     :topic    :database-update
                     :model    "Database"}
                    (mt/latest-audit-log-entry :database-update db-id))))))))))

(deftest group-membership-events-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Audited group"}
                   :model/User             {user-id :id}  {}]
      (let [membership-id (t2/insert-returning-pk! :model/PermissionsGroupMembership {:user_id user-id :group_id group-id})]
        (testing "creating a membership records its id"
          (is (partial= {:model "PermissionsGroupMembership"
                         :model_id membership-id
                         :user_id (mt/user->id :crowberto)
                         :details {:id membership-id :user_id user-id :group_id group-id}
                         :topic :group-membership-create}
                        (mt/latest-audit-log-entry :group-membership-create membership-id))))
        (testing "deleting a membership records its id"
          (t2/delete! :model/PermissionsGroupMembership :id membership-id)
          (is (partial= {:model "PermissionsGroupMembership"
                         :model_id membership-id
                         :user_id (mt/user->id :crowberto)
                         :details {:id membership-id :user_id user-id :group_id group-id}
                         :topic :group-membership-delete}
                        (mt/latest-audit-log-entry :group-membership-delete membership-id))))))))

(deftest bulk-group-membership-create-records-ids-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Audited group"}
                   :model/User             {user-1 :id}   {}
                   :model/User             {user-2 :id}   {}]
      (t2/insert! :model/PermissionsGroupMembership [{:user_id user-1 :group_id group-id}
                                                     {:user_id user-2 :group_id group-id}])
      (let [ids (t2/select-pks-set :model/PermissionsGroupMembership :group_id group-id)]
        (is (= 2 (count ids)))
        (is (= ids (into #{} (map :model_id)
                         (t2/select :model/AuditLog :topic "group-membership-create" :model_id [:in ids]))))))))

(defn- failure-call-count!
  "The number of app DB queries that publishing the `topic` event of `object` runs."
  [topic object]
  (t2/with-call-count [call-count]
    (events/publish-event! topic {:user-id (mt/user->id :rasta) :object object})
    (call-count)))

(deftest permission-failure-stores-small-details-test
  (mt/with-temp [:model/Collection collection {:name "Refused collection"}
                 :model/Dashboard  dashboard  {:name "Refused dashboard"}
                 :model/Pulse      pulse      {:name "Refused pulse"}
                 :model/Card      card      {:name "Refused card"}]
    (let [baseline (failure-call-count! :event/write-permission-failure collection)]
      (doseq [[model object topic] [["Dashboard" dashboard :write-permission-failure]
                                    ["User" (mt/fetch-user :lucky) :update-permission-failure]
                                    ["Pulse" pulse :write-permission-failure]]]
        (testing model
          (is (= baseline (failure-call-count! (keyword "event" (name topic)) object)))
          (is (= {} (:details (mt/latest-audit-log-entry topic (:id object)))))))
      (testing "a model that stored columns stores them"
        (events/publish-event! :event/write-permission-failure {:user-id (mt/user->id :rasta) :object card})
        (is (= {:name "Refused card" :description nil :database_id (mt/id) :table_id nil :model? false}
               (:details (mt/latest-audit-log-entry :write-permission-failure (:id card)))))))))

(deftest bookkeeping-updates-record-nothing-test
  (mt/with-temp [:model/User            {user-id :id}  {}
                 :model/Pulse           {pulse-id :id} {:name "Pulse"}
                 :model/PermissionsGroup {group-id :id} {}]
    (let [{key-id :id} (mt/user-http-request :crowberto :post 200 "api-key" {:group_id group-id :name "Bookkept key"})]
      (mt/with-current-user (mt/user->id :rasta)
        (let [before (or (:id (t2/query-one {:select [[:%max.id :id]] :from [:audit_log]})) 0)]
          (t2/update! :model/User :id user-id {:last_login (java.time.OffsetDateTime/now)})
          (t2/update! :model/Pulse :id pulse-id {:collection_position 1})
          (t2/update! :model/Card :id (t2/select-one-pk :model/Card) {:view_count 3})
          (t2/update! :model/ApiKey :id key-id {:last_used_at (java.time.OffsetDateTime/now)})
          (is (= [] (t2/select :model/AuditLog :id [:> before] :model [:in ["User" "Pulse" "Card" "ApiKey"]]))))))))
