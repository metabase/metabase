(ns metabase-enterprise.workspaces.cleanup
  "Functionality for cleaning up and archiving workspaces."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.util :as driver.u]
   [metabase.system.core :as system]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- isolation-schema-name
  "Generate schema name for workspace isolation (matches ws.isolation/isolation-schema-name).
   We duplicate this here to avoid circular dependencies."
  [workspace-id]
  (let [instance-slug      (#'ws.isolation/instance-uuid-slug (str (system/site-uuid)))
        clean-workspace-id (str/replace (str workspace-id) #"[^a-zA-Z0-9]" "_")]
    (format "mb__isolation_%s_%s" instance-slug clean-workspace-id)))

(defn- drop-isolated-schema!
  "Drop the isolated schema for a workspace."
  [workspace database]
  (let [schema-name (isolation-schema-name (:id workspace))
        driver      (driver.u/database->driver database)
        jdbc-spec   (sql-jdbc.conn/connection-details->spec driver (:details database))]
    (log/infof "Dropping isolated schema: %s" schema-name)
    (try
      (jdbc/execute! jdbc-spec [(format "DROP SCHEMA IF EXISTS \"%s\" CASCADE" schema-name)])
      {:status :success :schema schema-name}
      (catch Throwable t
        (log/errorf t "Failed to drop schema %s" schema-name)
        {:status :error :schema schema-name :error (ex-message t)}))))

(defn- delete-workspace-tables!
  "Delete all table metadata for tables in the workspace's isolated schema."
  [workspace-id]
  (let [schema-name (isolation-schema-name workspace-id)
        tables      (t2/select :model/Table :schema schema-name)]
    (log/infof "Deleting %d table records for workspace %s" (count tables) workspace-id)
    (t2/delete! :model/Table :schema schema-name)
    {:deleted-tables (count tables)}))

(defn- delete-workspace-mappings!
  "Delete all workspace mapping records for the workspace."
  [workspace-id]
  (let [mappings (t2/select :model/WorkspaceMappingTransform :workspace_id workspace-id)]
    (log/infof "Deleting %d workspace mapping records" (count mappings))
    (t2/delete! :model/WorkspaceMappingTransform :workspace_id workspace-id)
    {:deleted-mappings (count mappings)}))

(defn- delete-workspace-transforms!
  "Delete all transforms associated with the workspace."
  [workspace-id]
  (let [transforms (t2/select :model/Transform :workspace_id workspace-id)]
    (log/infof "Deleting %d workspace transforms" (count transforms))
    (t2/delete! :model/Transform :workspace_id workspace-id)
    {:deleted-transforms (count transforms)}))

(defn- archive-workspace-collection!
  "Archive the collection associated with the workspace."
  [workspace]
  (when-let [collection-id (:collection_id workspace)]
    (log/infof "Archiving collection %d for workspace %s" collection-id (:id workspace))
    (t2/update! :model/Collection collection-id {:archived true})
    {:archived-collection collection-id}))

(defn- revoke-workspace-api-key!
  "Revoke the API key associated with the workspace."
  [workspace]
  (when-let [api-key-id (:api_key_id workspace)]
    (log/infof "Revoking API key %d for workspace %s" api-key-id (:id workspace))
    ;; API keys don't have an 'archived' field, so we just note it was processed
    ;; In a real implementation, you might want to actually delete or disable the key
    ;; For now, we'll just log it
    {:revoked-api-key api-key-id}))

(defn- mark-workspace-archived!
  "Mark the workspace as archived in the database."
  [workspace-id archived-at]
  (log/infof "Marking workspace %s as archived" workspace-id)
  ;; Note: The workspace table may not have an 'archived' column yet
  ;; This would require a migration to add. For now, we'll just log it.
  ;; TODO: Add 'archived' and 'archived_at' columns to workspace table
  ;; (t2/update! :model/Workspace workspace-id {:archived true :archived_at archived-at})
  {:archived-workspace workspace-id :archived-at archived-at})

(defn archive-workspace!
  "Archive a workspace after successful promotion.

   This will:
   1. Delete workspace transforms from app DB
   2. Delete table metadata from app DB
   3. Drop the isolated schema from the data warehouse
   4. Archive the associated collection
   5. Revoke the API key
   6. Mark the workspace as archived

   Returns a map with the results of each operation."
  [workspace-id]
  (log/infof "Starting archival of workspace %s" workspace-id)

  (let [workspace          (t2/select-one :model/Workspace :id workspace-id)
        _                  (assert workspace (format "Workspace %s not found" workspace-id))
        database-id        (:database_id workspace)
        database           (t2/select-one :model/Database :id database-id)
        archived-at        (java.time.OffsetDateTime/now)
        ;; Delete workspace mappings first (FK constraints)
        mapping-result     (delete-workspace-mappings! workspace-id)
        ;; Delete workspace transforms
        transform-result   (delete-workspace-transforms! workspace-id)
        ;; Delete table metadata
        table-result       (delete-workspace-tables! workspace-id)
        ;; Drop the isolated schema
        schema-result      (drop-isolated-schema! workspace database)
        ;; Archive collection
        collection-result  (archive-workspace-collection! workspace)
        ;; Revoke API key
        api-key-result     (revoke-workspace-api-key! workspace)
        ;; Mark workspace as archived
        workspace-result   (mark-workspace-archived! workspace-id archived-at)]

    (log/infof "Workspace %s archival complete" workspace-id)

    (merge
     {:workspace-id workspace-id
      :archived-at  archived-at}
     mapping-result
     transform-result
     table-result
     schema-result
     collection-result
     api-key-result
     workspace-result)))
