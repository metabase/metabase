(ns metabase.query-processor.middleware.persistence
  (:require
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.query.permissions :as query-perms]))

(defn substitute-persisted-query
  "Removes persisted information if user is sandboxed.
   `:persisted-info/native` is set in [[metabase.query-processor.middleware.fetch-source-query]].

   If permissions are applied to the query (sandboxing) then do not use the cached query.
   It may be be possible to use the persistence cache with sandboxing at a later date with further work."
  [{::query-perms/keys [perms] :as  query}]
  (if perms
    (lib.util.match/replace query
      (x :guard (every-pred map? :persisted-info/native))
      (dissoc x :persisted-info/native))
    query))
