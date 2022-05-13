(ns metabase.query-processor.middleware.persistence
  (:require [metabase.mbql.util :as mbql.u]
            [metabase.query-processor.middleware.permissions :as qp.perms]))

(defn substitute-persisted-query
  "Replaces source-query with the native query to the cache table.
   `:persisted-info/native` is set in `fetch-source-query`.

   If permissions are applied to the query (sandboxing) then do not use the cached query.
   It may be be possible to use the persistence cache with sandboxing at a later date with further work."
  [{::qp.perms/keys [perms] :as  query}]
  (if perms
    query
    (mbql.u/replace query
      (x :guard (every-pred map? :persisted-info/native))
      {:native (:persisted-info/native x)})))
