(ns metabase-enterprise.workspaces.transform-hooks
  "EE hooks called from the OSS transform execution path. When workspace mode
   is active for a transform's database, `resolve-transform-remapping!` ensures
   a TableRemapping row exists for the transform's declared target and returns
   the remapped {:schema :name} to feed `run-query-transform!`."
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.table-remapping :as ws.remap]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.transforms-base.query :as tb.query]))

(defenterprise resolve-transform-remapping!
  "Resolve (and persist) the workspace remapping for this transform's declared
   target. Returns `{:schema :name}` when a workspace is configured for
   `db-id`, otherwise nil.

   Idempotent: if a TableRemapping row already exists for the source triple,
   returns its target unchanged. Otherwise inserts a new row whose target is
   `(db-workspace-schema db-id)` + `(remapped-table-name from-schema from-table)`."
  :feature :workspaces
  :fallback :oss
  [db-id from-schema from-table]
  (let [to-schema (ws/db-workspace-schema db-id)]
    (when to-schema
      (let [existing              (ws.remap/remap-table db-id from-schema from-table)
            [to-schema* to-table] (or existing
                                      (let [to-table (tb.query/remapped-table-name from-schema from-table)]
                                        (ws.remap/record-remapping! db-id from-schema from-table to-table)
                                        [to-schema to-table]))]
        {:schema to-schema* :name to-table}))))
