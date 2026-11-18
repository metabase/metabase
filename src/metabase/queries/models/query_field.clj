(ns metabase.queries.models.query-field
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/QueryField [_model] :query_field)

(derive :model/QueryField :metabase/model)

(defmethod app-db-copy/spec :model/QueryField [_model]
  {:skip? true})
