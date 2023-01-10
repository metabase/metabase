(ns metabase.models.query-cache
  "A model used to cache query results in the database."
  (:require
   [metabase.models.interface :as mi]
   [toucan.models :as models]))

(models/defmodel QueryCache :query_cache)

(mi/define-methods
 QueryCache
 {:properties (constantly {::mi/updated-at-timestamped? true})})
