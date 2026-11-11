(ns metabase.queries.models.query-field
  (:require
   [metabase.toucan.core :as t2]))

(t2/define-table-name :model/QueryField [_model] :query_field)

(derive :model/QueryField :metabase/model)
