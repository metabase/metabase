(ns metabase.model-persistence.events.persisted-info
  (:require
   [metabase.events.core :as events]
   [metabase.model-persistence.models.persisted-info :as persisted-info]
   [metabase.model-persistence.settings :as model-persistence.settings]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive ::event :metabase/event)
(derive :event/card-create ::event)
(derive :event/card-update ::event)

(methodical/defmethod events/publish-event! ::event
  [topic {card :object :keys [user-id] :as _event}]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    ;; We only want to add a persisted-info for newly created models where dataset is being set to true.
    ;; If there is already a PersistedInfo, even in "off" or "deletable" state, we skip it as this
    ;; is only supposed to be that initial edge when the dataset is being changed.
    (when (and (= (:type card) :model)
               (model-persistence.settings/persisted-models-enabled)
               (get-in (t2/select-one :model/Database :id (:database_id card)) [:settings :persist-models-enabled])
               (nil? (t2/select-one-fn :id :model/PersistedInfo :card_id (:id card))))
      (persisted-info/turn-on-model! user-id card))
    (catch Throwable e
      (log/warnf e "Failed to process persisted-info event. %s" topic))))

(derive ::events :metabase/event)
(derive :event/cards-create ::events)
(derive :event/cards-update ::events)

(methodical/defmethod events/publish-event! ::events
  [topic events]
  (when (model-persistence.settings/persisted-models-enabled)
    (doseq [{:keys [object user-id]} events
            :when (and (= (:type object) :model)
                       (t2/select-one-fn (fn [db] (get-in db [:settings :persist-models-enabled])) :model/Database :id (:database_id object))
                       (not (t2/exists? :model/PersistedInfo :card_id (:id object))))]
      (try
        (persisted-info/turn-on-model! user-id object)
        (catch Throwable e
          (log/warnf e "Failed to process persisted-info event. %s" topic))))))
