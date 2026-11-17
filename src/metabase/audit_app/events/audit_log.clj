(ns metabase.audit-app.events.audit-log
  "This namespace is responsible for publishing events to the audit log. "
  (:require
   [medley.core :as m]
   [metabase.audit-app.db :as audit-app.db]
   [metabase.audit-app.models.audit-log :as audit-log]
   [metabase.events.core :as events]
   [metabase.util.events :as u.events]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(events/derive! ::event :metabase/event)

(defn- unchanged-details?
  "Whether the update `event` leaves what the audit log records of the object as it was."
  [stored-topic {:keys [object previous-object]}]
  (let [kw (keyword (name stored-topic))]
    (= (audit-log/model-details object kw) (audit-log/model-details previous-object kw))))

(defn- record-lifecycle!
  "Record the lifecycle `event` of a write by a user under `stored-topic`, with the changes of an update when
  `previous?`, and nothing for a write without a user or an update that changes nothing the log records."
  [stored-topic {:keys [user-id object previous-object context] :as event} previous?]
  (when (and user-id
             (not (and previous? object previous-object (unchanged-details? stored-topic event))))
    (audit-log/record-event! stored-topic
                             (cond-> {:object (or object previous-object) :user-id user-id}
                               (and previous? object previous-object) (assoc :previous-object previous-object)
                               (:revision-message context)             (assoc :details {:revision-message (:revision-message context)})
                               (:details context)                      (update :details merge (:details context))))))

(defn- noop-card-update?
  [event]
  (every? #{:updated_at :collection_position} (u.events/changed-keys event)))

(events/derive! ::card-event ::event)
(events/derive! :event/card-create ::card-event)
(events/derive! :event/card-update ::card-event)
(events/derive! :event/card-delete ::card-event)

(methodical/defmethod events/publish-event! ::card-event
  [topic event]
  (when-not (and (= :event/card-update topic) (noop-card-update? event))
    (record-lifecycle! topic event true)))

(events/derive! ::dashboard-event ::event)
(events/derive! :event/dashboard-create ::dashboard-event)
(events/derive! :event/dashboard-delete ::dashboard-event)

(methodical/defmethod events/publish-event! ::dashboard-event
  [topic event]
  (record-lifecycle! topic event false))

(defn- dashcards-owner
  "The `[dashboard-id operation]` of the DashboardCard `event` of an addition or a removal, nil for the others."
  [{:keys [model operation object previous-object]}]
  (when (and (= :model/DashboardCard model) (#{:create :delete} operation))
    [(:dashboard_id (or object previous-object)) operation]))

(defn- record-dashcards!
  "Record that the cards of `events`, the DashboardCards added to or removed from one Dashboard, were."
  [[dashboard-id operation] events all-events]
  (when-let [user-id (and (not (some #(and (= :model/Dashboard (:model %))
                                           (= :create (:operation %))
                                           (= dashboard-id (:id %)))
                                     all-events))
                          (some :user-id events))]
    (let [dashboard (audit-app.db/dashboard dashboard-id)
          dashcards (map #(or (:object %) (:previous-object %)) events)
          cards     (into {}
                          (map (juxt :id #(select-keys % [:name :description])))
                          (audit-app.db/cards (keep :card_id dashcards)))
          details   (-> (select-keys dashboard [:description :name :id])
                        (assoc :dashcards (for [{:keys [id card_id]} dashcards]
                                            (-> (cards card_id)
                                                (assoc :id id)
                                                (assoc :card_id card_id)))))]
      (audit-log/record-event! (if (= :create operation) :event/dashboard-add-cards :event/dashboard-remove-cards)
                               {:details  details
                                :user-id  user-id
                                :model    :model/Dashboard
                                :model-id dashboard-id}))))

(events/register-owned-consumer! ::dashcards dashcards-owner record-dashcards!)

(events/derive! ::publicize ::event)
(events/derive! ::publicize-card ::publicize)
(events/derive! ::publicize-dashboard ::publicize)
(events/derive! :event/card-public-link-created ::publicize-card)
(events/derive! :event/card-public-link-deleted ::publicize-card)
(events/derive! :event/dashboard-public-link-created ::publicize-dashboard)
(events/derive! :event/dashboard-public-link-deleted ::publicize-dashboard)

(methodical/defmethod events/publish-event! ::publicize
  [topic {:keys [user-id object-id] :as _event}]
  (audit-log/record-event! topic
                           {:user-id  user-id
                            :model    (if (events/isa? topic ::publicize-dashboard)
                                        :model/Dashboard
                                        :model/Card)
                            :model-id object-id}))

(events/derive! ::table-event ::event)
(events/derive! :event/table-manual-scan ::table-event)
(events/derive! :event/table-manual-sync ::table-event)
(events/derive! :event/table-publish ::table-event)
(events/derive! :event/table-unpublish ::table-event)

(methodical/defmethod events/publish-event! ::table-event
  [topic event]
  (audit-log/record-event! topic event))

(events/derive! ::pulse-event ::event)
(events/derive! :event/pulse-create ::pulse-event)
(events/derive! :event/pulse-delete ::pulse-event)
(events/derive! :event/subscription-unsubscribe ::pulse-event)
(events/derive! :event/subscription-unsubscribe-undo ::pulse-event)
(events/derive! :event/alert-unsubscribe ::pulse-event)
(events/derive! :event/subscription-create ::pulse-event)
(events/derive! :event/subscription-update ::pulse-event)
(events/derive! :event/subscription-send ::pulse-event)
(events/derive! :event/alert-send ::pulse-event)

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

(events/derive! ::alert-event ::event)
(events/derive! :event/alert-create ::alert-event)
(events/derive! :event/alert-delete ::alert-event)
(events/derive! :event/alert-update ::alert-event)

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

(events/derive! ::notification-event ::event)
(events/derive! :event/notification-create ::notification-event)
(events/derive! :event/notification-update ::notification-event)
(events/derive! :event/notification-unsubscribe ::notification-event)

(methodical/defmethod events/publish-event! ::notification-event
  [topic {:keys [object user-id] :as event}]
  (audit-log/record-event! topic
                           (merge
                            event
                            {:model    :model/Notification
                             :model-id (:id object)
                             :user-id  user-id})))

(events/derive! ::notification-handler-event ::event)
(events/derive! :event/notification-unsubscribe-ex ::notification-handler-event)
(events/derive! :event/notification-unsubscribe-undo-ex ::notification-handler-event)

(methodical/defmethod events/publish-event! ::notification-handler-event
  [topic {:keys [object user-id] :as event}]
  (audit-log/record-event! topic
                           (merge
                            event
                            {:model    :model/NotificationHandler
                             :model-id (:id object)
                             :user-id  user-id})))

(events/derive! ::segment-event ::event)
(events/derive! :event/segment-create ::segment-event)
(events/derive! :event/segment-update ::segment-event)
(events/derive! :event/segment-delete ::segment-event)

(methodical/defmethod events/publish-event! ::segment-event
  [topic event]
  (record-lifecycle! topic event false))

(events/derive! ::measure-event ::event)
(events/derive! :event/measure-create ::measure-event)
(events/derive! :event/measure-update ::measure-event)
(events/derive! :event/measure-delete ::measure-event)

(methodical/defmethod events/publish-event! ::measure-event
  [topic event]
  (record-lifecycle! topic event false))

(events/derive! ::user-event ::event)
(events/derive! :event/user-invited ::user-event)
(events/derive! :event/user-deactivated ::user-event)
(events/derive! :event/user-reactivated ::user-event)
(events/derive! :event/password-reset-initiated ::user-event)
(events/derive! :event/password-reset-successful ::user-event)
(events/derive! :event/password-changed ::user-event)
(events/derive! :event/mfa-verification-failed ::user-event)
(events/derive! :event/mfa-required-enrollment-failed ::user-event)
(events/derive! :event/mfa-enrolled ::user-event)
(events/derive! :event/mfa-disabled ::user-event)
(events/derive! :event/mcp-jwt-token-issued ::user-event)

(methodical/defmethod events/publish-event! ::user-event
  [topic event]
  (audit-log/record-event! topic event))

;; session events

(events/derive! ::session-event ::event)
(events/derive! :event/session-revoked ::session-event)
(events/derive! :event/sessions-revoked ::session-event)

(methodical/defmethod events/publish-event! ::session-event
  [topic event]
  (audit-log/record-event! topic event))

(events/derive! ::user-update-event ::event)
(events/derive! :event/user-update ::user-update-event)

(def ^:private audited-user-columns
  "The columns of a User whose update the audit log records."
  #{:first_name :last_name :email :sso_source :tenant_id})

(methodical/defmethod events/publish-event! ::user-update-event
  [topic event]
  (when (u.events/changed-any? event audited-user-columns)
    (record-lifecycle! topic event true)))

(events/derive! ::user-joined-event ::event)
(events/derive! :event/user-joined ::user-joined-event)

(methodical/defmethod events/publish-event! ::user-joined-event
  [topic {:keys [user-id]}]
  (audit-log/record-event! topic
                           {:user-id  user-id
                            :model    :model/User
                            :model-id user-id}))

(events/derive! ::install-event ::event)
(events/derive! :event/install ::install-event)

(methodical/defmethod events/publish-event! ::install-event
  [topic _event]
  (when-not (audit-app.db/audit-log-topic-exists? "install")
    (audit-log/record-event! topic {})))

(events/derive! ::database-event ::event)
(events/derive! :event/database-create ::database-event)
(events/derive! :event/database-delete ::database-event)
(events/derive! :event/database-create ::lifecycle-event)
(events/derive! :event/database-delete ::lifecycle-event)
(events/derive! :event/database-manual-sync ::database-event)
(events/derive! :event/database-manual-scan ::database-event)
(events/derive! :event/database-discard-field-values ::database-event)

(methodical/defmethod events/publish-event! ::database-event
  [topic event]
  (if (events/isa? topic ::lifecycle-event)
    (record-lifecycle! topic event false)
    (audit-log/record-event! topic event)))

(events/derive! ::database-update-event ::event)
(events/derive! :event/database-update ::database-update-event)

(methodical/defmethod events/publish-event! ::database-update-event
  [topic event]
  (if (:details event)
    (audit-log/record-event! topic event)
    (record-lifecycle! topic event true)))

(events/derive! ::permission-failure-event ::event)
(events/derive! :event/write-permission-failure ::permission-failure-event)
(events/derive! :event/update-permission-failure ::permission-failure-event)
(events/derive! :event/create-permission-failure ::permission-failure-event)

(methodical/defmethod events/publish-event! ::permission-failure-event
  [topic event]
  (audit-log/record-event! topic event))

(events/derive! ::settings-changed-event ::event)
(events/derive! :event/setting-update ::settings-changed-event)

(methodical/defmethod events/publish-event! ::settings-changed-event
  [topic event]
  (audit-log/record-event! topic event))

(events/derive! ::api-key-event ::event)
(events/derive! :event/api-key-create ::api-key-event)
(events/derive! :event/api-key-update ::api-key-event)
(events/derive! :event/api-key-regenerate ::api-key-event)
(events/derive! :event/api-key-delete ::api-key-event)

(defn- hydrate-api-key
  [api-key]
  (some-> api-key (t2/hydrate :user :group :updated_by)))

(defn- api-key-event-with-groups
  "The lifecycle `event` of an ApiKey with the Permissions Group each side had, the previous one as the writer saw it
  before the write, since the write moves the key's User out of it."
  [{:keys [context] :as event}]
  (let [previous-group (get-in context [:details :previous-group])]
    (cond-> (-> event
                (update :context dissoc :details)
                (m/update-existing :object hydrate-api-key)
                (m/update-existing :previous-object hydrate-api-key))
      (and previous-group (:previous-object event)) (assoc-in [:previous-object :group] previous-group))))

(methodical/defmethod events/publish-event! ::api-key-event
  [topic event]
  (let [event (api-key-event-with-groups event)]
    (record-lifecycle! (if (and (= :event/api-key-update topic) (u.events/changed? event :key_prefix))
                         :event/api-key-regenerate
                         topic)
                       event
                       true)))

(events/derive! ::upload-event ::event)
(events/derive! :event/upload-create ::upload-event)
(events/derive! :event/upload-append ::upload-event)
(events/derive! :event/upload-replace ::upload-event)

(methodical/defmethod events/publish-event! ::upload-event
  [topic event]
  (audit-log/record-event! topic event))

(events/derive! ::cache-config-changed-event ::event)
(events/derive! :event/cache-config-create ::cache-config-changed-event)
(events/derive! :event/cache-config-update ::cache-config-changed-event)
(events/derive! :event/cache-config-delete ::cache-config-changed-event)

(methodical/defmethod events/publish-event! ::cache-config-changed-event
  [_topic event]
  (record-lifecycle! :event/cache-config-update event false))

(events/derive! ::channel-event ::event)
(events/derive! :event/channel-create ::channel-event)
(events/derive! :event/channel-update ::channel-event)

(methodical/defmethod events/publish-event! ::channel-event
  [topic event]
  (record-lifecycle! topic event true))

(events/derive! ::permissions-group-event ::event)
(events/derive! :event/group-create ::permissions-group-event)
(events/derive! :event/group-update ::permissions-group-event)
(events/derive! :event/group-delete ::permissions-group-event)

(methodical/defmethod events/publish-event! ::permissions-group-event
  [topic event]
  (record-lifecycle! topic event true))

(events/derive! ::permissions-group-membership-event ::event)
(events/derive! :event/group-membership-create ::permissions-group-membership-event)
(events/derive! :event/group-membership-delete ::permissions-group-membership-event)

(methodical/defmethod events/publish-event! ::permissions-group-membership-event
  [topic event]
  (record-lifecycle! topic (cond-> event
                             (= :event/group-membership-create topic) (update :object dissoc :id))
                     false))

(events/derive! ::cloud-add-on-event ::event)
(events/derive! :event/cloud-add-on-purchase ::cloud-add-on-event)

(methodical/defmethod events/publish-event! ::cloud-add-on-event
  [topic event]
  (audit-log/record-event! topic event))

(events/derive! ::document-event ::event)
(events/derive! :event/document-create ::document-event)
(events/derive! :event/document-update ::document-event)
(events/derive! :event/document-delete ::document-event)

(methodical/defmethod events/publish-event! ::document-event
  [topic {:keys [object] :as event}]
  (record-lifecycle! (if (and (= :event/document-update topic) (true? (:archived object)) (u.events/changed? event :archived))
                       :event/document-delete
                       topic)
                     event
                     false))

(events/derive! ::comment-event ::event)
(events/derive! :event/comment-create ::comment-event)
(events/derive! :event/comment-update ::comment-event)
(events/derive! :event/comment-delete ::comment-event)

(methodical/defmethod events/publish-event! ::comment-event
  [topic event]
  (record-lifecycle! (if (and (= :event/comment-update topic) (u.events/changed? event :deleted_at))
                       :event/comment-delete
                       topic)
                     event
                     false))

(events/derive! ::transform-event ::event)
(events/derive! ::lifecycle-event ::event)
(events/derive! :event/transform-create ::lifecycle-event)
(events/derive! :event/transform-delete ::lifecycle-event)
(events/derive! :event/transform-update ::lifecycle-event)
(events/derive! :event/transform-test-create ::lifecycle-event)
(events/derive! :event/transform-test-update ::lifecycle-event)
(events/derive! :event/transform-test-delete ::lifecycle-event)
(events/derive! :event/card-test-create ::lifecycle-event)
(events/derive! :event/card-test-update ::lifecycle-event)
(events/derive! :event/card-test-delete ::lifecycle-event)
(events/derive! :event/transform-create ::transform-event)
(events/derive! :event/update-transform ::transform-event)
(events/derive! :event/transform-update ::transform-event)
(events/derive! :event/transform-delete ::transform-event)
(events/derive! :event/transform-run-start ::transform-event)
(events/derive! :event/transform-run-canceled ::transform-event)
(events/derive! :event/transform-run-timeout ::transform-event)
(events/derive! :event/transform-test-create ::transform-event)
(events/derive! :event/transform-test-update ::transform-event)
(events/derive! :event/transform-test-delete ::transform-event)
(events/derive! :event/transform-test-run-start ::transform-event)
(events/derive! :event/transform-test-run-timeout ::transform-event)
(events/derive! :event/transform-inspect-discover ::transform-event)
(events/derive! :event/transform-inspect-lens ::transform-event)

(def ^:private lifecycle-stored-topics
  "The stored topic of the lifecycle topics whose audit log name is another."
  {:event/transform-update :event/update-transform})

(def ^:private creator-recorded-topics
  "The creation topics of the saved tests, recorded as their creator when a user writes them."
  #{:event/transform-test-create :event/card-test-create})

(defn- record-saved-test-lifecycle!
  [topic {:keys [object user-id] :as event}]
  (record-lifecycle! topic
                     (cond-> event
                       (and user-id (creator-recorded-topics topic) (:creator_id object))
                       (assoc :user-id (:creator_id object)))
                     false))

(methodical/defmethod events/publish-event! ::transform-event
  [topic event]
  (if (events/isa? topic ::lifecycle-event)
    (if (re-find #"test" (name topic))
      (record-saved-test-lifecycle! topic event)
      (record-lifecycle! (get lifecycle-stored-topics topic topic) event false))
    (audit-log/record-event! topic event)))

(events/derive! ::card-test-event ::event)
(events/derive! :event/card-test-create ::card-test-event)
(events/derive! :event/card-test-update ::card-test-event)
(events/derive! :event/card-test-delete ::card-test-event)
(events/derive! :event/card-test-run-start ::card-test-event)
(events/derive! :event/card-test-run-timeout ::card-test-event)

(methodical/defmethod events/publish-event! ::card-test-event
  [topic event]
  (if (events/isa? topic ::lifecycle-event)
    (record-saved-test-lifecycle! topic event)
    (audit-log/record-event! topic event)))

(events/derive! ::glossary-event ::event)
(events/derive! :event/glossary-create ::glossary-event)
(events/derive! :event/glossary-update ::glossary-event)
(events/derive! :event/glossary-delete ::glossary-event)

(methodical/defmethod events/publish-event! ::glossary-event
  [topic event]
  (record-lifecycle! topic event true))

(events/derive! ::custom-viz-plugin-event ::event)
(events/derive! :event/custom-viz-plugin-create ::custom-viz-plugin-event)
(events/derive! :event/custom-viz-plugin-update ::custom-viz-plugin-event)
(events/derive! :event/custom-viz-plugin-delete ::custom-viz-plugin-event)

(methodical/defmethod events/publish-event! ::custom-viz-plugin-event
  [topic event]
  (record-lifecycle! topic event true))

(events/derive! ::remote-sync-event ::event)
(events/derive! :event/remote-sync-import ::remote-sync-event)
(events/derive! :event/remote-sync-export ::remote-sync-event)
(events/derive! :event/remote-sync-settings-update ::remote-sync-event)
(events/derive! :event/remote-sync-create-branch ::remote-sync-event)
(events/derive! :event/remote-sync-stash ::remote-sync-event)

(methodical/defmethod events/publish-event! ::remote-sync-event
  [topic event]
  (audit-log/record-event! topic event))

(events/derive! ::action-v2-event ::event)
(events/derive! :event/action-v2-execute ::action-v2-event)
(events/derive! :event/table-data-edit :event/action-v2-execute)

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

(events/derive! ::tenant-event ::event)
(events/derive! :event/tenant-create ::tenant-event)
(events/derive! :event/tenant-update ::tenant-event)

(methodical/defmethod events/publish-event! ::tenant-event
  [topic event]
  (record-lifecycle! topic event true))

(events/derive! ::security-advisory-event ::event)
(events/derive! :event/security-advisory-acknowledge ::security-advisory-event)
(events/derive! :event/security-advisory-match ::security-advisory-event)

(methodical/defmethod events/publish-event! ::security-advisory-event
  [topic event]
  (audit-log/record-event! topic event))

(defn- column-change
  "The `[topic params]` that the lifecycle `event` of a write records for a column it changes, or nil."
  [{:keys [model object previous-object user-id] :as event}]
  (let [row (or object previous-object)]
    (case model
      :model/Card
      (when (u.events/changed? event :public_uuid)
        [(if (some? (:public_uuid object)) :event/card-public-link-created :event/card-public-link-deleted)
         {:user-id user-id :model model :model-id (:id row)}])

      :model/Dashboard
      (when (u.events/changed? event :public_uuid)
        [(if (some? (:public_uuid object)) :event/dashboard-public-link-created :event/dashboard-public-link-deleted)
         {:user-id user-id :model model :model-id (:id row)}])

      :model/User
      (when (and previous-object (u.events/changed? event :is_active))
        [(if (:is_active object) :event/user-reactivated :event/user-deactivated)
         {:user-id user-id :object object}])

      :model/Table
      (when (u.events/changed? event :is_published)
        (cond
          (true? (:is_published object)) [:event/table-publish {:user-id user-id :object object}]
          previous-object                [:event/table-unpublish {:user-id user-id :object object}]))
      nil)))

(defn- record-column-changes!
  [_owner events _all-events]
  (doseq [event events
          :when (:user-id event)
          :let  [[topic params] (column-change event)]
          :when topic]
    (audit-log/record-event! topic params)))

(events/register-owned-consumer! ::column-changes
                                 (fn [{:keys [model operation]}]
                                   (when (and (#{:create :update} operation)
                                              (#{:model/Card :model/Dashboard :model/User :model/Table} model))
                                     ::column-changes))
                                 record-column-changes!)

(events/derive! ::database-router-event ::event)
(events/derive! :event/database-router-create ::database-router-event)
(events/derive! :event/database-router-update ::database-router-event)
(events/derive! :event/database-router-delete ::database-router-event)

(methodical/defmethod events/publish-event! ::database-router-event
  [topic {:keys [object previous-object user-id]}]
  (when user-id
    (let [router   (or object previous-object)
          database (audit-app.db/database (:database_id router))]
      (audit-log/record-event! :event/database-update
                               {:object          database
                                :previous-object database
                                :user-id         user-id
                                :details         (if (= :event/database-router-delete topic)
                                                   {:db_routing :disabled}
                                                   {:db_routing        :enabled
                                                    :routing_attribute (:user_attribute router)})}))))
