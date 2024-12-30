(ns metabase.query-processor.middleware.persistence
  (:require
   [metabase.api.common :as api]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.query.permissions :as query-perms]
   [metabase.permissions.util :as perms-util]))

(defn substitute-persisted-query
  "Removes persisted information if user is sandboxed or uses connection impersonation. `:persisted-info/native` is set
  in [[metabase.query-processor.middleware.fetch-source-query]].

  Sandboxing is detected by the presence of the ::query-perms/perms key added by row-level-restrictions middleware.

  It may be be possible to use the persistence cache with sandboxing and/or impersonation at a later date with further
  work, but for now we skip the cache in these cases."
  [{::query-perms/keys [perms] :as query}]
  (if (and api/*current-user-id*
           (or perms ;; sandboxed?
               (perms-util/impersonation-enforced-for-db? (:database query))))
    (lib.util.match/replace query
      (x :guard (every-pred map? :persisted-info/native))
      (dissoc x :persisted-info/native))
    query))
