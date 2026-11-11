(ns metabase.glossary.models.glossary
  (:require
   [metabase.glossary.db :as glossary.db]
   [metabase.glossary.schema :as glossary.schema]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.toucan.core :as t2]
   [metabase.util.malli.schema :as ms]))

(t2/define-table-name :model/Glossary [_model] :glossary)

(doto :model/Glossary
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(t2/define-batched-hydrate [:model/Glossary :creator]
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

(defmethod remote-sync/spec :model/Glossary
  [_model]
  {:label :term})
