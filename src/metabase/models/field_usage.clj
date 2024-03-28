(ns metabase.models.field-usage
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.disallow :as t2.disallow]))

(doto :model/FieldUsage
  (derive :metabase/model)
  (derive ::t2.disallow/update))

(methodical/defmethod t2/table-name :model/FieldUsage [_model] :field_usage)

(t2/deftransforms :model/FieldUsage
  {:used_in              mi/transform-keyword
   :aggregation_function mi/transform-keyword
   :filter_op            mi/transform-keyword
   :filter_args          mi/transform-json
   :breakout_param       mi/transform-json
   :expression_clause    mi/transform-json})

(t2/define-before-insert :model/FieldUsage
  [instance]
  (merge {:timestamp :%now}
         instance))
