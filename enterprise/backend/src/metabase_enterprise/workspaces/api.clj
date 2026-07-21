(ns metabase-enterprise.workspaces.api
  "Workspaces v2: `/api/ee/workspace` routes.

   Only workspace lifecycle lives here:

     GET    /                        list workspaces
     POST   /                        create a workspace (provisions databases)
     GET    /:workspace-id           fetch one
     PUT    /:workspace-id           update
     DELETE /:workspace-id           delete (with workspace-owned entities)
     POST   /:workspace-id/enter     start working in the workspace
     POST   /exit                    stop working in a workspace

   Entering a workspace sets `core_user.workspace_id`. From then on the *normal*
   API endpoints (cards, transforms, measures, segments) and the QP transparently
   remap entities to their workspace-local copies — reads resolve via
   `metabase.workspaces.core/effective-entity-id`, PUTs copy-on-write via
   `metabase.workspaces.core/ensure-workspace-copy!`, and query execution remaps
   references through the metadata-provider overlay. See
   [[metabase-enterprise.workspaces.remapping]] for the mechanics.

   Superuser-only for the PoC (same as `:model/Workspace` perms)."
  ;; PoC: response schemas come once the API shape settles
  {:clj-kondo/config '{:linters {:metabase/validate-defendpoint-has-response-schema {:level :off}}}}
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment
  ;; TODO PoC follow-ups, roughly in priority order:
  ;;  - permissions story (currently superuser-only)
  ;;  - hide workspace-owned cards/transforms from normal collection/search listings
  ;;  - QP cache: workspace-scoped cache keys
  ;;  - point workspace transform targets at the workspace's provisioned schema
  ;;  - merge/publish: apply workspace targets back onto their sources
  )

(api.macros/defendpoint :get "/"
  "List workspaces."
  []
  (api/check-superuser)
  (ws/list-workspaces))

(api.macros/defendpoint :get "/:workspace-id"
  "Fetch a single workspace."
  [{:keys [workspace-id]} :- [:map [:workspace-id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (ws/get-workspace workspace-id)))

(api.macros/defendpoint :post "/"
  "Create a workspace and provision isolated warehouse resources for the given
   databases (blocking)."
  [_route-params
   _query-params
   {:keys [name database_ids]} :- [:map
                                   [:name ms/NonBlankString]
                                   [:database_ids {:default []} [:sequential ms/PositiveInt]]]]
  (api/check-superuser)
  (ws/create-workspace! {:name         name
                         :creator_id   api/*current-user-id*
                         :database_ids database_ids}))

(api.macros/defendpoint :put "/:workspace-id"
  "Update a workspace."
  [{:keys [workspace-id]} :- [:map [:workspace-id ms/PositiveInt]]
   _query-params
   {:keys [name]} :- [:map [:name {:optional true} ms/NonBlankString]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/Workspace :id workspace-id))
  (when name
    (t2/update! :model/Workspace :id workspace-id {:name name}))
  (ws/get-workspace workspace-id))

(defn- delete-workspace-entities!
  "Delete the workspace-local copies behind every remapping row. Shadow copies and
   workspace-created entities are both workspace-owned rows, so they all go.
   `:table` remappings point at transform output tables; those rows go too (the
   physical warehouse tables live in the workspace schema and are dropped with it
   on deprovision)."
  [workspace-id]
  (doseq [{:keys [entity_type source_entity_id target_entity_id]}
          (t2/select :model/WorkspaceRemapping :workspace_id workspace-id)]
    (case entity_type
      :card      (t2/delete! :model/Card :id target_entity_id)
      :transform (t2/delete! :model/Transform :id target_entity_id)
      :measure   (t2/delete! :model/Measure :id target_entity_id)
      :segment   (t2/delete! :model/Segment :id target_entity_id)
      ;; only drop the table row if it isn't the production row itself
      :table     (when (not= source_entity_id target_entity_id)
                   (t2/delete! :model/Table :id target_entity_id)))))

(api.macros/defendpoint :delete "/:workspace-id"
  "Delete a workspace: every entity created or shadowed inside it, then the
   warehouse isolation resources (blocking), then the workspace itself. Users
   working in the workspace are detached by the FK (`ON DELETE SET NULL`)."
  [{:keys [workspace-id]} :- [:map [:workspace-id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/Workspace :id workspace-id))
  (delete-workspace-entities! workspace-id)
  (ws/delete-workspace! workspace-id)
  api/generic-204-no-content)

(api.macros/defendpoint :post "/:workspace-id/enter"
  "Start working in a workspace: sets the current user's `workspace_id`. All main
   API endpoints and queries then transparently use workspace copies."
  [{:keys [workspace-id]} :- [:map [:workspace-id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/Workspace :id workspace-id))
  (t2/update! :model/User :id api/*current-user-id* {:workspace_id workspace-id})
  {:workspace_id workspace-id})

(api.macros/defendpoint :post "/exit"
  "Stop working in a workspace: clears the current user's `workspace_id`."
  []
  (api/check-superuser)
  (t2/update! :model/User :id api/*current-user-id* {:workspace_id nil})
  {:workspace_id nil})

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace` routes. Authenticated."
  (api.macros/ns-handler *ns* +auth))
