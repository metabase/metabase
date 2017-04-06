(ns metabase.models.query-cache
  "A model used to cache query results in the database."
  (:require [toucan.models :as models]
            [metabase.util :as u]))

(models/defmodel QueryCache :query_cache)

(u/strict-extend (class QueryCache)
  models/IModel
  (merge models/IModelDefaults
         {:types      (constantly {:results :compressed})
          :properties (constantly {:updated-at-timestamped? true})}))
