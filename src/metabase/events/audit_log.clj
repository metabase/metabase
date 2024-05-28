(ns metabase.events.audit-log
  "This namespace is responsible for publishing events to the audit log. "
  (:require
   [metabase.events :as events]
   [metabase.models.audit-log :as audit-log]
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


(derive ::table-event ::event)
(derive :event/table-manual-scan ::table-event)

(methodical/defmethod events/publish-event! ::table-event
  [topic event]
  (audit-log/record-event! topic event))

(derive ::metric-event ::event)
(derive :event/metric-create ::metric-event)
(derive :event/metric-update ::metric-event)
(derive :event/metric-delete ::metric-event)

(methodical/defmethod events/publish-event! ::metric-event
  [topic {:keys [object user-id revision-message] :as _event}]
  (audit-log/record-event! topic {:object  object
                                  :user-id user-id
                                  :details (when revision-message {:revision-message revision-message})}))

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

(derive ::segment-event ::event)
(derive :event/segment-create ::segment-event)
(derive :event/segment-update ::segment-event)
(derive :event/segment-delete ::segment-event)

(methodical/defmethod events/publish-event! ::segment-event
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

(methodical/defmethod events/publish-event! ::upload-event
  [topic event]
  (audit-log/record-event! topic event))

(derive ::cache-config-changed-event ::event)
(derive :event/cache-config-update ::cache-config-changed-event)

(methodical/defmethod events/publish-event! ::cache-config-changed-event
  [topic event]
  (audit-log/record-event! topic event))
