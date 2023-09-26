(ns metabase.events.audit-log
  "This namespace is responsible for publishing events to the audit log. "
  (:require
   [metabase.api.common :as api]
   [metabase.events :as events]
   [metabase.models.activity :as activity :refer [Activity]]
   [metabase.models.audit-log :as audit-log]
   [metabase.models.recent-views :as recent-views]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive ::event :metabase/event)

(derive ::card-event ::event)
(derive :event/card-create ::card-event)
(derive :event/card-update ::card-event)
(derive :event/card-delete ::card-event)

(methodical/defmethod events/publish-event! ::card-event
  [topic object]
  (audit-log/record-event! topic object))

(derive ::card-read-event :metabase/event)
(derive :event/card-read ::card-read-event)

(methodical/defmethod events/publish-event! ::card-read-event
  [topic {id :id}]
  (audit-log/record-event! topic {} api/*current-user-id* :model/Card id))

(derive ::card-query-event ::event)
(derive :event/card-query ::card-query-event)

(methodical/defmethod events/publish-event! ::card-query-event
  [topic {:keys [card_id context] :as object}]
  (when-not (#{:collection :dashboard} context)
    ;; We don't want to count pinned card queries
    (recent-views/update-users-recent-views! api/*current-user-id* :model/Card card_id))
  (let [details (select-keys object [:cached :ignore_cache :context])]
    (audit-log/record-event! topic details api/*current-user-id* :model/Card card_id)))

(derive ::dashboard-event ::event)
(derive :event/dashboard-create ::dashboard-event)
(derive :event/dashboard-delete ::dashboard-event)

(methodical/defmethod events/publish-event! ::dashboard-event
  [topic object]
  (audit-log/record-event! topic object))

(derive ::dashboard-card-event ::event)
(derive :event/dashboard-add-cards ::dashboard-card-event)
(derive :event/dashboard-remove-cards ::dashboard-card-event)

(methodical/defmethod events/publish-event! ::dashboard-card-event
  [topic {:keys [dashcards id]}]
  ;; we expect that the object has just a dashboard :id at the top level
  ;; plus a `:dashcards` attribute which is a vector of the cards added/removed
  (let [details (-> (t2/select-one [:model/Dashboard :description :name] :id id)
                    (assoc :dashcards (for [{:keys [id card_id]} dashcards]
                                           (-> (t2/select-one [:model/Card :name :description], :id card_id)
                                               (assoc :id id)
                                               (assoc :card_id card_id)))))]
   (audit-log/record-event! topic details api/*current-user-id* :model/Dashboard id)))

(derive ::dashboard-read-event ::event)
(derive :event/dashboard-read ::dashboard-read-event)

(methodical/defmethod events/publish-event! ::dashboard-read-event
  [topic {id :id :as dashboard}]
  (recent-views/update-users-recent-views! api/*current-user-id* :model/Dashboard id)
  (audit-log/record-event! topic dashboard))

(derive ::table-read-event ::event)
(derive :event/table-read ::table-read-event)

(methodical/defmethod events/publish-event! ::table-read-event
  [topic {id :id :as table}]
  (recent-views/update-users-recent-views! api/*current-user-id* :model/Table id)
  (audit-log/record-event! topic table))

(derive ::metric-event ::event)
(derive :event/metric-create ::metric-event)
(derive :event/metric-update ::metric-event)
(derive :event/metric-delete ::metric-event)

(methodical/defmethod events/publish-event! ::metric-event
  [topic object]
  (audit-log/record-event! topic object))

(derive ::pulse-event ::event)
(derive :event/pulse-create ::pulse-event)
(derive :event/pulse-delete ::pulse-event)

(methodical/defmethod events/publish-event! ::pulse-event
  [topic {:keys [name id]}]
  (audit-log/record-event! topic {:name name} api/*current-user-id* :model/Pulse id))

(derive ::alert-event ::event)
(derive :event/alert-create ::alert-event)
(derive :event/alert-delete ::alert-event)

(methodical/defmethod events/publish-event! ::alert-event
  [topic {:keys [card] :as alert}]
  (let [card-name (:name card)]
    ;; Alerts are centered around a card/question. Users always interact with the alert via the question
    (audit-log/record-event! topic {:name card-name} api/*current-user-id* :mode/Card (:id alert))))

(derive ::segment-event ::event)
(derive :event/segment-create ::segment-event)
(derive :event/segment-update ::segment-event)
(derive :event/segment-delete ::segment-event)

(methodical/defmethod events/publish-event! ::segment-event
  [topic object]
  (audit-log/record-event! topic object))

(derive ::user-joined-event ::event)
(derive :event/user-joined ::user-joined-event)

(methodical/defmethod events/publish-event! ::user-joined-event
  [topic object]
  {:pre [(pos-int? (:user-id object))]}
  (let [user-id (:user-id object)]
   (audit-log/record-event! topic {} user-id :model/User user-id)))

(derive ::install-event ::event)
(derive :event/install ::install-event)

(methodical/defmethod events/publish-event! ::install-event
  [_topic _event]
  (when-not (t2/exists? Activity :topic "install")
    (t2/insert! Activity, :topic "install", :model "install")))
