(ns metabase.events.audit-log
  (:require
   [metabase.events :as events]
   [metabase.models.activity :as activity :refer [Activity]]
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
  [topic object]
  (audit-log/record-event! topic object :model/Card))

(derive ::dashboard-event ::event)
(derive :event/dashboard-create ::dashboard-event)
(derive :event/dashboard-delete ::dashboard-event)
(derive :event/dashboard-add-cards ::dashboard-event)
(derive :event/dashboard-remove-cards ::dashboard-event)

(methodical/defmethod events/publish-event! ::dashboard-event
  [topic object]
  (audit-log/record-event! topic object :model/Dashboard))

(derive ::metric-event ::event)
(derive :event/metric-create ::metric-event)
(derive :event/metric-update ::metric-event)
(derive :event/metric-delete ::metric-event)

(methodical/defmethod events/publish-event! ::metric-event
  [topic object]
  (let [details-fn  #(select-keys % [:name :description :revision_message])
        table-id    (:table_id object)
        database-id (table/table-id->database-id table-id)]
    (activity/record-activity!
      :topic       topic
      :object      object
      :details-fn  details-fn
      :database-id database-id
      :table-id    table-id)))

(derive ::pulse-event ::event)
(derive :event/pulse-create ::pulse-event)
(derive :event/pulse-delete ::pulse-event)

(methodical/defmethod events/publish-event! ::pulse-event
  [topic object]
  (let [details-fn #(select-keys % [:name])]
    (activity/record-activity!
      :topic      topic
      :object     object
      :details-fn details-fn)))

(derive ::alert-event ::event)
(derive :event/alert-create ::alert-event)
(derive :event/alert-delete ::alert-event)

(methodical/defmethod events/publish-event! ::alert-event
  [topic {:keys [card] :as alert}]
  (let [details-fn #(select-keys (:card %) [:name])]
    (activity/record-activity!
      ;; Alerts are centered around a card/question. Users always interact with the alert via the question
      :model      "card"
      :model-id   (:id card)
      :topic      topic
      :object     alert
      :details-fn details-fn)))

(derive ::segment-event ::event)
(derive :event/segment-create ::segment-event)
(derive :event/segment-update ::segment-event)
(derive :event/segment-delete ::segment-event)

(methodical/defmethod events/publish-event! ::segment-event
  [topic object]
  (let [details-fn  #(select-keys % [:name :description :revision_message])
        table-id    (:table_id object)
        database-id (table/table-id->database-id table-id)]
    (activity/record-activity!
      :topic       topic
      :object      object
      :details-fn  details-fn
      :database-id database-id
      :table-id    table-id)))

(derive ::user-joined-event ::event)
(derive :event/user-joined ::user-joined-event)

(methodical/defmethod events/publish-event! ::user-joined-event
  [topic object]
  {:pre [(pos-int? (:user-id object))]}
  (activity/record-activity!
    :topic    topic
    :user-id  (:user-id object)
    :model-id (:user-id object)))

(derive ::install-event ::event)
(derive :event/install ::install-event)

(methodical/defmethod events/publish-event! ::install-event
  [_topic _event]
  (when-not (t2/exists? Activity :topic "install")
    (t2/insert! Activity, :topic "install", :model "install")))
