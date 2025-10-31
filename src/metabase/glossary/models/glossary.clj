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
               :updated_at (serdes/date)}})

(defmethod serdes/storage-path "Glossary" [item _]
  ["glossary" (:term item)])
