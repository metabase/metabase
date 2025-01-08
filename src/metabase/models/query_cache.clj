(ns metabase.models.query-cache
  "A model used to cache query results in the database."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/QueryCache [_model] :query_cache)
(methodical/defmethod t2/primary-keys :model/QueryCache [_model] [:query_hash])

(doto :model/QueryCache
  (derive :metabase/model)
  (derive :hook/updated-at-timestamped?))
