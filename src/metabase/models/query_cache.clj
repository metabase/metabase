(ns metabase.models.query-cache
  "A model used to cache query results in the database."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def QueryCache
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], not it's a reference to the toucan2 model name.
  We'll keep this till we replace all these symbols in our codebase."
  :model/QueryCache)

(methodical/defmethod t2/table-name :model/QueryCache [_model] :query_cache)
(methodical/defmethod t2/primary-keys QueryCache [_model] [:query_hash])

(doto :model/QueryCache
  (derive :metabase/model)
  (derive :hook/updated-at-timestamped?))
