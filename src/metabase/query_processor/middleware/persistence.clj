(ns metabase.query-processor.middleware.persistence
  (:require
   [metabase.api.common :as api]
   [metabase.lib.schema.annotation :as lib.schema.annotation]
   [metabase.permissions.core :as perms]
   [metabase.util.match :as match]))

(defn substitute-persisted-query
  "Removes persisted information if user is sandboxed or uses connection impersonation. The `persisted-info-native`
  annotation is set in [[metabase.query-processor.middleware.fetch-source-query]].

  Sandboxing is detected by the presence of a `sandboxed-table` annotation key anywhere in the provided query

  It may be be possible to use the persistence cache with sandboxing and/or impersonation at a later date with further
  work, but for now we skip the cache in these cases."
  [query]
  (if (and api/*current-user-id*
           (or (match/match-one query {lib.schema.annotation/sandboxed-table &truthy} true)
               (perms/impersonation-enforced-for-db? (:database query))))
    (match/replace query
      {lib.schema.annotation/persisted-info-native &truthy}
      ;; Signal to the SQL QP's independent persisted-cache lookup that it should not use the cache for this
      ;; query. See [[metabase.driver.sql.query-processor/resolve-persisted-source-sql]].
      (-> &match (dissoc lib.schema.annotation/persisted-info-native) (assoc lib.schema.annotation/skip-persisted-cache true)))
    query))
