(ns metabase.models.query-cache
  "A model used to cache query results in the database."
  (:require [metabase.util :as u]
            [toucan.models :as models]))

(models/defmodel QueryCache :query_cache)

(u/strict-extend (class QueryCache)
  models/IModel
  (merge models/IModelDefaults
         {:properties (constantly {:updated-at-timestamped? true})}))
