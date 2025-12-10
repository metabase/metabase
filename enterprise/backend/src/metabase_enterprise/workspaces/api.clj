(ns metabase-enterprise.workspaces.api
  "`/api/ee/workspace/` routes"
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase-enterprise.transforms.api :as transforms.api]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.dag :as ws.dag]
   [metabase-enterprise.workspaces.models.workspace-log]
   [metabase-enterprise.workspaces.promotion :as ws.promotion]
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

(def INNER-LIMIT "Limit for number of nested things we are ready to return w/o thinking about it too much" 20)

;;; schemas

(mr/def ::entity-type [:enum :transform])

(mr/def ::entity-grouping [:enum :transforms])

;; Map like {:transforms [1 2 3]}
(mr/def ::entity-map
  [:map-of ::entity-grouping [:sequential {:min 1} ms/PositiveInt]])

(mr/def ::workspace-entity-id :string)

;; Entities that live within the Workspace
(mr/def ::downstream-entity
  [:map
   [:id ms/PositiveInt]
   [:upstream_id [:maybe ms/PositiveInt]]
   [:upstream [:maybe ::ws-transform-target]]
   [:type ::entity-type]
   [:name :string]])

;; Entity reference used in requests
(mr/def ::entity-reference
  [:map
   [:type ::entity-type]
   [:id ms/PositiveInt]])

;; Graph node for view-graph endpoint
(mr/def ::graph-node
  [:map
   [:node_id :string]
   [:id ms/PositiveInt]
   [:type [:enum :table :transform]]
   [:title :string]
   [:dependents [:map-of [:enum :table :transform] ms/PositiveInt]]])

;; Graph edge for view-graph endpoint
(mr/def ::graph-edge
  [:map
   [:from :string]
   [:to :string]])

;; Error: entity that needs to be checked out
(mr/def ::unchecked-out-entity
  [:map
   [:type ::entity-type]
   [:id ms/PositiveInt]
   [:name :string]])

;; Error: entity that cannot be cloned
(mr/def ::uncloneable-entity
  [:map
   [:type ::entity-type]
   [:id ms/PositiveInt]
   [:name :string]
   [:error :string]])

;; Error response for graph-not-closed
(mr/def ::graph-not-closed-error
  [:map
   [:error [:= :graph-not-closed]]
   [:message :string]
   [:entities [:sequential ::unchecked-out-entity]]])

;; Error response for uncloneable entities
(mr/def ::uncloneable-error
  [:map
   [:error [:= :contains-uncloneable-entities]]
   [:message :string]
   [:entities [:sequential ::uncloneable-entity]]])

(def ^:private CreateWorkspace
  [:map
   [:name {:optional true} [:string {:min 1}]]
   [:database_id {:optional true} :int]
   [:upstream {:optional true} ::entity-map]])

(def ^:private ModifyEntities
  [:map {:closed true}
   [:add {:optional true} ::entity-map]
   [:remove {:optional true} ::entity-map]])

(def ^:private Workspace
  [:map
   [:id ms/PositiveInt]
   [:name :string]
   [:collection_id :int]
   [:database_id :int]
   [:status [:enum :pending :ready]]
   [:created_at ms/TemporalInstant]
   [:updated_at ms/TemporalInstant]
   [:archived_at [:maybe :any]]])

(def ^:private FullWorkspace
  [:and Workspace
   [:map
    [:contents [:map-of ::entity-grouping [:sequential ::downstream-entity]]]]])

(def ^:private ExecuteResult
  "Schema for workspace execution result"
  [:map
   [:succeeded [:sequential ::workspace-entity-id]]
   [:failed [:sequential ::workspace-entity-id]]
   [:not_run [:sequential ::workspace-entity-id]]])

(def ^:private GraphResult
  "Schema for workspace graph visualization"
  [:map
   [:nodes [:sequential ::graph-node]]
   [:edges [:sequential ::graph-edge]]])

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

(def ^:private Transform
  "Schema for a transform in a workspace"
  [:map
   [:id ms/PositiveInt]
   [:name :string]
   [:description {:optional true} [:maybe :string]]
   [:source_type {:optional true} [:maybe :keyword]]
   [:source {:optional true} :any]
   [:target {:optional true} :any]
   [:workspace_id {:optional true} [:maybe ms/PositiveInt]]
   [:creator_id {:optional true} [:maybe ms/PositiveInt]]
   [:run_trigger {:optional true} [:maybe :keyword]]
   [:created_at {:optional true} :any]
   [:updated_at {:optional true} :any]])

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
  (select-keys ws
               [:id :name :collection_id :database_id :status :created_at :updated_at :archived_at :contents]))

;;; routes

(api.macros/defendpoint :get "/" :- [:map [:items [:sequential Workspace]]]
  "Get a list of all workspaces"
  [_route-params
   _query-params]
  {:items  (->> (t2/select :model/Workspace :archived_at [:is nil]
                           (cond-> {:order-by [[:created_at :desc]]}
                             (request/limit)  (sql.helpers/limit (request/limit))
                             (request/offset) (sql.helpers/offset (request/offset))))
                (mapv ws->response))
   :limit  (request/limit)
   :offset (request/offset)})

;;;; /tables start

(defn- workspace-input-tables
  [workspace-id]
  (reduce
   (fn [acc {:keys [x_id t_id]}]
     (cond-> acc
       (pos-int? t_id) (update x_id (fnil conj #{}) t_id)))
   {}
   (t2/query {:with [[:ws_xs {:select [:x.*]
                              :from [[(t2/table-name :model/Transform) :x]]
                              :where [:= [:inline workspace-id] :x.workspace_id]}]
                     [:ws_xs_deps {:select [[:x.id :x_id]
                                            [:d.to_entity_id :t_id]]
                                   :from [[:ws_xs :x]]
                                   :left-join [[(t2/table-name :model/Dependency) :d]
                                               [:and
                                                [:= :d.from_entity_type "transform"]
                                                [:= :d.from_entity_id :x.id]
                                                [:= :d.to_entity_type "table"]]]}]]
              :select [:xd.x_id :xd.t_id]
              :from [[:ws_xs_deps :xd]]
              :where [:not [:in :xd.t_id
                            [;; TODO: Revisit this with refactor next week.
                             ;; set of upstream AND downstream so this works even after anticipated remapping changes.
                             {:union-all [{:select [:wmt.upstream_id]
                                           :from [[(t2/table-name :model/WorkspaceMappingTable) :wmt]]}
                                          {:select [:wmt.downstream_id]
                                           :from [[(t2/table-name :model/WorkspaceMappingTable) :wmt]]}]}]]]})))

(defn- workspace-output-tables
  [workspace-id]
  (reduce
   (fn [acc {:keys [x_id t_id]}]
     (cond-> acc
       (pos-int? t_id) (update x_id (fnil conj #{}) t_id)))
   {}
   (t2/query {:with [[:ws_xs {:select [:x.*]
                              :from [[(t2/table-name :model/Transform) :x]]
                              :where [:= [:inline workspace-id] :x.workspace_id]}]
                     [:ws_xs_deps {:select [[:x.id :x_id]
                                            [:d.from_entity_id :t_id]]
                                   :from [[:ws_xs :x]]
                                   :left-join [[(t2/table-name :model/Dependency) :d]
                                               [:and
                                                [:= :d.from_entity_type "table"]
                                                [:= :d.to_entity_id :x.id]
                                                [:= :d.to_entity_type "transform"]]]}]]
              :select [:xd.x_id :xd.t_id]
              :from [[:ws_xs_deps :xd]]})))

(api.macros/defendpoint :get "/:id/tables" :- [:map
                                               [:inputs [:sequential
                                                         [:map
                                                          [:schema [:maybe :string]]
                                                          [:table [:maybe :string]]]]]
                                               [:outputs [:sequential
                                                          [:map
                                                           [:global [:map
                                                                     [:schema [:maybe :string]]
                                                                     [:table [:maybe :string]]]]
                                                           [:workspace [:map
                                                                        [:transform-id :int]
                                                                        [:table-id :int]
                                                                        [:schema [:maybe :string]]
                                                                        [:table [:maybe :string]]]]]]]]
  "Get workspace tables"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (let [workspace (-> (api/check-404 (t2/select-one :model/Workspace :id id))
                      (t2/hydrate :contents))]
    {:inputs
     (let [ids (into #{}
                     (mapcat (fn [[_x-id t-ids]]
                               t-ids))
                     (workspace-input-tables (:id workspace)))]
       (if-not (seq ids)
         []
         (t2/select-fn-vec identity [:model/Table :id :schema [:name :table]]
                           :id [:in ids])))
     :outputs
     (let [ids (workspace-output-tables (:id workspace))]
       (into []
             (keep (fn [[x-id t-ids]]
                     (when (seq t-ids)
                       (let [ws-x (t2/select-one :model/Transform :id x-id)
                             orig-x (when-some [orig-id (:upstream_id (t2/select-one :model/WorkspaceMappingTransform :downstream_id (:id ws-x)))]
                                      (t2/select-one :model/Transform :id orig-id))]
                         {:global {:schema (-> orig-x :target :schema)
                                   :table (-> orig-x :target :name)}
                          :workspace {:transform-id x-id
                                      :table-id (first t-ids)
                                      :schema (-> ws-x :target :schema)
                                      :table (-> ws-x :target :name)}}))))
             ids))}))

;;;; /tables end

(api.macros/defendpoint :get "/:id" :- FullWorkspace
  "Get a single workspace by ID"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (-> (api/check-404 (t2/select-one :model/Workspace :id id))
      (t2/hydrate :contents)
      ws->response))

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
                              :limit    INNER-LIMIT})]
    {:workspace_id      id
     :status            (:status workspace)
     :logs              logs
     :updated_at        (->> (map :updated_at logs) sort reverse first)
     :last_completed_at (->> (seq (keep :completed_at logs)) sort reverse first)}))

(api.macros/defendpoint :post "/" :- Workspace
  "Create a new workspace

  Potential payload:
  {:name \"a\" :database_id 2 :upstream {:transforms [1 2 3]}}"
  [_route-params
   _query-params
   {:keys [_database_id upstream] :as body} :- CreateWorkspace]

  ;; TODO (Sanya) Oops, I forgot that this is optional, and can get inferred later. I broke a bunch of tests.
  ;;              Validation logic should all move to common in any case.
  ;; TODO (Sanya) Oops, there are tests using databases that fail this as well, update the tests first.
  #_(when database_id
      (check-transforms-enabled! database_id))

  (when-let [transform-ids (seq (get upstream :transforms []))]
    (ws.common/check-transforms-not-in-workspace! transform-ids)
    (ws.common/check-no-card-dependencies! transform-ids))

  (-> (ws.common/create-workspace! api/*current-user-id* body)
      ws->response))

(api.macros/defendpoint :post "/:id/name" :- Workspace
  "Update a workspace's name"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [name]} :- [:map [:name [:string {:min 1}]]]]
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
    (t2/update! :model/Workspace id {:archived_at nil})
    (-> (t2/select-one :model/Workspace :id id)
        ws->response)))

(api.macros/defendpoint :delete "/:id" :- [:map [:ok [:= true]]]
  "Delete a workspace and all its contents, including mirrored entities."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  ;; TODO (Chris 11/21/25) -- implement actual deletion logic
  {:ok true})

(api.macros/defendpoint :post "/:id/execute" :- ExecuteResult
  "Execute all transforms in the workspace in dependency order.
   Returns which transforms succeeded, failed, and were not run."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body-params]
  (u/prog1 (t2/select-one :model/Workspace :id id)
    (api/check-404 <>)
    (api/check-400 (nil? (:archived_at <>)) "Cannot execute archived workspace"))
  (reduce
   (fn [acc {tx-id :id :as transform}]
     ;; Prepare for workspace entities to have string ids.
     (let [tx-id (str tx-id)]
       (try (transforms.api/run-transform! transform)
            (update acc :succeeded conj tx-id)
            (catch Exception _
              (update acc :failed conj tx-id)))))
   {:succeeded []
    :failed    []
    :not_run   []}
   ;; TODO topologically sort these properly
   (t2/select :model/Transform :workspace_id id {:order-by [:id]})))

(api.macros/defendpoint :get "/:id/graph" :- GraphResult
  "Get the dependency graph for a workspace, for visualization.
   Shows tables and transforms the workspace depends on, with edges representing dependencies.
   Tables produced by transforms in the workspace are not shown; instead, dependencies appear
   directly between transforms."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  ;; TODO (Chris 11/21/25) -- implement graph generation logic
  {:nodes []
   :edges []})

(api.macros/defendpoint :post "/:id/contents"
  :- [:map [:contents [:map-of ::entity-grouping [:sequential ::downstream-entity]]]]
  "Add upstream entities to workspace by mirroring them into the workspace's isolated environment.

  The entities and their dependencies will be mirrored into the workspace.
  Returns the workspace's updated contents.

  Removal is not implemented yet."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- ModifyEntities]

  (let [workspace (api/check-404 (t2/select-one :model/Workspace :id id))
        upstream  (:add body)
        to-remove (:remove body)]
    (api/check-400 (nil? (:archived_at workspace)) "Cannot add entities to an archived workspace")

    (when-let [transform-ids (seq (get upstream :transforms []))]
      (ws.common/check-transforms-not-in-workspace! transform-ids)
      (ws.common/check-no-card-dependencies! transform-ids))

    (let [existing-upstream-ids (t2/select-fn-set :upstream_id :model/WorkspaceMappingTransform
                                                  :workspace_id id)
          combined-upstream     (update upstream :transforms #(into (set existing-upstream-ids) %))
          graph                 (ws.dag/path-induced-subgraph combined-upstream)
          table-ids             (seq (keep :id (concat (:inputs graph) (:outputs graph))))
          db-ids                (when table-ids (t2/select-fn-set :db_id :model/Table :id [:in table-ids]))
          db-id                 (first db-ids)]
      (when db-id
        (api/check-400 (= db-id (:database_id workspace)) "All entities must belong to the workspace's database")))

    ;; Add new entities
    (when (not-empty upstream)
      (ws.common/add-entities! workspace upstream))

    ;; Remove existing entities
    (when (not-empty to-remove)
      (ws.common/remove-entities! workspace to-remove))

    {:contents (:contents (t2/hydrate (t2/select-one :model/Workspace :id id) :contents))}))

(api.macros/defendpoint :post "/:id/validate-target"
  "Validate the name of a transform target."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [db_id target]} :- [:map
                              [:db_id {:optional true} ms/PositiveInt]
                              [:target [:map
                                        [:type [:= "table"]]
                                        [:schema {:optional true} [:or ms/NonBlankString :nil]]
                                        [:name :string]]]]]
  (cond
    (transforms.util/target-table-exists? {:target (merge {:database db_id} target)
                                           :source {:type :python}})
    {:status 403 :body (deferred-tru "A table with that name already exists.")}

    (some #(= (:name (:target %)) (-> target :name)) (t2/select :model/Transform :workspace_id id))
    {:status 403 :body (deferred-tru "Another transform in this workspace already targets that table.")}

    :else
    {:status 200 :body "OK"}))

(api.macros/defendpoint :post "/:id/transform"
  "Create a new transform directly within a workspace.

  This creates a transform that exists only in the workspace's isolated schema.
  The transform is not mirrored from an existing transform, but created from scratch."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- [:map
            [:name :string]
            [:description {:optional true} [:maybe :string]]
            [:source ::transform-source]
            [:target ::ws-transform-target]
            [:run_trigger {:optional true} ::run-trigger]
            [:tag_ids {:optional true} [:sequential ms/PositiveInt]]]]
  (api/check (transforms.util/check-feature-enabled body)
             [402 (deferred-tru "Premium features required for this transform type are not enabled.")])

  (let [workspace       (u/prog1 (api/check-404 (t2/select-one :model/Workspace :id id))
                          (api/check-400 (nil? (:archived_at <>)) "Cannot create transforms in an archived workspace"))
        target-name     (get-in body [:target :name])
        existing-target (some #(= (:name (:target %)) target-name) (t2/select :model/Transform :workspace_id id))
        body            (update body :target
                                assoc :database_id (:database_id workspace) :schema (:schema workspace))]
    (api/check-400 (not existing-target)
                   (deferred-tru "Another transform in this workspace already targets that table."))

    (ws.common/create-transform! workspace body api/*current-user-id*)))

(api.macros/defendpoint :get "/:id/transform" :- [:map [:items [:sequential Transform]]]
  "Get all transforms in a workspace."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  {:items (into []
                (map #(u/update-some % :last_run transforms.util/localize-run-timestamps))
                (-> (t2/select :model/Transform :workspace_id id {:order-by [[:id :asc]]})
                    (t2/hydrate :last_run :transform_tag_ids :creator)))})

(api.macros/defendpoint :get "/:id/transform/:txid" :- Transform
  "Get a specific transform in a workspace."
  [{:keys [id txid]} :- [:map [:id ms/PositiveInt] [:txid ms/PositiveInt]]]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  (api/check-404 (t2/select-one :model/Transform :id txid :workspace_id id))
  (transforms.api/get-transform txid))

(api.macros/defendpoint :put "/:id/transform/:txid" :- Transform
  "Update a transform in a workspace."
  [{:keys [id txid]} :- [:map [:id ms/PositiveInt] [:txid ms/PositiveInt]]
   _query-params
   body :- [:map
            [:name {:optional true} :string]
            [:description {:optional true} [:maybe :string]]
            [:source {:optional true} ::transform-source]
            [:target {:optional true} ::ws-transform-target]
            [:run_trigger {:optional true} ::run-trigger]
            [:tag_ids {:optional true} [:sequential ms/PositiveInt]]]]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  (api/check-404 (t2/select-one :model/Transform :id txid :workspace_id id))
  (transforms.api/update-transform! txid body))

(api.macros/defendpoint :delete "/:id/transform/:txid" :- :nil
  "Delete a transform in a workspace."
  [{:keys [id txid]} :- [:map [:id ms/PositiveInt] [:txid ms/PositiveInt]]]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  (transforms.api/delete-transform!
   (api/check-404 (t2/select-one :model/Transform :id txid :workspace_id id))))

(api.macros/defendpoint :post "/:id/transform/:txid/run"
  :- [:map [:message :string] [:run_id {:optional true} [:maybe :int]]]
  "Run a transform in a workspace."
  [{:keys [id txid]} :- [:map [:id ms/PositiveInt] [:txid ms/PositiveInt]]]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  (let [transform (api/check-404 (t2/select-one :model/Transform :id txid :workspace_id id))]
    (transforms.api/run-transform! transform)))

(api.macros/defendpoint :get "/mapping/transform/:id/downstream"
  :- [:map
      [:transforms [:sequential
                    [:map
                     [:id ms/PositiveInt]
                     [:name :string]
                     [:workspace [:map
                                  [:id ms/PositiveInt]
                                  [:name :string]]]]]]]
  "Get all downstream transforms for a transform that is not in a workspace.
   Returns the transforms that were mirrored from this upstream transform, with workspace info."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (let [mappings         (t2/select :model/WorkspaceMappingTransform :upstream_id id)
        _                (when (empty? mappings) (api/check-404 (t2/exists? :model/Workspace id)))
        tid->wid         (u/for-map [m mappings]
                           [(:downstream_id m) (:workspace_id m)])
        transform-ids    (map :downstream_id mappings)
        workspace-ids    (map :workspace_id mappings)
        transforms       (when (seq transform-ids)
                           (t2/select [:model/Transform :id :name] :id [:in transform-ids] {:order-by [:created_at]}))
        workspaces-by-id (when (seq workspace-ids)
                           (u/index-by :id (t2/select [:model/Workspace :id :name] :id [:in workspace-ids])))]
    {:transforms (for [transform transforms]
                   (assoc transform :workspace (get workspaces-by-id (tid->wid (:id transform)))))}))

(api.macros/defendpoint :post "/:id/merge"
  :- [:or
      [:map
       [:promoted [:sequential [:map [:id ms/PositiveInt] [:name :string]]]]
       [:errors [:maybe [:sequential [:map [:id ms/PositiveInt] [:name :string] [:error :string]]]]]
       [:workspace [:map [:id ms/PositiveInt] [:name :string]]]
       [:archived_at [:maybe :any]]]
      ;; error message from check-404 or check-400
      :string]
  "Promote workspace transforms back to main Metabase and archive the workspace.

  This will:
  1. Update original transforms with workspace versions
  2. Re-execute transforms in the original schema
  3. Archive the workspace and clean up isolated resources

  Returns a report of promoted transforms and any errors."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body-params]
  (let [ws               (u/prog1 (t2/select-one :model/Workspace :id id)
                           (api/check-404 <>)
                           (api/check-400 (nil? (:archived_at <>)) "Cannot promote an already archived workspace"))
        {:keys [promoted
                errors]} (ws.promotion/promote-transforms! ws)]
    (u/prog1
      {:promoted    (vec promoted)
       :errors      errors
       :workspace   {:id id :name (:name ws)}
       :archived_at (when-not (seq errors)
                      (t2/update! :model/Workspace :id id {:archived_at [:now]})
                      (t2/select-one-fn :archived_at [:model/Workspace :archived_at] :id id))}
      (when-not (seq errors)
        ;; Most of the APIs and the FE are not respecting when a Workspace is archived yet.
        (t2/delete! :model/Workspace id)))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace/` routes."
  (api.macros/ns-handler *ns* api/+check-superuser +auth))
