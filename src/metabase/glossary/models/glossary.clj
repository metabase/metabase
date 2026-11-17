(ns metabase.glossary.models.glossary
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.glossary.db :as glossary.db]
   [metabase.glossary.schema :as glossary.schema]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util.i18n :refer [tru]]
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
   [:term       ms/NonBlankString]
   [:definition ms/NonBlankString]])

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn- check-text
  "Throws a 400 unless `value` of the column `k` is a non-blank string."
  [k value]
  (when-not (and (string? value) (not (str/blank? value)))
    (throw (ex-info (tru "A glossary entry needs a non-blank {0}." (name k)) {:status-code 400}))))

(t2/define-before-insert :model/Glossary
  [entry]
  (check-text :term (:term entry))
  (check-text :definition (:definition entry))
  entry)

(t2/define-before-update :model/Glossary
  [entry]
  (let [changes (t2/changes entry)]
    (when (contains? changes :term)
      (check-text :term (:term entry)))
    (when (contains? changes :definition)
      (check-text :definition (:definition entry))))
  entry)

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

(defmethod serialization/spec :model/Glossary [_]
  {:schema    ::glossary.schema/external-glossary
   :copy      [:entity_id :term :definition]
   :transform {:creator_id serialization/user-transform}})

(defmethod serialization/storage-paths :model/Glossary [_ entities _]
  (mapv (fn [item]
          [{:label "glossary"} {:label (:term item) :key (:entity_id item)}])
        entities))

;;; -------------------------------------------------- Remote sync ---------------------------------------------------

(defmethod remote-sync/spec :model/Glossary
  [_model]
  {:name         :term
   :synced-items glossary.db/synced-glossary-items})
