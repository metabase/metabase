(ns metabase-enterprise.workspaces.query-processor.copy-metadata
  "The types that a query in the workspace of the request's worktree reads for the shared Fields that the workspace's
  copy gives another type ([[metabase-enterprise.workspaces.copy]]). Row-level security already gives the workspace the
  copy's Fields and Tables; only a changed type of a shared Field needs this. A column the copy gives another base type
  has that type, without the shared coercion."
  (:require
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]))

(set! *warn-on-reflection* true)

(defn- apply-field-copy
  "`column` with the types of its type row `copy` over it."
  [column {:keys [base_type effective_type database_type database_position]}]
  (cond-> column
    (and base_type (not= base_type (:base-type column)))
    (assoc :base-type base_type, :effective-type (or effective_type base_type), :coercion-strategy nil)

    database_type     (assoc :database-type database_type)
    database_position (assoc :database-position database_position)))

(defn- copy-transform
  "The transform for [[lib.metadata/transforming-metadata-provider]] that puts the type rows `type-rows` of a workspace
  over the columns of a provider."
  [type-rows]
  (let [type-row (into {} (map (juxt :field_id identity)) type-rows)]
    (fn [{metadata-type :lib/type} results]
      (if (= :metadata/column metadata-type)
        (into [] (map #(if-let [copy (type-row (:id %))] (apply-field-copy % copy) %)) results)
        results))))

(defn- type-rows
  "The type rows of the workspace with `workspace-id` for the Database with `database-id`, cached in the cache of `mp`
  when it has one, so that a nested preprocess, which wraps the provider again, reads them once."
  [mp workspace-id database-id]
  (let [cache-key [::type-rows workspace-id database-id]
        cached    (when (lib.metadata.protocols/cached-metadata-provider-with-cache? mp)
                    (lib.metadata.protocols/cached-value mp cache-key ::none))]
    (if (and (some? cached) (not= ::none cached))
      cached
      (let [rows (ws.db/field-type-copies-of-database workspace-id database-id)]
        (when (lib.metadata.protocols/cached-metadata-provider-with-cache? mp)
          (lib.metadata.protocols/cache-value! mp cache-key rows))
        rows))))

(defn copy-metadata-provider
  "`mp` with the types of the type rows of the workspace with `workspace-id` over its columns of the Database with
  `database-id`, or nil when the workspace has none for it."
  [mp workspace-id database-id]
  (when-let [rows (not-empty (type-rows mp workspace-id database-id))]
    (lib.metadata/transforming-metadata-provider (copy-transform rows) mp)))
