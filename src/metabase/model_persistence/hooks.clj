(ns metabase.model-persistence.hooks
  "Hooks that have a model Card persisted when its database persists models."
  (:require
   [metabase.api.common :as api]
   [metabase.model-persistence.db :as model-persistence.db]
   [metabase.model-persistence.models.persisted-info :as persisted-info]
   [metabase.model-persistence.settings :as model-persistence.settings]
   [metabase.util.log :as log]
   [metabase.util.write-batch :as write-batch]))

(set! *warn-on-reflection* true)

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

(defn- mark-card!
  "Have the model Card `row` persisted once the batch of writes ends."
  [row]
  (when (= (keyword (:type row)) :model)
    (let [card-id (:id row)
          user-id (or api/*current-user-id* (:creator_id row))]
      (write-batch/mark! [::card card-id]
                         (constantly user-id)
                         (partial turn-on-model! card-id)))))

(defn after-insert
  "Hook for `row` of `model` after it is inserted."
  [model row]
  (when (= model :model/Card)
    (mark-card! row)))

(defn before-update
  "Hook for `row` of `model` before it is updated."
  [model row]
  (when (= model :model/Card)
    (mark-card! row)))
