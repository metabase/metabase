(ns metabase-enterprise.workspaces.impl
  "Workspace lifecycle operations. A workspace materializes a git branch's content into the main app's tables,
  tagged with a `workspace_id`; tearing one down means clearing every workspace-tagged row across those tables."
  (:require
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private workspace-content-models
  "Entity-id content models a workspace can materialize, ordered leaf → root so per-model deletes don't trip FK
  constraints (contents before their collections). Collection is deleted separately, last. Must stay in sync with
  the tables carrying a `workspace_id` column."
  [:model/Card :model/Dashboard :model/Document :model/Timeline :model/NativeQuerySnippet
   :model/Segment :model/Measure :model/Action :model/Transform :model/TransformTag :model/PythonLibrary])

(defn delete-workspace!
  "Delete a workspace and everything it materialized. Removes all workspace-tagged content — its collections and
  their contents, plus global synced content (transforms, snippets) — then the workspace row itself. Users pointing
  at the workspace are cleared automatically by the `ON DELETE SET NULL` FK on `core_user.workspace_id`. Runs in a
  single transaction."
  [workspace-id]
  (t2/with-transaction [_conn]
    (doseq [model workspace-content-models]
      (t2/delete! model :workspace_id workspace-id))
    (t2/delete! :model/Collection :workspace_id workspace-id)
    (t2/delete! :model/RemoteSyncObject :workspace_id workspace-id)
    (t2/delete! :model/RemoteSyncTask :workspace_id workspace-id)
    (t2/delete! :model/Workspace :id workspace-id)))
