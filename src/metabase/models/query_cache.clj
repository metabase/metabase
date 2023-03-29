(ns metabase.models.query-cache
  "A model used to cache query results in the database."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan.models :as models]
   [toucan2.core :as t2]))

(models/defmodel QueryCache :query_cache)

(methodical/defmethod t2/primary-keys QueryCache
  [_model]
  [:query_hash])

(mi/define-methods
 QueryCache
 {:properties (constantly {::mi/updated-at-timestamped? true})})
