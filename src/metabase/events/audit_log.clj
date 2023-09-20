(ns metabase.events.audit-log
  (:require
   [metabase.events :as events]
   [metabase.models.activity :as activity]
   [metabase.models.audit-log :as audit-log]
   [metabase.models.table :as table]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive ::event :metabase/event)

(derive ::card-event ::event)
(derive :event/card-create ::card-event)
(derive :event/card-update ::card-event)
(derive :event/card-delete ::card-event)

(methodical/defmethod events/publish-event! ::card-event
  [topic {card :object :as _event}]
  (audit-log/record-event! topic card))

(derive ::dashboard-event ::event)
(derive :event/dashboard-create ::dashboard-event)
(derive :event/dashboard-delete ::dashboard-event)

(methodical/defmethod events/publish-event! ::dashboard-event
  [topic {dashboard :object :as _event}]
  (audit-log/record-event! topic dashboard))

(derive ::dashboard-card-event ::event)
(derive :event/dashboard-add-cards ::dashboard-card-event)
(derive :event/dashboard-remove-cards ::dashboard-card-event)

;; TODO (crumb)
(methodical/defmethod events/publish-event! ::dashboard-card-event
  [topic {:keys [dashcards id]}]
  ;; we expect that the object has just a dashboard :id at the top level
  ;; plus a `:dashcards` attribute which is a vector of the cards added/removed
  (let [details (-> (t2/select-one [:model/Dashboard :description :name] :id id)
                    (assoc :dashcards (for [{:keys [id card_id]} dashcards]
                                           (-> (t2/select-one [:model/Card :name :description], :id card_id)
                                               (assoc :id id)
                                               (assoc :card_id card_id)))))]
   (audit-log/record-event! topic details :model/Dashboard id)))

(derive ::metric-event ::event)
(derive :event/metric-create ::metric-event)
(derive :event/metric-update ::metric-event)
(derive :event/metric-delete ::metric-event)

(methodical/defmethod events/publish-event! ::metric-event
  [topic {:keys [user-id] metric :object :as event}]
  (let [table-id    (:table_id metric)
        database-id (table/table-id->database-id table-id)]
    (activity/record-activity!
     {:topic       topic
      :user-id     user-id
      :model       "metric"
      :model-id    (:id metric)
      :object      metric
      :details     (assoc (select-keys metric [:name :description])
                          :revision_message  (:revision-message event))
      :database-id database-id
      :table-id    table-id})))

(derive ::pulse-event ::event)
(derive :event/pulse-create ::pulse-event)

(methodical/defmethod events/publish-event! ::pulse-event
  [topic {:keys [user-id] pulse :object :as _event}]
  (activity/record-activity!
   {:topic    topic
    :model    "pulse"
    :model-id (:id pulse)
    :user-id  user-id
    :object   pulse
    :details  (select-keys pulse [:name])}))

(derive ::alert-event ::event)
(derive :event/alert-create ::alert-event)

(methodical/defmethod events/publish-event! ::alert-event
  [topic {:keys [user-id] alert :object :as _event}]
  (let [{:keys [card]} alert]
    (activity/record-activity!
     ;; Alerts are centered around a card/question. Users always interact with the alert via the question
     {:topic      topic
      :user-id    user-id
      :model      "alert"
      :model-id   (:id card)
      :object     alert
      :details    (select-keys card [:name])})))

(derive ::segment-event ::event)
(derive :event/segment-create ::segment-event)
(derive :event/segment-update ::segment-event)
(derive :event/segment-delete ::segment-event)

(methodical/defmethod events/publish-event! ::segment-event
  [topic {:keys [user-id revision-message] segment :object :as _event}]
  (let [table-id    (:table_id segment)
        database-id (table/table-id->database-id table-id)]
    (activity/record-activity!
     {:topic       topic
      :model       "segment"
      :model-id    (:id segment)
      :user-id     user-id
      :object      segment
      :details     (assoc (select-keys segment [:name :description])
                          :revision_message revision-message)
      :database-id database-id
      :table-id    table-id})))

(derive ::user-joined-event ::event)
(derive :event/user-joined ::user-joined-event)

(methodical/defmethod events/publish-event! ::user-joined-event
  [topic {:keys [user-id] :as _event}]
  (activity/record-activity!
   {:topic    topic
    :model    "user"
    :user-id  user-id
    :model-id user-id}))

(derive ::install-event ::event)
(derive :event/install ::install-event)

(methodical/defmethod events/publish-event! ::install-event
  [_topic _event]
  (when-not (t2/exists? :model/Activity :topic "install")
    (t2/insert! :model/Activity :topic "install" :model "install")))
