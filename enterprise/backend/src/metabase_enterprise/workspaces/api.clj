(ns metabase-enterprise.workspaces.api
  "EE API routes for workspaces, served under `/api/ee/workspace`.

  A workspace is the authoring context whose table remappings send transform output to workspace tables instead of
  the canonical ones. Which workspace is in force is a property of the caller, not of the instance, so the two
  execution routes here (`/:id/dataset`, `/:id/transform/run`) exist to bind
  [[metabase.workspaces.core/*current-workspace-id*]] around work the plain routes would run against production.
  That binding is the whole reason they are separate endpoints rather than a parameter."
  (:require
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.util.handlers :as handlers]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.query-processor.core :as qp]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.server.core :as server]
   [metabase.transforms.core :as transforms.core]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [metabase.workspaces.core :as workspaces]
   [metabase.workspaces.schema :as ws.schema]))

(set! *warn-on-reflection* true)

(defn- workspace-or-404
  "The Workspace with `id`, or a 404."
  [id]
  (api/check-404 (ws.db/workspace id)))

;;; ------------------------------------------------- CRUD -------------------------------------------------

(api.macros/defendpoint :get "/" :- [:sequential ::ws.schema/workspace]
  "Every workspace, oldest first."
  []
  (ws.db/workspaces))

(api.macros/defendpoint :post "/" :- ::ws.schema/workspace
  "Create a workspace."
  [_route-params
   _query-params
   {ws-name :name} :- [:map {:closed true}
                       [:name ms/NonBlankString]]]
  (ws.db/create-workspace! ws-name api/*current-user-id*))

(api.macros/defendpoint :get "/:id" :- ::ws.schema/workspace
  "The workspace with `id`."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (workspace-or-404 id))

(api.macros/defendpoint :put "/:id" :- ::ws.schema/workspace
  "Rename the workspace with `id`."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]
   _query-params
   {ws-name :name} :- [:map {:closed true}
                       [:name ms/NonBlankString]]]
  (workspace-or-404 id)
  (ws.db/update-workspace! id {:name ws-name})
  (ws.db/workspace id))

(api.macros/defendpoint :delete "/:id" :- nil
  "Delete the workspace with `id`.

  Refuses a workspace that still holds table remappings, with a 409. Each remapping row is the only record that its
  workspace table exists and what it stands for, so deleting the workspace first would strand those tables in the
  warehouse — unreferenced and unnameable. Drop them (which unmaps them) and retry."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (workspace-or-404 id)
  (let [remaining (ws.db/workspace-remapping-count id)]
    (api/check (zero? remaining)
               [409 (tru "This workspace still has {0} mapped table(s). Drop them before deleting it." remaining)]))
  (ws.db/delete-workspace! id)
  api/generic-204-no-content)

;;; --------------------------------------------- Execution ---------------------------------------------

(api.macros/defendpoint :post "/:id/dataset"
  :- (server/streaming-response-schema ::qp.schema/query-result)
  "Run an ad-hoc query inside the workspace with `id`, reading its workspace tables wherever the query names a
  canonical table those remappings cover. The same query through `/api/dataset` reads the canonical tables."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]
   _query-params
   {:keys [query]} :- [:map {:closed true}
                       [:query ::lib-be.schema/maybe-legacy-query]]]
  (workspace-or-404 id)
  (let [info {:executed-by  api/*current-user-id*
              :context      :ad-hoc
              :workspace-id id}]
    (qp.streaming/streaming-response [rff :api]
      ;; The binding has to wrap `process-query`, not just the request: the remapping middleware reads it
      ;; mid-pipeline, after this handler has returned its streaming response body.
      (workspaces/with-workspace id
        (qp/process-query
         (-> query
             (update-in [:middleware :js-int-to-string?] (fnil identity true))
             (assoc :constraints (qp.constraints/default-query-constraints))
             (update :info merge info)
             qp/userland-query)
         rff)))))

(api.macros/defendpoint :post "/:id/transform/run" :- [:map [:message :string]]
  "Run the transform `transform_id` inside the workspace with `id`, writing its output to a workspace table rather
  than the configured target.

  Synchronous: it returns once the run finishes. Running a transform outside a workspace is what
  `/api/ee/transforms` is for; here the binding is what makes `remap-table!` resolve a target at all — without it
  that call throws rather than writing to the canonical table."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]
   _query-params
   {:keys [transform_id]} :- [:map {:closed true}
                              [:transform_id ms/PositiveInt]]]
  (workspace-or-404 id)
  (let [transform (api/write-check :model/Transform transform_id)]
    (transforms.core/check-feature-enabled! transform)
    (workspaces/with-workspace id
      (transforms.core/execute! transform {:run-method :manual
                                           :user-id    api/*current-user-id*}))
    {:message (tru "Transform run complete.")}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* api/+check-superuser)))
