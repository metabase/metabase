(ns metabase.model-persistence.events.persisted-info
  "Handlers of the lifecycle events that have a model Card persisted when its database persists models, for the user
  who turned it into one."
  (:require
   [metabase.events.core :as events]
   [metabase.model-persistence.db :as model-persistence.db]
   [metabase.model-persistence.models.persisted-info :as persisted-info]
   [metabase.model-persistence.settings :as model-persistence.settings]
   [metabase.util.events :as u.events]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

(set! *warn-on-reflection* true)

(events/derive! ::event :metabase/event)
(events/derive! :event/card-create ::event)
(events/derive! :event/card-update ::event)

(defn- turn-on-model!
  "Turn the persistence of the model Card `card-id` on for `user-id` when its database persists models and it has no
  PersistedInfo, even an `off` or `deletable` one, so only the model conversion of a Card does."
  [card-id user-id]
  (try
    (when-let [card (model-persistence.db/card-for-persistence card-id)]
      (when (and (= (keyword (:type card)) :model)
                 (model-persistence.settings/persisted-models-enabled)
                 (get-in (model-persistence.db/database (:database_id card)) [:settings :persist-models-enabled])
                 (nil? (model-persistence.db/persisted-info-id-for-card card-id)))
        (persisted-info/turn-on-model! user-id card)))
    (catch Throwable e
      (log/warnf "Failed to persist model %s: %s" card-id (ex-message e)))))

(defn- became-model?
  "Whether the write of `event` created a model Card, or turned a Card into one."
  [{:keys [object previous-object] :as event}]
  (and (= (keyword (:type object)) :model)
       (or (nil? previous-object)
           (u.events/changed? event :type))))

(methodical/defmethod events/publish-event! ::event
  [_topic {:keys [object user-id] :as event}]
  (when (and user-id (became-model? event))
    (turn-on-model! (:id object) user-id)))
