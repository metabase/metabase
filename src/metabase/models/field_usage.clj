(ns metabase.models.field-usage
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.disallow :as t2.disallow]))

(doto :model/FieldUsage
  (derive :metabase/model)
  (derive ::t2.disallow/update))

(methodical/defmethod t2/table-name :model/FieldUsage [_model] :field_usage)

(t2/define-before-insert :model/FieldUsage
  [instance]
  (merge {:timestamp :%now}
         instance))
