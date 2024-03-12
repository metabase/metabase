(ns metabase.models.field-usage
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))


(methodical/defmethod t2/table-name :model/FieldUsage [_model] :field_usage)

(doto :model/FieldUsage
  (derive :metabase/model))
