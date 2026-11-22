(ns metabase.glossary.models.glossary
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.events.core :as events]
   [metabase.glossary.db :as glossary.db]
   [metabase.glossary.schema :as glossary.schema]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Glossary [_model] :glossary)

(doto :model/Glossary
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(def GlossaryEntry
  "Schema for a glossary entry."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:term       ::glossary.schema/glossary.term]
   [:definition ::glossary.schema/glossary.definition]])

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(defn- glossary-writable?
  "Whether the current user can write glossary entries: a superuser or an entitled data analyst, on an instance that is
  not remote-sync read-only."
  []
  (boolean (and (api/entitled-data-analyst?) (not (remote-sync/read-only?)))))

(methodical/defmethod t2/batched-hydrate [:model/Glossary :can_read]
  "Whether the current user can read each of `entries`, which every user can."
  [_model k entries]
  (for [entry entries]
    (when entry
      (vary-meta entry assoc k true))))

(methodical/defmethod t2/batched-hydrate [:model/Glossary :can_write]
  "Whether the current user can write each of `entries`, answered once for the whole list."
  [_model k entries]
  (let [writable (glossary-writable?)]
    (for [entry entries]
      (when entry
        (assoc entry k writable)))))

(defmethod mi/can-create? :model/Glossary
  [_model _entry]
  (glossary-writable?))

(defmethod mi/can-update? :model/Glossary
  [entry _changes]
  (mi/can-write? entry))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/Glossary :creator]
  "Add creator (user) to a glossary entry"
  [_model _k glossary-entries]
  (if-not (seq glossary-entries)
    glossary-entries
    (let [creator-ids (into #{} (map :creator_id) glossary-entries)
          id->creator (glossary.db/users-by-id creator-ids)]
      (for [entry glossary-entries]
        (assoc entry :creator (get id->creator (:creator_id entry)))))))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defn- storage-paths
  "The storage path of each of the Glossary `entities`, under `glossary/` by term."
  [entities _ctx]
  (mapv (fn [item]
          [{:label "glossary"} {:label (:term item) :key (:entity_id item)}])
        entities))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-glossary-entry! :- ::glossary.schema/glossary
  "Insert the glossary entry `row` and return it."
  [row :- ::glossary.schema/glossary.create]
  (t2/with-transaction [_conn]
    (u/prog1 (glossary.db/insert-glossary-entry! row)
      (events/publish-event! :event/glossary-create (events/create-event [<>])))))

(mu/defn update-glossary-entry! :- [:maybe ::glossary.schema/glossary]
  "Apply `changes` to the glossary entry with `id` and return the updated entry, or nil when no entry has `id`."
  [id      :- ms/PositiveInt
   changes :- ::glossary.schema/glossary.update]
  (t2/with-transaction [_conn]
    (when-let [previous (glossary.db/glossary-entry id)]
      (glossary.db/update-glossary-entry! id changes)
      (u/prog1 (glossary.db/glossary-entry id)
        (events/publish-event! :event/glossary-update
                               (events/update-event {id previous} [(assoc changes :id id)] {:objects {id <>}}))))))

(mu/defn delete-glossary-entry! :- [:maybe ::glossary.schema/glossary]
  "Delete the glossary entry with `id`, returning the deleted entry, or nil when no entry has `id`."
  [id :- ms/PositiveInt]
  (t2/with-transaction [_conn]
    (when-let [entry (glossary.db/glossary-entry id)]
      (events/publish-event! :event/glossary-delete (events/delete-event [entry]))
      (glossary.db/delete-glossary-entry! id)
      entry)))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/Glossary [_model]
  {:skip? false})

(defmethod serialization/spec :model/Glossary [_]
  {:schema        ::glossary.schema/external-glossary
   :copy          [:entity_id :term :definition]
   :transform     {:creator_id serialization/user-transform}
   :storage-paths storage-paths})

(defmethod remote-sync/spec :model/Glossary
  [_model]
  {:name         :term
   :synced-items glossary.db/synced-glossary-items})

(defmethod audit/spec :model/Glossary [_model]
  {:track          [:term]
   :track-redacted [:creator_id :definition]
   :skip           [:entity_id]})
