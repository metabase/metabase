(ns metabase.queries.models.query-table
  (:require
   [metabase.toucan.core :as t2]))

(t2/define-table-name :model/QueryTable [_model] :query_table)

(doto :model/QueryTable
  (derive :metabase/model))
