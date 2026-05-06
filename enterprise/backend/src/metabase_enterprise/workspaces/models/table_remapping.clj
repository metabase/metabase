(ns metabase-enterprise.workspaces.models.table-remapping
  "Toucan 2 model for the `table_remapping` table. Maps production tables to workspace tables
   for query remapping.

   ## Cache invalidation

   Inserting or deleting a `TableRemapping` row invalidates the QP results cache for the
   affected `database_id`. Without this, a query cached *before* a remap was registered
   would return canonical-table results forever — Phase 2's SQL rewriter never runs on
   cache hits, so a stale entry silently breaches workspace isolation.

   The invalidation bumps `cache_config.invalidated_at` for the database, which is
   consulted by [[metabase.query-processor.middleware.cache-backend.db/select-cache]]
   on every cache read."
  (:require
   [metabase.cache.core :as cache]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TableRemapping [_model] :table_remapping)

(doto :model/TableRemapping
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(t2/define-after-insert :model/TableRemapping
  [row]
  (cache/invalidate-config! {:databases [(:database_id row)]})
  row)

(t2/define-before-delete :model/TableRemapping
  [row]
  (cache/invalidate-config! {:databases [(:database_id row)]}))
