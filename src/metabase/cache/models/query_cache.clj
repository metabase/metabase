(ns metabase.cache.models.query-cache
  "A model used to cache query results in the database."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.cache.db :as cache.db]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/QueryCache [_model] :query_cache)
(methodical/defmethod t2/primary-keys :model/QueryCache [_model] [:query_hash])

(doto :model/QueryCache
  (derive :metabase/model)
  (derive :hook/updated-at-timestamped?))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn delete-query-caches!
  "Delete the QueryCache entries with `query-hashes`."
  [query-hashes :- [:sequential bytes?]]
  (cache.db/delete-query-caches! query-hashes))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/QueryCache [_model]
  {:skip? true})
