(ns metabase.cache.models.query-cache
  "A model used to cache query results in the database."
  (:require
   [metabase.toucan.core :as t2]))

(t2/define-table-name :model/QueryCache [_model] :query_cache)
(t2/define-primary-keys :model/QueryCache [_model] [:query_hash])

(doto :model/QueryCache
  (derive :metabase/model)
  (derive :hook/updated-at-timestamped?))
