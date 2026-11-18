(ns metabase.cache.models.query-cache
  "A model used to cache query results in the database."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/QueryCache [_model] :query_cache)
(methodical/defmethod t2/primary-keys :model/QueryCache [_model] [:query_hash])

(defmethod app-db-copy/spec :model/QueryCache [_model]
  {:skip? true})

(doto :model/QueryCache
  (derive :metabase/model)
  (derive :hook/updated-at-timestamped?))
