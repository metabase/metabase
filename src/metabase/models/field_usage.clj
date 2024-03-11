(ns metabase.models.field-usage
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))


(methodical/defmethod t2/table-name :model/FieldUsage [_model] :field_usage)

(doto :model/FieldUsage
  (derive :metabase/model))

(defn toggle-field!
  "Toggle the `is_current` status of relevant FieldUsages"
  [field-id is-current?]
  (t2/update! :model/FieldUsage :field_id field-id {:is_current is-current?}))
