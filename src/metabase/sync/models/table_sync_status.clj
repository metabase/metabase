(ns metabase.sync.models.table-sync-status
  "The `metabase_table_sync_status` table -- a transient marker used during metadata sync.

  As a sync reconciles tables it records their `:model/Table` ids here; afterwards it retires the
  active tables whose id is absent (they disappeared from the warehouse). Tracking \"seen\" tables in
  the app DB rather than in memory lets a sync of a database with very many tables avoid holding the
  whole set at once. The `id` column is both the primary key and a foreign key to `metabase_table.id`
  (cascading on delete)."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TableSyncStatus [_model] :metabase_table_sync_status)

(doto :model/TableSyncStatus
  (derive :metabase/model))
