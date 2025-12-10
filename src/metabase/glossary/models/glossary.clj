(ns metabase.glossary.models.glossary
  (:require
   [metabase.models.serialization :as serdes]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Glossary [_model] :glossary)

(doto :model/Glossary
  (derive :metabase/model)
  (derive :hook/timestamped?))

(methodical/defmethod t2/batched-hydrate [:model/Glossary :creator]
  "Add creator (user) to a glossary entry"
  [_model _k glossary-entries]
  (if-not (seq glossary-entries)
    glossary-entries
    (let [creator-ids (into #{} (map :creator_id) glossary-entries)
          id->creator (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name]
                                        :id [:in creator-ids])]
      (for [entry glossary-entries]
        (assoc entry :creator (get id->creator (:creator_id entry)))))))

(def GlossaryEntry
  "Schema for a glossary entry."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:term       ms/NonBlankString]
   [:definition ms/NonBlankString]])

;;; ---------------------- Serialization ----------------------------

(defmethod serdes/entity-id "Glossary" [_ {:keys [term]}]
  term)

(defmethod serdes/load-find-local "Glossary"
  [path]
  (t2/select-one :model/Glossary :term (:id (first path))))

(defmethod serdes/hash-fields :model/Glossary
  [_item]
  [:term])

(defmethod serdes/make-spec "Glossary" [_model-name _opts]
  {:copy      [:term :definition]
   :transform {:created_at (serdes/date)
               :updated_at (serdes/date)
               :creator_id (serdes/fk :model/User)}})

(defmethod serdes/storage-path "Glossary" [item _]
  ["glossary" (:term item)])
