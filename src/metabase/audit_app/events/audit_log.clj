(ns metabase.audit-app.events.audit-log
  "This namespace is responsible for publishing events to the audit log. "
  (:require
   [metabase.audit-app.models.audit-log :as audit-log]
   [metabase.events.core :as events]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive ::event :metabase/event)

(derive ::card-event ::event)
(derive :event/card-create ::card-event)
(derive :event/card-update ::card-event)
(derive :event/card-delete ::card-event)

(methodical/defmethod events/publish-event! ::card-event
  [topic event]
  (audit-log/record-event! topic event))

(derive ::dashboard-event ::event)
(derive :event/dashboard-create ::dashboard-event)
(derive :event/dashboard-delete ::dashboard-event)

(methodical/defmethod events/publish-event! ::dashboard-event
  [topic event]
  (audit-log/record-event! topic event))

(derive ::dashboard-card-event ::event)
(derive :event/dashboard-add-cards ::dashboard-card-event)
(derive :event/dashboard-remove-cards ::dashboard-card-event)

(methodical/defmethod events/publish-event! ::dashboard-card-event
  [topic {:keys [object dashcards user-id] :as _event}]
  ;; we expect that the object has just a dashboard :id at the top level
  ;; plus a `:dashcards` attribute which is a vector of the cards added/removed
  (let [cards   (when (seq dashcards)
                  (t2/select-fn->fn :id #(select-keys % [:name :description])
                                    :model/Card
                                    :id [:in (map :card_id dashcards)]))
        details (-> (select-keys object [:description :name :id])
                    (assoc :dashcards (for [{:keys [id card_id]} dashcards]
                                        (-> (cards card_id)
                                            (assoc :id id)
                                            (assoc :card_id card_id)))))]
    (audit-log/record-event! topic
                             {:details  details
                              :user-id  user-id
                              :model    :model/Dashboard
                              :model-id (u/id object)})))

(derive ::publicize ::event)
(derive ::publicize-card ::publicize)
(derive ::publicize-dashboard ::publicize)
(derive :event/card-public-link-created ::publicize-card)
(derive :event/card-public-link-deleted ::publicize-card)
(derive :event/dashboard-public-link-created ::publicize-dashboard)
(derive :event/dashboard-public-link-deleted ::publicize-dashboard)

(methodical/defmethod events/publish-event! ::publicize
  [topic {:keys [user-id object-id] :as _event}]
  (audit-log/record-event! topic
                           {:user-id  user-id
                            :model    (if (isa? topic ::publicize-dashboard)
                                        :model/Dashboard
                                        :model/Card)
                            :model-id object-id}))

(derive ::table-event ::event)
(derive :event/table-manual-scan ::table-event)
(derive :event/table-manual-sync ::table-event)
(derive :event/table-publish ::table-event)
(derive :event/table-unpublish ::table-event)

(methodical/defmethod events/publish-event! ::table-event
  [topic event]
  (audit-log/record-event! topic event))

(derive ::pulse-event ::event)
(derive :event/pulse-create ::pulse-event)
(derive :event/pulse-delete ::pulse-event)
(derive :event/subscription-unsubscribe ::pulse-event)
(derive :event/subscription-unsubscribe-undo ::pulse-event)
(derive :event/alert-unsubscribe ::pulse-event)
(derive :event/subscription-create ::pulse-event)
(derive :event/subscription-update ::pulse-event)
(derive :event/subscription-send ::pulse-event)
(derive :event/alert-send ::pulse-event)

(defn- create-details-map [pulse name is-alert parent]
  (let [channels  (:channels pulse)
        parent-id (if is-alert :card_id :dashboard_id)]
    {:archived   (:archived pulse)
     :name       name
     parent-id   parent
     :parameters (:parameters pulse)
     :channel    (map :channel_type channels)
     :schedule   (map :schedule_type channels)
     :recipients (map :recipients channels)}))

(methodical/defmethod events/publish-event! ::pulse-event
  [topic {:keys [id object user-id] :as _event}]
  ;; Check if object contains the keys that we want populated, if not then may be a unsubscribe/send event
  (let [details-map (if (some? (:id object))
                      (create-details-map object (:name object) false (:dashboard_id object))
                      object)
        model-id    (or id (:id object))]
    (audit-log/record-event! topic
                             {:details  details-map
                              :user-id  user-id
                              :model    :model/Pulse
                              :model-id model-id})))

(derive ::alert-event ::event)
(derive :event/alert-create ::alert-event)
(derive :event/alert-delete ::alert-event)
(derive :event/alert-update ::alert-event)

(methodical/defmethod events/publish-event! ::alert-event
  [topic {:keys [object user-id] :as _event}]
  (let [card      (:card object)
        card-name (:name card)]
    ;; Alerts are centered around a card/question. Users always interact with the alert via the question
    (audit-log/record-event! topic
                             {:details  (create-details-map object card-name true (:id card))
                              :user-id  user-id
                              :model    :model/Card
                              :model-id (:id object)})))

(derive ::notification-event ::event)
(derive :event/notification-create ::notification-event)
(derive :event/notification-update ::notification-event)
(derive :event/notification-unsubscribe ::notification-event)

(methodical/defmethod events/publish-event! ::notification-event
  [topic {:keys [object user-id] :as event}]
  (audit-log/record-event! topic
                           (merge
                            event
                            {:model    :model/Notification
                             :model-id (:id object)
                             :user-id  user-id})))

(derive ::notification-handler-event ::event)
(derive :event/notification-unsubscribe-ex ::notification-handler-event)
(derive :event/notification-unsubscribe-undo-ex ::notification-handler-event)

(methodical/defmethod events/publish-event! ::notification-handler-event
  [topic {:keys [object user-id] :as event}]
  (audit-log/record-event! topic
                           (merge
                            event
                            {:model    :model/NotificationHandler
                             :model-id (:id object)
                             :user-id  user-id})))

(derive ::segment-event ::event)
(derive :event/segment-create ::segment-event)
(derive :event/segment-update ::segment-event)
(derive :event/segment-delete ::segment-event)

(methodical/defmethod events/publish-event! ::segment-event
  [topic {:keys [object user-id revision-message] :as _event}]
  (audit-log/record-event! topic {:object  object
                                  :user-id user-id
                                  :details (when revision-message {:revision-message revision-message})}))

(derive ::measure-event ::event)
(derive :event/measure-create ::measure-event)
(derive :event/measure-update ::measure-event)
(derive :event/measure-delete ::measure-event)

(methodical/defmethod events/publish-event! ::measure-event
  [topic {:keys [object user-id revision-message] :as _event}]
  (audit-log/record-event! topic {:object  object
                                  :user-id user-id
                                  :details (when revision-message {:revision-message revision-message})}))

(derive ::user-event ::event)
(derive :event/user-invited ::user-event)
(derive :event/user-deactivated ::user-event)
(derive :event/user-reactivated ::user-event)
(derive :event/password-reset-initiated ::user-event)
(derive :event/password-reset-successful ::user-event)

(methodical/defmethod events/publish-event! ::user-event
  [topic event]
  (audit-log/record-event! topic event))

(derive ::user-update-event ::event)
(derive :event/user-update ::user-update-event)

(methodical/defmethod events/publish-event! ::user-update-event
  [topic event]
  (audit-log/record-event! topic event))

(derive ::user-joined-event ::event)
(derive :event/user-joined ::user-joined-event)

(methodical/defmethod events/publish-event! ::user-joined-event
  [topic {:keys [user-id]}]
  (audit-log/record-event! topic
                           {:user-id  user-id
                            :model    :model/User
                            :model-id user-id}))

(derive ::install-event ::event)
(derive :event/install ::install-event)

(methodical/defmethod events/publish-event! ::install-event
  [topic _event]
  (when-not (t2/exists? :model/AuditLog :topic "install")
    (audit-log/record-event! topic {})))

(derive ::database-event ::event)
(derive :event/database-create ::database-event)
(derive :event/database-delete ::database-event)
(derive :event/database-manual-sync ::database-event)
(derive :event/database-manual-scan ::database-event)
(derive :event/database-discard-field-values ::database-event)

(methodical/defmethod events/publish-event! ::database-event
  [topic event]
  (audit-log/record-event! topic event))

(derive ::database-update-event ::event)
(derive :event/database-update ::database-update-event)

(methodical/defmethod events/publish-event! ::database-update-event
  [topic event]
  (audit-log/record-event! topic event))

(derive ::permission-failure-event ::event)
(derive :event/write-permission-failure ::permission-failure-event)
(derive :event/update-permission-failure ::permission-failure-event)
(derive :event/create-permission-failure ::permission-failure-event)

(methodical/defmethod events/publish-event! ::permission-failure-event
  [topic event]
  (audit-log/record-event! topic event))

(derive ::settings-changed-event ::event)
(derive :event/setting-update ::settings-changed-event)

(methodical/defmethod events/publish-event! ::settings-changed-event
  [topic event]
  (audit-log/record-event! topic event))

(derive ::api-key-event ::event)
(derive :event/api-key-create ::api-key-event)
(derive :event/api-key-update ::api-key-event)
(derive :event/api-key-regenerate ::api-key-event)
(derive :event/api-key-delete ::api-key-event)

(methodical/defmethod events/publish-event! ::api-key-event
  [topic event]
  (audit-log/record-event! topic event))

(derive ::upload-event ::event)
(derive :event/upload-create ::upload-event)
(derive :event/upload-append ::upload-event)
(derive :event/upload-replace ::upload-event)

(methodical/defmethod events/publish-event! ::upload-event
  [topic event]
  (audit-log/record-event! topic event))

(derive ::cache-config-changed-event ::event)
(derive :event/cache-config-update ::cache-config-changed-event)

(methodical/defmethod events/publish-event! ::cache-config-changed-event
  [topic event]
  (audit-log/record-event! topic event))

(derive ::channel-event ::event)
(derive :event/channel-create ::channel-event)
(derive :event/channel-update ::channel-event)

(methodical/defmethod events/publish-event! ::channel-event
  [topic event]
  (audit-log/record-event! topic event))

(derive ::permissions-group-event ::event)
(derive :event/group-create ::permissions-group-event)
(derive :event/group-update ::permissions-group-event)
(derive :event/group-delete ::permissions-group-event)

(methodical/defmethod events/publish-event! ::permissions-group-event
  [topic event]
  (audit-log/record-event! topic event))

(derive ::permissions-group-membership-event ::event)
(derive :event/group-membership-create ::permissions-group-membership-event)
(derive :event/group-membership-update ::permissions-group-membership-event)
(derive :event/group-membership-delete ::permissions-group-membership-event)

(methodical/defmethod events/publish-event! ::permissions-group-membership-event
  [topic event]
  (audit-log/record-event! topic event))

(derive ::cloud-add-on-event ::event)
(derive :event/cloud-add-on-purchase ::cloud-add-on-event)

(methodical/defmethod events/publish-event! ::cloud-add-on-event
  [topic event]
  (audit-log/record-event! topic event))

(derive ::document-event ::event)
(derive :event/document-create ::document-event)
(derive :event/document-update ::document-event)
(derive :event/document-delete ::document-event)

(methodical/defmethod events/publish-event! ::document-event
  [topic event]
  (audit-log/record-event! topic event))

(derive ::comment-event ::event)
(derive :event/comment-create ::comment-event)
(derive :event/comment-update ::comment-event)
(derive :event/comment-delete ::comment-event)

(methodical/defmethod events/publish-event! ::comment-event
  [topic event]
  (audit-log/record-event! topic event))

(derive ::transform-event ::event)
(derive :event/transform-create ::transform-event)
(derive :event/update-transform ::transform-event)
(derive :event/transform-delete ::transform-event)
(derive :event/transform-run-start ::transform-event)

(methodical/defmethod events/publish-event! ::transform-event
  [topic event]
  (audit-log/record-event! topic event))

(derive ::glossary-event ::event)
(derive :event/glossary-create ::glossary-event)
(derive :event/glossary-update ::glossary-event)
(derive :event/glossary-delete ::glossary-event)

(methodical/defmethod events/publish-event! ::glossary-event
  [topic event]
  (audit-log/record-event! topic event))

(derive ::remote-sync-event ::event)
(derive :event/remote-sync-import ::remote-sync-event)
(derive :event/remote-sync-export ::remote-sync-event)
(derive :event/remote-sync-settings-update ::remote-sync-event)
(derive :event/remote-sync-create-branch ::remote-sync-event)
(derive :event/remote-sync-stash ::remote-sync-event)

(methodical/defmethod events/publish-event! ::remote-sync-event
  [topic event]
  (audit-log/record-event! topic event))

(derive ::action-v2-event ::event)
(derive :event/action-v2-execute ::action-v2-event)
(derive :event/table-data-edit :event/action-v2-execute)

(methodical/defmethod events/publish-event! ::action-v2-event
  [topic event]
  (let [table-data-edit-events #{:data-grid.row/create :data-grid.row/update :data-grid.row/delete :data-editing/undo :data-editing/redo}]
    (if-let [table-id
             (and (contains? table-data-edit-events
                             (when-let [event (get-in event [:details :action])]
                               (when (or (string? event) (keyword? event))
                                 (keyword event))))
                  (get-in event [:details :scope :table_id]))]
      (audit-log/record-event! :event/table-data-edit (merge event {:model :model/Table :model-id table-id}))
      (audit-log/record-event! topic event))))

(derive ::tenant-event ::event)
(derive :event/tenant-create ::tenant-event)
(derive :event/tenant-update ::tenant-event)

(methodical/defmethod events/publish-event! ::tenant-event
  [topic event]
  (audit-log/record-event! topic event))
