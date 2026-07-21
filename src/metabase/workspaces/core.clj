(ns metabase.workspaces.core
  "OSS surface for transparent workspace remapping.

   A user can be *inside* a workspace (`core_user.workspace_id`). While set, the
   main API endpoints and the QP see workspace-local copies of entities instead of
   the production rows — transparently, under the production ids. The mechanics:

   - [[effective-entity-id]] — called at the top of read/execute endpoints
     (`GET /api/card/:id`, `POST /api/card/:id/query`, transform `/run`, ...).
     Resolves a production id to the workspace copy's id when the current user is
     in a workspace and a copy exists; identity otherwise.

   - [[ensure-workspace-copy!]] — called at the top of every PUT endpoint.
     When the current user is in a workspace and the entity has no copy yet,
     clones it (copy-on-write) and records the remapping; returns the id the
     endpoint should operate on. Identity outside a workspace.

   - [[present-entity]] — projects a workspace copy back under the production id
     in API responses, so clients keep a stable view of the graph.

   Query-time references (`:source-card`, transform output tables, measures,
   segments) are remapped by the EE QP preprocess hook via the metadata provider —
   endpoints don't need to rewrite queries, only their route ids.

   OSS fallbacks are identity — no workspace concept without EE."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise current-workspace-id
  "Id of the workspace the current user is working in, or nil. OSS: always nil."
  metabase-enterprise.workspaces.remapping
  []
  nil)

(defenterprise effective-entity-id
  "Resolve `id` of `entity-type` (`:card`, `:transform`, `:measure`, `:segment`,
   `:table`) to the id that should actually be used for the current user: the
   workspace copy's id when the user is in a workspace and a copy exists, `id`
   itself otherwise. OSS: identity."
  metabase-enterprise.workspaces.remapping
  [_entity-type id]
  id)

(defenterprise ensure-workspace-copy!
  "Copy-on-write hook for PUT endpoints. When the current user is in a workspace,
   returns the id of the entity's workspace copy, creating the copy (and its
   remapping row) on first call. Outside a workspace returns `id` unchanged, so
   callers can use this unconditionally at the top of every PUT."
  metabase-enterprise.workspaces.remapping
  [_entity-type id]
  id)

(defn present-entity
  "Present a (possibly remapped) `entity` under `source-id`, the id the client
   asked for. When the entity is a workspace copy the real row id is kept in
   `:workspace_target_id` for debugging; outside a workspace this is identity."
  [entity source-id]
  (cond-> entity
    (and (map? entity) (:id entity) (not= (:id entity) source-id))
    (assoc :id source-id :workspace_target_id (:id entity))))
