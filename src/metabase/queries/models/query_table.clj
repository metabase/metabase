(ns metabase.queries.models.query-table
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/QueryTable [_model] :query_table)

(doto :model/QueryTable
  (derive :metabase/model))

(defmethod app-db-copy/spec :model/QueryTable [_model]
  {:skip? true})
