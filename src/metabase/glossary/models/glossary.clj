(ns metabase.glossary.models.glossary
  (:require
   [metabase.glossary.db :as glossary.db]
   [metabase.glossary.schema :as glossary.schema]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Glossary [_model] :glossary)

(doto :model/Glossary
  (derive :metabase/model)
  (derive :hook/remote-synced)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(methodical/defmethod t2/batched-hydrate [:model/Glossary :creator]
  "Add creator (user) to a glossary entry"
  [_model _k glossary-entries]
  (if-not (seq glossary-entries)
    glossary-entries
    (let [creator-ids (into #{} (map :creator_id) glossary-entries)
          id->creator (glossary.db/users-by-id creator-ids)]
      (for [entry glossary-entries]
        (assoc entry :creator (get id->creator (:creator_id entry)))))))

(def GlossaryEntry
  "Schema for a glossary entry."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:term       ms/NonBlankString]
   [:definition ms/NonBlankString]])

;;; ---------------------- Serialization ----------------------------

(defmethod serialization/spec :model/Glossary [_]
  {:schema    ::glossary.schema/external-glossary
   :copy      [:entity_id :term :definition]
   :transform {:creator_id serialization/user-transform}})

(defmethod serialization/storage-paths :model/Glossary [_ entities _]
  (mapv (fn [item]
          [{:label "glossary"} {:label (:term item) :key (:entity_id item)}])
        entities))

(defmethod remote-sync/synced-where :model/Glossary
  [_model _alias {:keys [library?]}]
  (when library?
    [:= 1 1]))
