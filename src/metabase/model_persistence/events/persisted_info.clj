(ns metabase.model-persistence.events.persisted-info
  (:require
   [metabase.events.core :as events]
   [metabase.model-persistence.db :as model-persistence.db]
   [metabase.model-persistence.models.persisted-info :as persisted-info]
   [metabase.model-persistence.settings :as model-persistence.settings]
   [metabase.util.log :as log]
   [metabase.warehouses.db :as warehouses.db]
   [methodical.core :as methodical]))

(events/derive! ::event :metabase/event)
(events/derive! :event/card-create ::event)
(events/derive! :event/card-update ::event)

(methodical/defmethod events/publish-event! ::event
  [topic {card :object :keys [user-id] :as _event}]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    ;; We only want to add a persisted-info for newly created models where dataset is being set to true.
    ;; If there is already a PersistedInfo, even in "off" or "deletable" state, we skip it as this
    ;; is only supposed to be that initial edge when the dataset is being changed.
    (when (and (= (:type card) :model)
               (model-persistence.settings/persisted-models-enabled)
               (get-in (when-let [db-id (:database_id card)]
                         (warehouses.db/select-one-database {:id db-id}))
                       [:settings :persist-models-enabled])
               (nil? (:id (model-persistence.db/select-one-persisted-info {:card_id (:id card), :columns [:id]}))))
      (persisted-info/turn-on-model! user-id card))
    (catch Throwable e
      (log/warnf "Failed to process persisted-info event. %s: %s" topic (ex-message e)))))
