(ns metabase-enterprise.workspaces.api
  "Workspaces v2: `/api/ee/workspace` routes.

   A workspace is an overlay over the computation/query graph. The API always
   speaks in **real (source) entity ids**; shadowing is internal:

     GET    /                                  list workspaces
     POST   /                                  create a workspace (provisions databases)
     GET    /:workspace-id                     fetch one
     PUT    /:workspace-id                     update
     DELETE /:workspace-id                     delete (with workspace-owned entities)

     POST   /:workspace-id/dataset             run an ad-hoc query in the workspace context

     GET    /:workspace-id/card                cards touched in this workspace
     GET    /:workspace-id/card/:card-id       card as seen from the workspace
     POST   /:workspace-id/card                create a card inside the workspace
     PUT    /:workspace-id/card/:card-id       edit a card inside the workspace (copy-on-write)
     DELETE /:workspace-id/card/:card-id       drop the workspace copy
     POST   /:workspace-id/card/:card-id/query run a card in the workspace context

     (same shape under /:workspace-id/transform, plus POST .../transform/:transform-id/run)

   ## Copy-on-write

   `PUT /:workspace-id/card/:card-id` with no existing remapping clones the
   production card, applies the changes to the clone, and records
   `card-id -> clone-id` in `workspace_remapping`. Subsequent reads/writes/runs of
   `card-id` inside the workspace hit the clone; production and other workspaces
   never see it. `POST` creates a normal card plus a self-remapping row
   (source = target) marking it workspace-owned. `DELETE` only works on entities
   that have a remapping row — you can't delete production entities through a
   workspace, only your shadow of them.

   Superuser-only for the PoC (same as `:model/Workspace` perms)."
  ;; PoC: response schemas come once the API shape settles
  {:clj-kondo/config '{:linters {:metabase/validate-defendpoint-has-response-schema {:level :off}}}}
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.remapping :as ws.entity]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.queries.core :as queries]
   [metabase.query-processor :as qp]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.transforms.core :as transforms.core]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.malli.schema :as ms]
   [ring.util.response :as response]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment
  ;; TODO PoC follow-ups, roughly in priority order:
  ;;  - permissions story (currently superuser-only)
  ;;  - hide workspace-owned cards/transforms from normal collection/search listings
  ;;    (e.g. dedicated hidden collection per workspace, or an `is_workspace` flag)
  ;;  - QP cache: bypass or workspace-scoped cache keys (we pass :ignore-cache for now)
  ;;  - point workspace transform targets at the workspace's provisioned schema
  ;;  - merge/publish: apply workspace targets back onto their sources
  )

;;; ------------------------------------------------ Workspaces ------------------------------------------------

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
      ;; only drop the table row if it isn't the production row itself
      :table     (when (not= source_entity_id target_entity_id)
                   (t2/delete! :model/Table :id target_entity_id)))))

(api.macros/defendpoint :delete "/:workspace-id"
  "Delete a workspace: every entity created or shadowed inside it, then the
   warehouse isolation resources (blocking), then the workspace itself."
  [{:keys [workspace-id]} :- [:map [:workspace-id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/Workspace :id workspace-id))
  (delete-workspace-entities! workspace-id)
  (ws/delete-workspace! workspace-id)
  api/generic-204-no-content)

;;; ------------------------------------------------ Ad-hoc queries ------------------------------------------------

(api.macros/defendpoint :post "/:workspace-id/dataset"
  "Execute an ad-hoc query in the workspace context — same as `POST /api/dataset`,
   but every card / transform-output-table the query references resolves to its
   workspace copy. The workspace binding conveys into the streaming thread via the
   `bound-fn` inside `streaming-response`."
  [{:keys [workspace-id]} :- [:map [:workspace-id ms/PositiveInt]]
   _query-params
   query :- [:map [:database {:optional true} [:maybe :int]]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/Workspace :id workspace-id))
  (ws.entity/with-workspace workspace-id
    (qp.streaming/streaming-response [rff :api]
      (qp/process-query
       (-> query
           (update-in [:middleware :js-int-to-string?] (fnil identity true))
           qp/userland-query-with-default-constraints
           (assoc :info {:executed-by api/*current-user-id*
                         :context     :ad-hoc}))
       rff))))

;;; ------------------------------------------------ Cards ------------------------------------------------

(defn- present
  "Present a workspace-local `entity` under the id the caller asked for. Keeps the
   target id around for debugging."
  [entity source-id]
  (assoc entity :id source-id, :workspace_target_id (:id entity)))

(defn- fetch-card
  "The card as seen from inside the workspace: the shadow copy when one exists,
   the production card otherwise — always under the source id."
  [workspace-id card-id]
  (let [target-id (ws.entity/resolve-id workspace-id :card card-id)]
    (present (api/check-404 (t2/select-one :model/Card :id target-id)) card-id)))

(api.macros/defendpoint :get "/:workspace-id/card"
  "List the cards created or shadowed in this workspace."
  [{:keys [workspace-id]} :- [:map [:workspace-id ms/PositiveInt]]]
  (api/check-superuser)
  (for [{:keys [source_entity_id target_entity_id]}
        (t2/select :model/WorkspaceRemapping :workspace_id workspace-id, :entity_type :card)
        :let [card (t2/select-one :model/Card :id target_entity_id)]
        :when card]
    (present card source_entity_id)))

(api.macros/defendpoint :get "/:workspace-id/card/:card-id"
  "Fetch a card as seen from inside the workspace."
  [{:keys [workspace-id card-id]} :- [:map
                                      [:workspace-id ms/PositiveInt]
                                      [:card-id ms/PositiveInt]]]
  (api/check-superuser)
  (fetch-card workspace-id card-id))

(api.macros/defendpoint :post "/:workspace-id/card"
  "Create a new card inside the workspace. The card is created the normal way and
   recorded as workspace-owned via a self-remapping row."
  [{:keys [workspace-id]} :- [:map [:workspace-id ms/PositiveInt]]
   _query-params
   card-body :- [:map
                 [:name ms/NonBlankString]
                 [:dataset_query :map]
                 [:display {:default "table"} :any]
                 [:visualization_settings {:default {}} :map]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/Workspace :id workspace-id))
  (let [card (queries/create-card! card-body @api/*current-user*)]
    (ws.entity/add-remapping! workspace-id :card (:id card) (:id card))
    (present card (:id card))))

(def ^:private cloneable-card-keys
  "Columns copied from a production card onto its workspace shadow. Identity,
   sharing, and stats columns are deliberately left behind."
  [:name :description :display :dataset_query :visualization_settings :type
   :parameters :parameter_mappings :collection_id :database_id :table_id
   :query_type :result_metadata :cache_ttl])

(defn- clone-card!
  "Copy-on-write: clone `source-card`, apply `changes`, record the remapping.
   Returns the clone."
  [workspace-id source-card changes]
  (let [clone (queries/create-card! (merge (select-keys source-card cloneable-card-keys)
                                           changes)
                                    @api/*current-user*)]
    (ws.entity/add-remapping! workspace-id :card (:id source-card) (:id clone))
    clone))

(api.macros/defendpoint :put "/:workspace-id/card/:card-id"
  "Edit a card inside the workspace. First edit of a production card clones it
   (copy-on-write); later edits hit the existing workspace copy."
  [{:keys [workspace-id card-id]} :- [:map
                                      [:workspace-id ms/PositiveInt]
                                      [:card-id ms/PositiveInt]]
   _query-params
   card-updates :- :map]
  (api/check-superuser)
  (if-let [target-id (ws.entity/source->target workspace-id :card card-id)]
    (let [before (api/check-404 (t2/select-one :model/Card :id target-id))]
      (queries/update-card! {:card-before-update before
                             :card-updates       card-updates
                             :actor              @api/*current-user*})
      (fetch-card workspace-id card-id))
    (let [source (api/check-404 (t2/select-one :model/Card :id card-id))]
      (present (clone-card! workspace-id source card-updates) card-id))))

(api.macros/defendpoint :delete "/:workspace-id/card/:card-id"
  "Delete a card's workspace copy. Only entities previously created or shadowed in
   this workspace can be deleted — production cards are untouchable from here."
  [{:keys [workspace-id card-id]} :- [:map
                                      [:workspace-id ms/PositiveInt]
                                      [:card-id ms/PositiveInt]]]
  (api/check-superuser)
  (let [target-id (api/check-404 (ws.entity/source->target workspace-id :card card-id))]
    (t2/delete! :model/Card :id target-id)
    (ws.entity/remove-remapping! workspace-id :card card-id))
  api/generic-204-no-content)

(api.macros/defendpoint :post "/:workspace-id/card/:card-id/query"
  "Run a card's query in the workspace context: the card itself and every
   card/transform-output-table it references resolve to their workspace copies."
  [{:keys [workspace-id card-id]} :- [:map
                                      [:workspace-id ms/PositiveInt]
                                      [:card-id ms/PositiveInt]]
   _query-params
   {:keys [parameters]} :- [:map [:parameters {:optional true} [:maybe [:sequential :map]]]]]
  (api/check-superuser)
  (let [target-id (ws.entity/resolve-id workspace-id :card card-id)
        card      (api/check-404 (t2/select-one :model/Card :id target-id))]
    (ws.entity/with-workspace workspace-id
      (qp.card/process-query-for-card
       card :api
       :parameters   parameters
       ;; PoC: bypass the query cache entirely; workspace-aware cache keys later
       :ignore-cache true
       :context      :question
       :middleware   {:process-viz-settings? false}))))

;;; ------------------------------------------------ Transforms ------------------------------------------------
;;;
;;; Same shadowing scheme as cards, plus output-table bookkeeping: a workspace
;;; transform writes to a workspace-local table, and a `:table` remapping row
;;; redirects readers of the production output table to it. The workspace output
;;; table's `:model/Table` row is created *inactive before the first run* so it has
;;; a stable id for the remapping; the post-run sync activates it.

(defn- fetch-transform [workspace-id transform-id]
  (let [target-id (ws.entity/resolve-id workspace-id :transform transform-id)]
    (present (api/check-404 (t2/select-one :model/Transform :id target-id)) transform-id)))

(defn- workspace-target
  "Rewrite a transform `:target` to its workspace-local coordinates. PoC: suffix the
   table name; the real thing writes into the workspace's provisioned schema."
  [workspace-id target]
  (update target :name #(str % "_ws_" workspace-id)))

(defn- ensure-output-table-remap!
  "Make sure the workspace transform's output table exists as an (inactive)
   `:model/Table` row and that readers of the production output table are
   redirected to it.

   - production output table row missing (source transform never ran): nothing to
     redirect, skip.
   - workspace table row missing: insert it with `:active false` — running the
     transform + sync will fill it in and activate it, but we need the id *now* to
     record the remapping."
  [workspace-id source-transform target-transform]
  (let [db-id        (get-in source-transform [:target :database])
        source-table (t2/select-one :model/Table
                                    :db_id  db-id
                                    :schema (get-in source-transform [:target :schema])
                                    :name   (get-in source-transform [:target :name]))]
    (when (and source-table
               (nil? (ws.entity/source->target workspace-id :table (:id source-table))))
      (let [{:keys [schema name]} (:target target-transform)
            target-table-id       (or (t2/select-one-pk :model/Table :db_id db-id :schema schema :name name)
                                      (t2/insert-returning-pk! :model/Table
                                                               {:db_id        db-id
                                                                :schema       schema
                                                                :name         name
                                                                :display_name name
                                                                :active       false}))]
        (ws.entity/add-remapping! workspace-id :table (:id source-table) target-table-id)))))

(def ^:private cloneable-transform-keys
  [:name :description :source :target])

(defn- clone-transform!
  "Copy-on-write for transforms: clone with a workspace-local `:target`, record the
   transform remapping, and redirect the production output table."
  [workspace-id source-transform changes]
  (let [clone (t2/insert-returning-instance!
               :model/Transform
               (-> (select-keys source-transform cloneable-transform-keys)
                   (merge changes)
                   (update :target #(workspace-target workspace-id %))))]
    (ws.entity/add-remapping! workspace-id :transform (:id source-transform) (:id clone))
    (ensure-output-table-remap! workspace-id source-transform clone)
    clone))

(api.macros/defendpoint :get "/:workspace-id/transform"
  "List the transforms created or shadowed in this workspace."
  [{:keys [workspace-id]} :- [:map [:workspace-id ms/PositiveInt]]]
  (api/check-superuser)
  (for [{:keys [source_entity_id target_entity_id]}
        (t2/select :model/WorkspaceRemapping :workspace_id workspace-id, :entity_type :transform)
        :let [transform (t2/select-one :model/Transform :id target_entity_id)]
        :when transform]
    (present transform source_entity_id)))

(api.macros/defendpoint :get "/:workspace-id/transform/:transform-id"
  "Fetch a transform as seen from inside the workspace."
  [{:keys [workspace-id transform-id]} :- [:map
                                           [:workspace-id ms/PositiveInt]
                                           [:transform-id ms/PositiveInt]]]
  (api/check-superuser)
  (fetch-transform workspace-id transform-id))

(api.macros/defendpoint :post "/:workspace-id/transform"
  "Create a new transform inside the workspace. Its target is rewritten to a
   workspace-local table."
  [{:keys [workspace-id]} :- [:map [:workspace-id ms/PositiveInt]]
   _query-params
   transform-body :- [:map
                      [:name ms/NonBlankString]
                      [:source :map]
                      [:target :map]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/Workspace :id workspace-id))
  (let [transform (t2/insert-returning-instance!
                   :model/Transform
                   (update transform-body :target #(workspace-target workspace-id %)))]
    (ws.entity/add-remapping! workspace-id :transform (:id transform) (:id transform))
    (present transform (:id transform))))

(api.macros/defendpoint :put "/:workspace-id/transform/:transform-id"
  "Edit a transform inside the workspace (copy-on-write, like cards)."
  [{:keys [workspace-id transform-id]} :- [:map
                                           [:workspace-id ms/PositiveInt]
                                           [:transform-id ms/PositiveInt]]
   _query-params
   transform-updates :- :map]
  (api/check-superuser)
  (if-let [target-id (ws.entity/source->target workspace-id :transform transform-id)]
    (do (api/check-404 (t2/select-one :model/Transform :id target-id))
        ;; updates to an existing workspace copy keep its workspace-local :target
        (t2/update! :model/Transform :id target-id (dissoc transform-updates :target))
        (fetch-transform workspace-id transform-id))
    (let [source (api/check-404 (t2/select-one :model/Transform :id transform-id))]
      (present (clone-transform! workspace-id source transform-updates) transform-id))))

(api.macros/defendpoint :delete "/:workspace-id/transform/:transform-id"
  "Delete a transform's workspace copy (and its output-table redirect)."
  [{:keys [workspace-id transform-id]} :- [:map
                                           [:workspace-id ms/PositiveInt]
                                           [:transform-id ms/PositiveInt]]]
  (api/check-superuser)
  (let [target-id (api/check-404 (ws.entity/source->target workspace-id :transform transform-id))]
    (t2/delete! :model/Transform :id target-id)
    (ws.entity/remove-remapping! workspace-id :transform transform-id))
  api/generic-204-no-content)

(api.macros/defendpoint :post "/:workspace-id/transform/:transform-id/run"
  "Run a transform in the workspace context. Resolves to the workspace copy, makes
   sure its output table is registered + remapped, then executes with the workspace
   bound so the transform's *inputs* (cards, other transforms' outputs) also
   resolve to workspace copies."
  [{:keys [workspace-id transform-id]} :- [:map
                                           [:workspace-id ms/PositiveInt]
                                           [:transform-id ms/PositiveInt]]]
  (api/check-superuser)
  (let [target-id (ws.entity/resolve-id workspace-id :transform transform-id)
        transform (api/check-404 (t2/select-one :model/Transform :id target-id))]
    (when (not= target-id transform-id)
      (ensure-output-table-remap! workspace-id
                                  (t2/select-one :model/Transform :id transform-id)
                                  transform))
    (let [start-promise (promise)
          user-id       api/*current-user-id*]
      ;; re-bind inside the virtual thread — dynamic bindings don't convey there
      (u.jvm/in-virtual-thread*
       (ws.entity/with-workspace workspace-id
         (transforms.core/execute! transform {:start-promise start-promise
                                              :run-method    :manual
                                              :user-id       user-id})))
      (when (instance? Throwable @start-promise)
        (throw @start-promise))
      (let [result @start-promise
            run-id (when (and (vector? result) (= (first result) :started))
                     (second result))]
        (-> (response/response {:message "Transform run started" :run_id run-id})
            (assoc :status 202))))))

;;; ------------------------------------------------ Routes ------------------------------------------------

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace` routes. Authenticated."
  (api.macros/ns-handler *ns* +auth))
