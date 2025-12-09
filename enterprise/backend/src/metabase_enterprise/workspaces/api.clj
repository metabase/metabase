(ns metabase-enterprise.workspaces.api
  "`/api/ee/workspace/` routes"
  (:require
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase-enterprise.transforms.api :as transforms.api]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.models.workspace-log]
   [metabase-enterprise.workspaces.promotion :as ws.promotion]
   [metabase-enterprise.workspaces.types :as ws.t]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.driver.util :as driver.u]
   [metabase.queries.schema :as queries.schema]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private log-limit "Maximum number of recent workspace log items to show" 20)

(mr/def ::appdb-or-ref-id [:or ::ws.t/appdb-id ::ws.t/ref-id])

;; Workspace status

(mr/def ::graph-status [:enum :stale :calculating :ready])

(mr/def ::db-status [:enum :uninitialized :provisioning :granting :cleaning :ready])

;; Proposed simplified FE statuses

(mr/def ::display-status [:enum :uninitialized :database-not-read :graph-not-ready :ready])

(defn- display-status [graph-status db-status]
  (cond
    (= :uninitialized db-status) :uninitialized
    (not (#{:ready :cleaning} db-status)) :database-not-ready
    (not= :ready graph-status) :graph-not-ready
    :else :ready))

(def ^:private Workspace
  [:map
   [:id ::ws.t/appdb-id]
   [:name :string]
   [:collection_id ::ws.t/appdb-id]
   [:database_id ::ws.t/appdb-id]
   [:status ::display-status]
   [:created_at ms/TemporalInstant]
   [:updated_at ms/TemporalInstant]
   [:archived_at [:maybe :any]]])

;; Transform-related schemas (adapted from transforms/api.clj)

(mr/def ::transform-source
  [:multi {:dispatch (comp keyword :type)}
   [:query
    [:map
     [:type [:= "query"]]
     [:query ::queries.schema/query]]]
   [:python
    [:map {:closed true}
     [:source-database {:optional true} :int]
     [:source-tables   [:map-of :string :int]]
     [:type [:= "python"]]
     [:body :string]]]])

(mr/def ::ws-transform-target
  [:map
   [:type [:enum "table"]]
   [:name :string]])

(mr/def ::run-trigger
  [:enum "none" "global-schedule"])

(defn- check-transforms-enabled!
  [db-id]
  (let [database (api/check-400 (t2/select-one :model/Database db-id)
                                (deferred-tru "The target database cannot be found."))]
    (api/check (transforms.util/check-feature-enabled nil)
               [402 (deferred-tru "Premium features required for transforms are not enabled.")])
    (api/check-400 (not (:is_sample database))
                   (deferred-tru "Cannot run transforms on the sample database."))
    (api/check-400 (not (:is_audit database))
                   (deferred-tru "Cannot run transforms on audit databases."))
    (api/check-400 (driver.u/supports? (:engine database) :transforms/table database)
                   (deferred-tru "The database does not support the requested transform target type."))
    (api/check-400 (not (transforms.util/db-routing-enabled? database))
                   (deferred-tru "Transforms are not supported on databases with DB routing enabled."))))

(defn- ws->response [ws]
  (select-keys ws [:id :name :collection_id :database_id :status :created_at :updated_at :archived_at]))

;;; routes

(def ^:private WorkspaceListing
  [:map {:closed true}
   [:id ::ws.t/appdb-id]
   [:name :string]
   [:archived_at [:maybe :any]]])

(api.macros/defendpoint :get "/" :- [:map [:items [:sequential WorkspaceListing]]]
  "Get a list of all workspaces"
  [_route-params
   _query-params]
  {:items  (->> (t2/select [:model/Workspace :id :name [[:not= nil :archived_at] :archived]]
                           (cond-> {:order-by [[:created_at :desc]]}
                             (request/limit) (sql.helpers/limit (request/limit))
                             (request/offset) (sql.helpers/offset (request/offset))))
                (mapv ws->response))
   :limit  (request/limit)
   :offset (request/offset)})

(mr/def ::input-table
  [:map
   ;; Future-proof with cross-db Python transforms
   [:db_id ::ws.t/appdb-id]
   [:schema :string]
   [:table :string]
   [:table_id [:maybe ::ws.t/appdb-id]]])

(mr/def ::output-table
  [:map
   ;; Future-proof with multi-db Workspaces, plus necessary to resolve table references when id is null.
   [:db_id ::ws.t/appdb-id]
   [:external [:map
               #_[:transform_id [:maybe ::ws.t/appdb-id]]
               [:schema :string]
               [:table :string]
               [:table_id [:maybe ::ws.t/appdb-id]]]]
   [:internal [:map
               [:transform_id ::ws.t/ref-id]
               [:schema :string]
               [:table :string]
               [:table_id [:maybe ::ws.t/appdb-id]]]]])

(api.macros/defendpoint :get "/:id/table"
  :- [:map {:closed true}
      [:inputs [:sequential ::input-table]]
      [:outputs [:sequential ::output-table]]]
  "Get workspace tables"
  [{:keys [_id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  ;; This typically needs the big 'ol graph, to know about the enclosed transforms (for their outputs)
  ;; Easy optimization for the <= 1 entities case and just return the stuff directly though :lightbulb
  {:inputs  []
   :outputs []})

(api.macros/defendpoint :get "/:id" :- Workspace
  "Get a single workspace by ID"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (-> (t2/select-one :model/Workspace :id id) api/check-404 ws->response))

(api.macros/defendpoint :get "/:id/log"
  :- [:map
      [:workspace_id ms/PositiveInt]
      [:status [:enum :pending :ready]]
      [:updated_at :any]
      [:last_completed_at [:maybe :any]]
      [:logs [:sequential [:map
                           [:id ms/PositiveInt]
                           [:task :keyword]
                           [:started_at :any]
                           [:updated_at :any]
                           [:completed_at [:maybe :any]]
                           [:status [:maybe :keyword]]
                           [:message [:maybe :string]]]]]]
  "Get workspace creation status and recent log entries for polling during async setup"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (let [workspace (api/check-404 (t2/select-one :model/Workspace :id id))
        logs      (t2/select [:model/WorkspaceLog
                              :id :task :started_at :completed_at :status :message
                              :updated_at]
                             :workspace_id id
                             {:order-by [[:started_at :desc]]
                              :limit    log-limit})]
    {:workspace_id      id
     :status            (:status workspace)
     :logs              logs
     :updated_at        (->> (map :updated_at logs) sort reverse first)
     :last_completed_at (->> (seq (keep :completed_at logs)) sort reverse first)}))

(def ^:private CreateWorkspace
  [:map
   [:name [:string {:min 1}]]
   [:database_id {:optional true} :int]])

(api.macros/defendpoint :post "/" :- Workspace
  "Create a new workspace

  Potential payload:
  {:name \"a\" :database_id 2}}"
  [_route-params
   _query-params
   {:keys [database_id] :as body} :- CreateWorkspace]

  (when database_id
    (check-transforms-enabled! database_id))

  (ws->response (ws.common/create-workspace! api/*current-user-id* body)))

(api.macros/defendpoint :put "/:id" :- Workspace
  "Update simple workspace properties, like name."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [name]} :- [:map {:closed true} [:name [:string {:min 1}]]]]
  (u/prog1 (api/check-404 (t2/select-one :model/Workspace :id id))
    (api/check-400 (nil? (:archived_at <>)) "Cannot update an archived workspace"))
  (t2/update! :model/Workspace id {:name name})
  (-> (t2/select-one :model/Workspace :id id)
      ws->response))

(api.macros/defendpoint :post "/:id/archive" :- Workspace
  "Archive a workspace. Deletes the isolated schema and tables, but preserves mirrored entities."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body-params]
  (let [ws (api/check-404 (t2/select-one :model/Workspace :id id))]
    (api/check-400 (nil? (:archived_at ws)) "You cannot archive an archived workspace")
    ;; TODO tear down the isolated database resources, and delete the graph
    (t2/update! :model/Workspace id {:archived_at [:now]})
    (-> (t2/select-one :model/Workspace :id id)
        ws->response)))

(api.macros/defendpoint :post "/:id/unarchive" :- Workspace
  "Restore an archived workspace. Recreates the isolated schema and tables."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body-params]
  (let [ws (api/check-404 (t2/select-one :model/Workspace :id id))]
    (api/check-400 (some? (:archived_at ws)) "You cannot unarchive a workspace that is not archived")
    ;; TODO re-provision the isolated database resources, and recompute the graph
    (t2/update! :model/Workspace id {:archived_at nil})
    (-> (t2/select-one :model/Workspace :id id)
        ws->response)))

(api.macros/defendpoint :delete "/:id" :- [:map [:ok [:= true]]]
  "Delete a workspace and all its contents, including mirrored entities."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  ;; TODO implement it https://linear.app/metabase/issue/BOT-574/delete-workspaceid
  {:ok true})

(api.macros/defendpoint :post "/:id/run"
  :- [:map
      [:succeeded [:sequential ::ws.t/ref-id]]
      [:failed [:sequential ::ws.t/ref-id]]
      [:not_run [:sequential ::ws.t/ref-id]]]
  "Execute all transforms in the workspace in dependency order.
   Returns which transforms succeeded, failed, and were not run."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body-params]
  (u/prog1 (t2/select-one :model/Workspace :id id)
    (api/check-404 <>)
    (api/check-400 (nil? (:archived_at <>)) "Cannot execute archived workspace"))
  ;; get topo-sorted enclosed transforms, run them in order
  ;; to keep things simple, stop execution as soon as there is any failure
  ;; in future we can continue running anything as long as its dependencies succeeded
  )

(mr/def ::graph-node-type [:enum :table :output-table :transform :workspace-transform])

(mr/def ::graph-node
  [:map
   [:id ::appdb-or-ref-id]
   [:type [:enum :input-table :output-table :workspace-transform]]
   [:dependents_count [:map-of ::graph-node-type ms/PositiveInt]]
   [:data :map]])

(mr/def ::graph-edge
  [:map
   [:from_entity_id ::appdb-or-ref-id]
   [:from_entity_type :string]
   [:to_entity_id ::appdb-or-ref-id]
   [:to_entity_type :string]])

(def ^:private GraphResult
  [:map
   [:nodes [:sequential ::graph-node]]
   [:edges [:sequential ::graph-edge]]])

(api.macros/defendpoint :get "/:id/graph" :- GraphResult
  "Display the dependency graph between the Changeset and the (potentially external) entities that they depend on."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  ;; TODO decide on whether to show output tables, or to rather show dependencies directly between transforms.
  {:nodes [{:id 1, :type "table", :data {:name "Bob"}, :dependants_count {:workspace-transform 1}}
           {:id "2", :type "workspace-transform", :data {:name "MyTrans"}, :dependants_count {:output-table 1}}
           {:id 3, :type "output-table", :data {:external {:table_id 2, :name "Clarence"}, :internal {:name "_-sdre4rcc@"}}, :dependants_count {}}]
   ;; I can't remember which way this is supposed to point - it might be meant to point *backwards* rather.
   :edges [{:from_entity_type "table"
            :from_entity_id   1
            :to_entity_type   "workspace-transform"
            :to_entity_id     "3"}
           {:from_entity_type "workspace-transform"
            :from_entity_id   "3"
            :to_entity_type   "output-table"
            :to_entity_id     3}]})

(def ^:private db+schema+table (juxt :database :schema :name))

(defn- internal-target-conflict?
  "Check whether the given table is the target of another transform within the workspace. Ignores global transforms."
  [ws-id target & [tx-id]]
  (contains?
   (t2/select-fn-set (comp db+schema+table :target)
                     [:model/WorkspaceTransform :target]
                     :ref_id [:not= tx-id]
                     :workspace_id ws-id)
   (db+schema+table target)))

(api.macros/defendpoint :post "/:id/transform/validate/target"
  "Validate the target table for a workspace transform"
  [{:keys [id]} :- [:map [:id ::ws.t/appdb-id]]
   {:keys [transform-id]} :- [:map [:transform-id {:optional true} ::ws.t/ref-id]]
   {:keys [db_id target]} :- [:map
                              [:db_id {:optional true} ms/PositiveInt]
                              [:target [:map
                                        [:type :string]
                                        [:schema :string]
                                        [:name :string]]]]]
  (let [workspace (api/check-404 (t2/select-one [:model/Workspace :database_id] id))
        tx-id     (when transform-id (parse-long transform-id))
        ws-db-id  (:database_id workspace)]
    (cond
      (not= "table" (:type target))
      {:status 403 :body (deferred-tru "Unsupported target type")}

      (and db_id ws-db-id (not= db_id ws-db-id))
      {:status 403 :body (deferred-tru "Must target the workspace database")}

      (not (or db_id ws-db-id))
      {:status 403 :body (deferred-tru "Must target a database")}

      (not (str/starts-with? (:schema target) "mb__isolation_"))
      {:status 403 :body (deferred-tru "Must not target an isolated workspace schema")}

      ;; Within a workspace, we defer blocking on conflicts outside the workspace
      #_{:status 403 :body (deferred-tru "A table with that name already exists.")}

      ;; TODO consider deferring this validation until merge also.
      (internal-target-conflict? id target tx-id)
      {:status 403 :body (deferred-tru "Another transform in this workspace already targets that table.")}

      :else
      {:status 200 :body "OK"})))

(api.macros/defendpoint :post "/:id/transform"
  "Add another transform to the Changeset. This could be a fork of an existing global transform, or something new."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- [:map {:closed true}
            [:name :string]
            [:description {:optional true} [:maybe :string]]
            [:source ::transform-source]
            [:target ::ws-transform-target]]]
  (api/check (transforms.util/check-feature-enabled body)
             [402 (deferred-tru "Premium features required for this transform type are not enabled.")])
  (let [workspace    (u/prog1 (api/check-404 (t2/select-one :model/Workspace :id id))
                       (api/check-400 (nil? (:archived_at <>)) "Cannot create transforms in an archived workspace"))
        ;; TODO why 400 here and 403 in the validation route? T_T
        _            (api/check-400 (internal-target-conflict? id (:target body))
                                    (deferred-tru "Another transform in this workspace already targets that table."))
        body         (update body :target assoc :database_id (:database_id workspace) :schema (:schema workspace))]
    (ws.common/create-transform! workspace body api/*current-user-id*)))

;; TODO Confirm precisely which fields are needed by the FE
(def ^:private WorkspaceTransformListing
  "Schema for a transform in a workspace"
  [:map {:closed true}
   [:ref_id ::ws.t/ref-id]
   [:name :string]
   [:source_type [:maybe :keyword]]
   [:creator_id ::ws.t/appdb-id]
   [:last_run :map]
   ;; See https://metaboat.slack.com/archives/C099RKNLP6U/p1765205882655869?thread_ts=1765205222.888209&cid=C099RKNLP6U
   [:target_stale :boolean]])

(api.macros/defendpoint :get "/:id/transform" :- [:map [:transforms [:sequential WorkspaceTransformListing]]]
  "Get all transforms in a workspace."
  [{:keys [id]} :- [:map [:id ::ws.t/appdb-id]]]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  {:transforms []})

(def ^:private WorkspaceTransform
  [:map
   [:ref_id ::ws.t/ref-id]
   [:name :string]
   [:description [:maybe :string]]
   [:source :map]
   [:target :map]
   [:workspace_id ::ws.t/appdb-id]
   [:creator_id ::ws.t/appdb-id]
   [:created_at :any]
   [:updated_at :any]])

(defn- malli-map-keys [schema]
  (map first (rest schema)))

(defn- fetch-ws-transform [ws-id tx-id]
  ;; TODO We still need to do some hydration, e.g. of the target table (both internal and external)
  (-> (into [:model/WorkspaceTransform] (malli-map-keys WorkspaceTransform))
      (t2/select-one :ref_id tx-id :workspace_id ws-id)
      (api/check-404)))

(api.macros/defendpoint :get "/:id/transform/:tx-id" :- WorkspaceTransform
  "Get a specific transform in a workspace."
  [{:keys [id tx-id]} :- [:map [:id ::ws.t/ref-id] [:tx-id ::ws.t/ref-id]]]
  (fetch-ws-transform id tx-id))

(api.macros/defendpoint :put "/:id/transform/:tx-id" :- WorkspaceTransform
  "Update a transform in a workspace."
  [{:keys [id tx-id]} :- [:map [:id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]
   _query-params
   body :- [:map
            [:name {:optional true} :string]
            [:description {:optional true} [:maybe :string]]
            [:source {:optional true} ::transform-source]
            [:target {:optional true} ::ws-transform-target]]]
  (api/check-404 (t2/select-one :model/WorkspaceTransform :ref_id tx-id :workspace_id id))
  (t2/update! :model/WorkspaceTransform tx-id body)
  (fetch-ws-transform id tx-id))

(api.macros/defendpoint :post "/:id/transform/:tx-id/archive" :- :nil
  "Mark the given transform to be archived when the workspace is merged.
   For provisional transforms we will skip even creating it in the first place."
  [{:keys [id tx-id]} :- [:map [:id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]]
  (api/check-404 (pos? (t2/update! :model/WorkspaceTransform {:ref_id tx-id :workspace id} {:archived_at [:now]})))
  nil)

(api.macros/defendpoint :post "/:id/transform/:tx-id/unarchive" :- :nil
  "Unmark the given transform for archival. This will recall the last definition it had within the workspace."
  [{:keys [id tx-id]} :- [:map [:id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]]
  (api/check-404 (pos? (t2/update! :model/WorkspaceTransform {:ref_id tx-id :workspace id} {:archived_at nil})))
  nil)

(api.macros/defendpoint :delete "/:id/transform/:tx-id" :- :nil
  "Discard a transform from the changeset.
   Equivalent to resetting a checked-out transform to its global definition, or deleting a provisional transform."
  [{:keys [id tx-id]} :- [:map [:id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]]
  (api/check-404 (pos? (t2/delete! :model/WorkspaceTransform :ref_id tx-id :workspace id)))
  nil)

(api.macros/defendpoint :post "/:id/transform/:tx-id/run"
  :- [:map [:message :string] [:run_id {:optional true} [:maybe :int]]]
  "Run a transform in a workspace."
  [{:keys [id tx-id]} :- [:map [:id ms/PositiveInt] [:tx-id ms/PositiveInt]]]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  (let [transform (api/check-404 (t2/select-one :model/WorkspaceTransform :ref_id tx-id :workspace_id id))]
    (transforms.api/run-transform! transform)))

(api.macros/defendpoint :get "/checkout"
  :- [:map
      [:transforms [:sequential
                    [:map
                     [:id ::ws.t/ref-id]
                     [:name :string]
                     [:workspace [:map
                                  [:id ms/PositiveInt]
                                  [:name :string]]]]]]]
  "Get all downstream transforms for a transform that is not in a workspace.
   Returns the transforms that were mirrored from this upstream transform, with workspace info."
  [_route-params
   {:keys [transform-id]} :- [:map {:closed true} [:id ::ws.t/appdb-id]]]
  (let [transforms       (t2/select [:model/WorkspaceTransform :ref_id :name :workspace_id] :global_id transform-id)
        workspace-ids    (map :workspace_id transforms)
        workspaces-by-id (when (seq transforms)
                           (t2/select-fn->fn :id identity [:model/Workspace :id :name] :id [:in workspace-ids]))]
    {:transforms (for [transform transforms]
                   (assoc transform :workspace (get workspaces-by-id (:workspace_id transform))))}))

(api.macros/defendpoint :post "/:id/merge"
  :- [:or
      [:map
       [:errors [:maybe [:sequential [:map [:id ::ws.t/ref-id] [:name :string] [:error :string]]]]]
       [:workspace [:map [:id ::ws.t/appdb-id] [:name :string]]]
       [:archived_at [:maybe :any]]]
      ;; error message from check-404 or check-400
      :string]
  "Promote workspace transforms back to main Metabase and archive the workspace.

  This will:
  1. Update original transforms with workspace versions
  3. Archive the workspace and clean up isolated resources

  Returns a report of promoted transforms and any errors."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body-params]
  (let [ws               (u/prog1 (t2/select-one :model/Workspace :id id)
                           (api/check-404 <>)
                           (api/check-400 (nil? (:archived_at <>)) "Cannot merge an archived workspace"))
        {:keys [promoted
                errors]} (ws.promotion/promote-transforms! ws)]
    (u/prog1
      {:promoted    (vec promoted)
       :errors      errors
       :workspace   {:id id, :name (:name ws)}
       :archived_at (when-not (seq errors)
                      ;; TODO call a ws.common method, which can handle the clean-up too
                      (t2/update! :model/Workspace :id id {:archived_at [:now]})
                      (t2/select-one-fn :archived_at [:model/Workspace :archived_at] :id id))}
      (when-not (seq errors)
        ;; Most of the APIs and the FE are not respecting when a Workspace is archived yet.
        (t2/delete! :model/Workspace id)))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace/` routes."
  (api.macros/ns-handler *ns* api/+check-superuser +auth))
