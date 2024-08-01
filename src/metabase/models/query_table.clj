(ns metabase.models.query-table
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/QueryTable [_model] :query_table)

(doto :model/QueryTable
  (derive :metabase/model))
