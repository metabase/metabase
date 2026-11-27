(ns metabase.model-persistence.events.persisted-info
  "Handlers of the lifecycle events that have a model Card persisted when its database persists models, for the user
  who turned it into one, and its cache pruned when it moves to another database."
  (:require
   [metabase.app-db.core :as mdb]
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

(defn- turn-on-models!
  "Turn the persistence of the model Cards `card-ids`, at most [[mdb/create-partition-size]], on for `user-id` for those
  whose database persists models and that have no PersistedInfo, even an `off` or `deletable` one, so only the model
  conversion of a Card does."
  [card-ids user-id]
  (try
    (when (model-persistence.settings/persisted-models-enabled)
      (let [cards      (filter #(= (keyword (:type %)) :model) (model-persistence.db/cards-for-persistence card-ids))
            persisting (into #{}
                             (comp (filter #(get-in % [:settings :persist-models-enabled]))
                                   (map :id))
                             (some->> (not-empty (into [] (comp (keep :database_id) (distinct)) cards))
                                      model-persistence.db/databases))
            cards      (filter #(contains? persisting (:database_id %)) cards)
            persisted  (some->> (not-empty (mapv :id cards)) model-persistence.db/card-ids-with-persisted-info)]
        (persisted-info/turn-on-models! user-id (remove #(contains? persisted (:id %)) cards))))
    (catch Throwable e
      (log/warnf "Failed to persist models %s: %s" (pr-str card-ids) (ex-message e)))))

(defn- became-model?
  "Whether the `change` created a model Card, or turned a Card into one."
  [{:keys [object previous-object] :as change}]
  (and (= (keyword (:type object)) :model)
       (or (nil? previous-object)
           (u.events/changed? change :type))))

(defn- moved-database?
  "Whether the `change` moved an existing Card to another Database."
  [{:keys [previous-object] :as change}]
  (and (some? previous-object)
       (u.events/changed? change :database_id)))

(methodical/defmethod events/publish-event! ::event
  [_topic {:keys [changes user-id]}]
  (when-let [moved-ids (not-empty (into [] (comp (filter moved-database?) (map (comp :id :object))) changes))]
    (persisted-info/mark-persisted-infos-for-pruning-for-cards! moved-ids))
  (when user-id
    (when-let [card-ids (not-empty (into [] (comp (filter became-model?) (map (comp :id :object))) changes))]
      (run! #(turn-on-models! (vec %) user-id) (partition-all mdb/create-partition-size card-ids)))))
