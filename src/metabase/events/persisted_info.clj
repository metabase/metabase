(ns metabase.events.persisted-info
  (:require
   [metabase.events :as events]
   [metabase.models :refer [Database PersistedInfo]]
   [metabase.models.persisted-info :as persisted-info]
   [metabase.public-settings :as public-settings]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive ::event :metabase/event)
(derive :event/card-create ::event)
(derive :event/card-update ::event)

(methodical/defmethod events/publish-event! ::event
  [topic card]
  ;; try/catch here to prevent individual topic processing exceptions from bubbling up.  better to handle them here.
  (try
    ;; We only want to add a persisted-info for newly created models where dataset is being set to true.
    ;; If there is already a PersistedInfo, even in "off" or "deletable" state, we skip it as this
    ;; is only supposed to be that initial edge when the dataset is being changed.
    (when (and (:dataset card)
               (public-settings/persisted-models-enabled)
               (get-in (t2/select-one Database :id (:database_id card)) [:settings :persist-models-enabled])
               (nil? (t2/select-one-fn :id PersistedInfo :card_id (:id card))))
      (persisted-info/turn-on-model! (:actor_id card) card))
    (catch Throwable e
      (log/warnf e "Failed to process persisted-info event. %s" topic))))
