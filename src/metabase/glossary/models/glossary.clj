(ns metabase.glossary.models.glossary
  (:require
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
