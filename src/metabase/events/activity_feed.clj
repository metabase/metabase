(ns metabase.events.activity-feed
  (:require
   [clojure.set :as set]
   [metabase.events :as events]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.activity :as activity]
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
  [topic {:keys [user-id] card :object :as _event}]
  (let [{query :dataset_query
         dataset? :dataset}   card
        query                 (when (seq query)
                                (try (qp/preprocess query)
                                     (catch Throwable e
                                       (log/error e (tru "Error preprocessing query:")))))
        database-id           (some-> query :database u/the-id)
        table-id              (mbql.u/query->source-table-id query)]
    (activity/record-activity!
     {:topic       topic
      :user-id     user-id
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
  [topic {:keys [dashcards user-id] dashboard :object :as _event}]
  (let [details   (case topic
                    ;; dashboard events
                    (:event/dashboard-create
                     :event/dashboard-delete)
                    (select-keys dashboard [:description :name])
                    ;; dashboard card events
                    (:event/dashboard-add-cards
                     :event/dashboard-remove-cards)
                    (let [card-ids             (map :card_id dashcards)
                          card-id->dashcard-id (into {} (map (juxt :card_id :id) dashcards))
                          dashboard            (select-keys dashboard [:name :description])
                          ;; TODO: do we still even use this information? if not let just save dashcards as is
                          dashcards            (if (seq card-ids)
                                                 (->> (t2/select [:model/Card :id :name :description] :id [:in card-ids])
                                                      (map #(set/rename-keys % {:id :card_id}))
                                                      (map #(assoc % :id (get card-id->dashcard-id (:card_id %)))))
                                                 [])]
                      (assoc dashboard :dashcards dashcards)))]
    (activity/record-activity!
     {:topic    topic
      :model    "dashboard"
      :model-id (:id dashboard)
      :user-id  user-id
      :object   dashboard
      :details details})))

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
