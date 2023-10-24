(ns metabase.events.activity-feed
  (:require
   [metabase.events :as events]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.activity :as activity :refer [Activity]]
   [metabase.models.card :refer [Card]]
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.table :as table]
   [metabase.query-processor :as qp]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive ::event :metabase/event)

(derive ::card-event ::event)
(derive :event/card-create ::card-event)
(derive :event/card-update ::card-event)
(derive :event/card-delete ::card-event)

(methodical/defmethod events/publish-event! ::card-event
  [topic event]
  (let [card                  (:object event)
        {query :dataset_query
         dataset? :dataset}   card
        query                 (when (seq query)
                                (try (qp/preprocess query)
                                     (catch Throwable e
                                       (log/error e (tru "Error preprocessing query:")))))
        database-id           (some-> query :database u/the-id)
        table-id              (mbql.u/query->source-table-id query)]
    (activity/record-activity!
     {:topic       topic
      :user-id     (:actor-id event)
      :model       (if dataset? "dataset" "card")
      :model-id    (:id card)
      :object      card
      :details     (cond-> (select-keys card [:name :description])
                     ;; right now datasets are all models. In the future this will change so lets keep a breadcumb
                     ;; around
                     dataset? (assoc :original-model "card"))
      :database-id database-id
      :table-id    table-id})))

(derive ::dashboard-event ::event)
(derive :event/dashboard-create ::dashboard-event)
(derive :event/dashboard-delete ::dashboard-event)
(derive :event/dashboard-add-cards ::dashboard-event)
(derive :event/dashboard-remove-cards ::dashboard-event)

(methodical/defmethod events/publish-event! ::dashboard-event
  [topic event]
  (let [dashboard             (:object event)
        create-delete-details
        #(select-keys (:object %) [:description :name])

        add-remove-card-details
        (fn [{:keys [dashcards] :as _event}]
          ;; TODO this schema require a dashcards so we don't have to fetch it twice here
          ;; we expect that the object has just a dashboard :id at the top level
          ;; plus a `:dashcards` attribute which is a vector of the cards added/removed
          (-> (t2/select-one [Dashboard :description :name], :id (get-in event [:object :id]))
              (assoc :dashcards (for [{:keys [id card_id]} dashcards]
                                  (-> (t2/select-one [Card :name :description], :id card_id)
                                      (assoc :id id)
                                      (assoc :card_id card_id))))))]
    (activity/record-activity!
     {:topic    topic
      :model    "dashboard"
      :model-id (:id dashboard)
      :user-id  (:actor-id event)
      :object   dashboard
      :details  (case topic
                  :event/dashboard-create       (create-delete-details event)
                  :event/dashboard-delete       (create-delete-details event)
                  :event/dashboard-add-cards    (add-remove-card-details event)
                  :event/dashboard-remove-cards (add-remove-card-details event))})))

(derive ::metric-event ::event)
(derive :event/metric-create ::metric-event)
(derive :event/metric-update ::metric-event)
(derive :event/metric-delete ::metric-event)

(methodical/defmethod events/publish-event! ::metric-event
  [topic event]
  (let [metric      (:object event)
        table-id    (:table_id metric)
        database-id (table/table-id->database-id table-id)]
    (activity/record-activity!
     {:topic       topic
      :user-id     (:actor-id event)
      :model       "metric"
      :model-id    (:id metric)
      :object      metric
      :details     (assoc (select-keys metric [:name :description])
                          :revision_message  (:revision-message event))
      :database-id database-id
      :table-id    table-id})))

(derive ::pulse-event ::event)
(derive :event/pulse-create ::pulse-event)
(derive :event/pulse-delete ::pulse-event)

(methodical/defmethod events/publish-event! ::pulse-event
  [topic event]
  (let [pulse (:object event)]
    (activity/record-activity!
     {:topic    topic
      :model    "pulse"
      :model-id (:id pulse)
      :user-id  (:actor-id event)
      :object   pulse
      :details  (select-keys pulse [:name])})))

(derive ::alert-event ::event)
(derive :event/alert-create ::alert-event)
(derive :event/alert-delete ::alert-event)

(methodical/defmethod events/publish-event! ::alert-event
  [topic event]
  ;; TODO alert schema require card
  (let [{:keys [card] :as alert} (:object event)]
    (activity/record-activity!
     ;; Alerts are centered around a card/question. Users always interact with the alert via the question
     {:topic      topic
      :user-id    (:actor-id event)
      :model      "alert"
      :model-id   (:id card)
      :object     alert
      :details    (select-keys card [:name])})))

(derive ::segment-event ::event)
(derive :event/segment-create ::segment-event)
(derive :event/segment-update ::segment-event)
(derive :event/segment-delete ::segment-event)

(methodical/defmethod events/publish-event! ::segment-event
  [topic event]
  (let [segment     (:object event)
        table-id    (:table_id segment)
        database-id (table/table-id->database-id table-id)]
    (activity/record-activity!
     {:topic       topic
      :model       "segment"
      :model-id    (:id segment)
      :user-id     (:actor-id event)
      :object      segment
      :details     (assoc (select-keys segment [:name :description])
                          :revision_message  (:revision-message event))
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
  (when-not (t2/exists? Activity :topic "install")
    (t2/insert! Activity, :topic "install", :model "install")))
