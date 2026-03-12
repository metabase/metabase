(ns metabase-enterprise.workspaces.api
  "`/api/ee/workspace/` routes"
  (:require
   [clojure.set :as set]
   [clojure.walk :as walk]
   [honey.sql.helpers :as sql.helpers]
   [metabase-enterprise.workspaces.api.common :as ws.api.common]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase-enterprise.workspaces.merge :as ws.merge]
   [metabase-enterprise.workspaces.models.workspace :as ws.model]
   [metabase-enterprise.workspaces.models.workspace-input-external]
   [metabase-enterprise.workspaces.models.workspace-log]
   [metabase-enterprise.workspaces.models.workspace-output-external]
   [metabase-enterprise.workspaces.types :as ws.t]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.config.core :as config]
   [metabase.driver.util :as driver.u]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; --------------------------------------------------- Schemas -------------------------------------------------------

(def ^:private WorkspaceStatus
  (into [:enum] ws.api.common/computed-statuses))

(def ^:private Workspace
  [:map
   [:id ::ws.t/appdb-id]
   [:name :string]
   [:collection_id ::ws.t/appdb-id]
   [:database_id ::ws.t/appdb-id]
   [:status WorkspaceStatus]
   [:created_at ms/TemporalInstant]
   [:updated_at ms/TemporalInstant]])

(def ^:private TransformSource ws.api.common/TransformSource)

(def ^:private TransformTarget
  [:map {:closed true}
   [:database {:optional true} ::ws.t/appdb-id]
   [:type [:enum "table"]]
   [:schema {:optional true} [:maybe [:string {:min 1}]]]
   [:name [:string {:min 1}]]])

(def ^:private InputTable
  [:map
   [:db_id ::ws.t/appdb-id]
   [:schema [:maybe :string]]
   [:table :string]
   [:table_id [:maybe ::ws.t/appdb-id]]])

(def ^:private OutputTable
  [:map
   [:db_id ::ws.t/appdb-id]
   [:global [:map
             [:transform_id [:maybe ::ws.t/appdb-id]]
             [:schema [:maybe :string]]
             [:table :string]
             [:table_id [:maybe ::ws.t/appdb-id]]]]
   [:isolated [:map
               [:transform_id [:or ::ws.t/ref-id ::ws.t/appdb-id]]
               [:schema :string]
               [:table :string]
               [:table_id [:maybe ::ws.t/appdb-id]]]]])

(def ^:private WorkspaceTransform
  [:map
   [:ref_id ::ws.t/ref-id]
   [:global_id [:maybe ::ws.t/appdb-id]]
   [:name :string]
   [:description [:maybe :string]]
   [:source :map]
   [:target :map]
   [:target_stale [:maybe :boolean]]
   [:workspace_id ::ws.t/appdb-id]
   [:creator_id [:maybe ::ws.t/appdb-id]]
   [:archived_at :any]
   [:created_at :any]
   [:updated_at :any]
   [:last_run_at :any]
   [:last_run_status [:maybe :string]]
   [:last_run_message [:maybe :string]]])

(def ^:private WorkspaceTransformListing
  [:map {:closed true}
   [:ref_id ::ws.t/ref-id]
   [:global_id [:maybe ::ws.t/appdb-id]]
   [:name :string]
   [:source_type [:maybe :keyword]]
   [:creator_id [:maybe ::ws.t/appdb-id]]])

(def ^:private ExternalTransform
  [:map
   [:id ::ws.t/appdb-id]
   [:name :string]
   [:source_type :keyword]
   [:checkout_disabled [:maybe :string]]])

(def ^:private PendingInput
  [:map
   [:db_id ::ws.t/appdb-id]
   [:schema [:maybe :string]]
   [:table :string]])

(def ^:private GraphNode
  [:map
   [:id [:or ::ws.t/appdb-id ::ws.t/ref-id]]
   [:type [:enum :input-table :external-transform :workspace-transform]]
   [:dependents_count [:map-of [:enum :input-table :external-transform :workspace-transform] ms/PositiveInt]]
   [:data :map]])

(def ^:private GraphEdge
  [:map
   [:from_entity_id [:or ::ws.t/appdb-id ::ws.t/ref-id]]
   [:from_entity_type :string]
   [:to_entity_id [:or ::ws.t/appdb-id ::ws.t/ref-id]]
   [:to_entity_type :string]])

(def ^:private GraphResult
  [:map
   [:nodes [:sequential GraphNode]]
   [:edges [:sequential GraphEdge]]])

;;; --------------------------------------------------- Routes -------------------------------------------------------

(def ^:private WorkspaceListing
  [:map {:closed true}
   [:id ::ws.t/appdb-id]
   [:database_id ::ws.t/appdb-id]
   [:name :string]
   [:status WorkspaceStatus]
   [:updated_at ms/TemporalInstant]])

(api.macros/defendpoint :get "/" :- [:map {:closed true}
                                     [:items [:sequential WorkspaceListing]]
                                     [:limit [:maybe :int]]
                                     [:offset [:maybe :int]]]
  "Get a list of all workspaces"
  [_route-params
   _query-params]
  {:items  (->> (t2/select [:model/Workspace :id :name :database_id :base_status :db_status :updated_at]
                           (cond-> {:order-by [[:created_at :desc]]}
                             (request/limit) (sql.helpers/limit (request/limit))
                             (request/offset) (sql.helpers/offset (request/offset))))
                (mapv #(-> %
                           (dissoc :base_status :db_status)
                           (assoc :status (ws.model/computed-status %)))))
   :limit  (request/limit)
   :offset (request/offset)})

(api.macros/defendpoint :get "/:ws-id/table"
  :- [:map {:closed true}
      [:inputs [:sequential InputTable]]
      [:outputs [:sequential OutputTable]]]
  "Get workspace tables"
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params]
  (ws.api.common/get-workspace-tables ws-id))

(api.macros/defendpoint :get "/:ws-id" :- Workspace
  "Get a single workspace by ID"
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params]
  (ws.api.common/get-workspace ws-id))

(api.macros/defendpoint :get "/:ws-id/log"
  :- [:map
      [:workspace_id ms/PositiveInt]
      [:status WorkspaceStatus]
      [:updated_at :any]
      [:last_completed_at [:maybe :any]]
      [:logs [:sequential [:map
                           [:id ms/PositiveInt]
                           [:task :keyword]
                           [:description ms/LocalizedString]
                           [:started_at :any]
                           [:updated_at :any]
                           [:completed_at [:maybe :any]]
                           [:status [:maybe :keyword]]
                           [:message [:maybe :string]]]]]]
  "Get workspace creation status and recent log entries for polling during async setup"
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params]
  (ws.api.common/get-workspace-log ws-id))

(def ^:private CreateWorkspace
  [:map
   [:name {:optional true} [:string {:min 1}]]
   [:database_id {:optional true} ::ws.t/appdb-id]])

(defn- first-supported-database-id
  "Return the ID of the first database that supports workspaces, or nil if none."
  []
  (:id
   (u/seek #(driver.u/supports? (:engine %) :workspace %)
           (t2/select :model/Database :is_audit false :is_sample false {:order-by [:name]}))))

(api.macros/defendpoint :post "/" :- Workspace
  "Create a new workspace

  Potential payload:
  {:name \"a\" :database_id 2}}"
  [_route-params
   _query-params
   {:keys [database_id] :as body} :- CreateWorkspace]
  (when database_id
    (ws.api.common/check-transforms-enabled! database_id))

  ;; If no database_id provided, use first supported DB as provisional default (uninitialized workspace)
  (let [provisional? (not database_id)
        database-id  (or database_id
                         (api/check-400 (first-supported-database-id)
                                        (tru "No supported databases configured. Please add a database that supports workspaces.")))]
    (ws.api.common/ws->response (ws.common/create-workspace! api/*current-user-id*
                                                             (assoc body
                                                                    :database_id database-id
                                                                    :provisional? provisional?)))))

(defn- db-unsupported-reason [db]
  (when (not (driver.u/supports? (:engine db) :workspace db))
    "Database type not supported."))

(api.macros/defendpoint :get "/enabled" :- [:map [:supported :boolean] [:reason {:optional true} :string]]
  "Test whether the current user can use Workspaces. Optionally takes a specific database.
   Factors include: driver support, database user privileges, metabase permissions."
  [_url-params
   {:keys [database-id]} :- [:map [:database-id {:optional true} ms/PositiveInt]]]
  (if-let [reason (when database-id
                    (db-unsupported-reason (api/check-404 (t2/select-one :model/Database database-id))))]
    {:supported false, :reason reason}
    {:supported true}))

(api.macros/defendpoint :get "/database" :- [:map
                                             [:databases
                                              [:sequential [:map
                                                            [:id ms/PositiveInt]
                                                            [:name :string]
                                                            [:enabled :boolean]
                                                            [:permissions_status {:optional true}
                                                             [:map
                                                              [:status :string]
                                                              [:checked_at :string]
                                                              [:error {:optional true} :string]]]]]]]
  "Get a list supported databases, and whether they're enabled and have required permissions."
  [_url-params
   _query-params]
  (let [databases (->> (t2/select [:model/Database :id :name :engine :settings :workspace_permissions_status]
                                  :is_audit false :is_sample false {:order-by [:name]})
                       (filter #(driver.u/supports? (:engine %) :workspace %)))]
    {:databases (mapv (fn [{:keys [id name workspace_permissions_status settings]}]
                        {:id                           id
                         :name                         name
                         :enabled                      (boolean (:database-enable-workspaces settings))
                         :workspace_permissions_status (or workspace_permissions_status {:status "unknown"})})
                      databases)}))

(api.macros/defendpoint :put "/:ws-id" :- Workspace
  "Update simple workspace properties.

  Can set database_id only on uninitialized workspaces."
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params
   {:keys [name database_id]} :- [:map {:closed true}
                                  [:name {:optional true} [:string {:min 1}]]
                                  [:database_id {:optional true} ::ws.t/appdb-id]]]
  (let [workspace (api/check-404 (t2/select-one :model/Workspace :id ws-id))
        _         (api/check-400 (not= :archived (:base_status workspace)) "Cannot update an archived workspace")
        data      (cond-> {}
                    database_id (-> (u/prog1
                                      (api/check-400 (= :uninitialized (:db_status workspace))
                                                     "Can only set database_id on uninitialized workspace")
                                      (ws.api.common/check-transforms-enabled! database_id))
                                    (assoc :database_id database_id))
                    name        (assoc :name name))]
    (ws.api.common/ws->response
     (if (seq data)
       (do
         (t2/update! :model/Workspace ws-id data)
         (t2/select-one :model/Workspace :id ws-id))
       workspace))))

(api.macros/defendpoint :post "/:ws-id/archive" :- Workspace
  "Archive a workspace. Deletes the isolated schema and tables, but preserves mirrored entities."
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params
   _body-params]
  (ws.api.common/archive-workspace! ws-id))

(api.macros/defendpoint :post "/:ws-id/unarchive" :- Workspace
  "Restore an archived workspace. Recreates the isolated schema and tables."
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params
   _body-params]
  (let [ws (api/check-404 (t2/select-one :model/Workspace :id ws-id))]
    (api/check-400 (= :archived (:base_status ws)) "You cannot unarchive a workspace that is not archived")
    (ws.model/unarchive! ws)
    (-> (t2/select-one :model/Workspace :id ws-id)
        ws.api.common/ws->response)))

(api.macros/defendpoint :delete "/:ws-id" :- [:map [:ok [:= true]]]
  "Delete a workspace and all its contents, including mirrored entities."
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params]
  (let [ws (api/check-404 (t2/select-one :model/Workspace :id ws-id))]
    (api/check-400 (= :archived (:base_status ws)) "You cannot delete a workspace without first archiving it")
    (ws.model/delete! ws)
    {:ok true}))

(api.macros/defendpoint :get "/:ws-id/external/transform" :- [:map [:transforms [:sequential ExternalTransform]]]
  "Get transforms that are external to the workspace, i.e. no matching workspace_transform row exists."
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]
   {:keys [database-id]} :- [:map [:database-id {:optional true} ::ws.t/appdb-id]]]
  (ws.api.common/get-external-transforms ws-id database-id))

(api.macros/defendpoint :post "/:ws-id/run"
  :- [:map
      [:succeeded [:sequential ::ws.t/ref-id]]
      [:failed [:sequential ::ws.t/ref-id]]
      [:not_run [:sequential ::ws.t/ref-id]]]
  "Execute all transforms in the workspace in dependency order.
   Returns which transforms succeeded, failed, and were not run."
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]
   _query-params
   ;; Hmmm, I wonder why this isn't a boolean? T_T
   {:keys [stale_only]} :- [:map [:stale_only {:optional true} ::ws.t/flag]]]
  (ws.api.common/run-workspace! ws-id stale_only))

(api.macros/defendpoint :get "/:ws-id/graph" :- GraphResult
  "Display the dependency graph between the Changeset and the (potentially external) entities that they depend on."
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params]
  (ws.api.common/get-workspace-graph ws-id))

;;; ---------------------------------------- Problems/Validation ----------------------------------------

(api.macros/defendpoint :get "/:ws-id/problem" :- [:sequential ::ws.t/problem]
  "Detect problems in the workspace that would affect downstream transforms after merge.

   Returns a list of problems, each with:
   - category:    the problem category (e.g. 'unused', 'internal-downstream', 'external-downstream')
   - problem:     the specific problem (e.g. 'not-run', 'stale', 'removed-field')
   - severity:    :error, :warning, or :info
   - block-merge: whether this problem prevents merging
   - data:        extra information, shape depends on the problem type

   See `metabase-enterprise.workspaces.types/problem-types` for the full list."
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params]
  (ws.api.common/get-workspace-problems ws-id))

(api.macros/defendpoint :post "/:ws-id/transform/validate/target"
  :- [:map [:status :int] [:body [:or :string i18n/LocalizedString]]]
  "Validate the target table for a workspace transform"
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]
   {:keys [transform-id]} :- [:map [:transform-id {:optional true} ::ws.t/ref-id]]
   {:keys [db_id target]} :- [:map
                              [:db_id {:optional true} ::ws.t/appdb-id]
                              [:target [:map
                                        [:database {:optional true} ::ws.t/appdb-id]
                                        [:type :string]
                                        [:schema [:maybe :string]]
                                        [:name :string]]]]]
  (ws.api.common/validate-target ws-id transform-id db_id target))

(api.macros/defendpoint :post "/:ws-id/transform"
  :- WorkspaceTransform
  "Add another transform to the Changeset. This could be a fork of an existing global transform, or something new."
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]
   _query-params
   body :- [:map #_{:closed true}
            [:name :string]
            [:description {:optional true} [:maybe :string]]
            [:source TransformSource]
            ;; Not sure why this schema is giving trouble
            #_[:target TransformTarget]]]
  (ws.api.common/create-workspace-transform! ws-id body))

(api.macros/defendpoint :get "/:ws-id/transform" :- [:map [:transforms [:sequential WorkspaceTransformListing]]]
  "Get all transforms in a workspace."
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]]
  (ws.api.common/list-transforms ws-id))

(api.macros/defendpoint :get "/:ws-id/transform/:tx-id" :- WorkspaceTransform
  "Get a specific transform in a workspace."
  [{:keys [ws-id tx-id]} :- [:map [:ws-id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]]
  (ws.api.common/fetch-ws-transform ws-id tx-id))

(api.macros/defendpoint :put "/:ws-id/transform/:tx-id" :- WorkspaceTransform
  "Update or create a transform in a workspace.
   If the transform exists, updates it. If it doesn't exist, creates a new transform with the provided ref_id.
   For creation, name, source, and target are required."
  [{:keys [ws-id tx-id]} :- [:map [:ws-id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]
   _query-params
   body :- [:map
            [:name {:optional true} :string]
            [:description {:optional true} [:maybe :string]]
            [:source {:optional true} TransformSource]
            [:target {:optional true} TransformTarget]]]
  (ws.api.common/update-transform! ws-id tx-id body))

(api.macros/defendpoint :post "/:ws-id/transform/:tx-id/archive" :- :nil
  "Mark the given transform to be archived when the workspace is merged.
   For provisional transforms we will skip even creating it in the first place."
  [{:keys [ws-id tx-id]} :- [:map [:ws-id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]]
  (ws.api.common/archive-transform! ws-id tx-id))

(api.macros/defendpoint :post "/:ws-id/transform/:tx-id/unarchive" :- :nil
  "Unmark the given transform for archival. This will recall the last definition it had within the workspace."
  [{:keys [ws-id tx-id]} :- [:map [:ws-id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]]
  (ws.api.common/unarchive-transform! ws-id tx-id))

(api.macros/defendpoint :delete "/:ws-id/transform/:tx-id" :- :nil
  "Discard a transform from the changeset.
   Equivalent to resetting a checked-out transform to its global definition, or deleting a provisional transform."
  [{:keys [ws-id tx-id]} :- [:map [:ws-id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]]
  (ws.api.common/delete-transform! ws-id tx-id))

(api.macros/defendpoint :post "/:ws-id/transform/:tx-id/run"
  :- ::ws.t/execution-result
  "Run a transform in a workspace.

  App DB changes are rolled back. Warehouse DB changes persist.

  When run_stale_ancestors is true, any stale ancestor transforms will be executed first
  in dependency order. If any ancestor fails, execution stops and remaining ancestors
  are marked as not_run. The target transform will not run if any ancestor failed."
  [{:keys [ws-id tx-id]} :- [:map [:ws-id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]
   _query-params
   {:keys [run_stale_ancestors]} :- [:map [:run_stale_ancestors {:optional true} ::ws.t/flag]]]
  (ws.api.common/run-transform! ws-id tx-id run_stale_ancestors))

(api.macros/defendpoint :post "/:ws-id/transform/:tx-id/dry-run"
  :- ::ws.t/query-result
  "Dry-run a transform in a workspace without persisting to the target table.

  Returns the first 2000 rows of transform output for preview purposes.
  Does not update last_run_at or create any database tables.

  When run_stale_ancestors is true, any stale ancestor transforms will be executed first
  in dependency order (these ARE persisted). If any ancestor fails, execution stops and
  the dry-run will not proceed."
  [{:keys [ws-id tx-id]} :- [:map [:ws-id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]
   _query-params
   {:keys [run_stale_ancestors]} :- [:map [:run_stale_ancestors {:optional true} ::ws.t/flag]]]
  (ws.api.common/dry-run-transform! ws-id tx-id run_stale_ancestors))

(api.macros/defendpoint :post "/:ws-id/query"
  :- ::ws.t/query-result
  "Execute an arbitrary SQL query in the workspace's isolated database context.
   Table references are remapped to isolated workspace tables.
   Returns the first 2000 rows of query results."
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]
   _query-params
   {:keys [sql]} :- [:map [:sql [:string {:min 1}]]]]
  (ws.api.common/execute-query! ws-id sql))

;;; ---------------------------------------- Input Grant Endpoints ----------------------------------------

(api.macros/defendpoint :get "/:ws-id/input/pending"
  :- [:map [:inputs [:sequential PendingInput]]]
  "List all input tables that haven't been granted access yet, excluding tables shadowed by workspace outputs."
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]]
  (ws.api.common/get-pending-inputs ws-id))

(api.macros/defendpoint :post "/:ws-id/input/grant"
  :- [:map
      [:already_granted [:sequential [:map [:db_id ms/PositiveInt] [:schema [:maybe :string]] [:table :string]]]]
      [:newly_granted [:sequential [:map [:db_id ms/PositiveInt] [:schema [:maybe :string]] [:table :string]]]]]
  "Grant read access to input tables by table coordinates. Superuser only.
   Idempotent - returns which tables were already granted vs newly granted."
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]
   _query-params
   {:keys [tables]} :- [:map [:tables [:sequential [:map
                                                    [:db_id ms/PositiveInt]
                                                    [:schema [:maybe :string]]
                                                    [:table :string]]]]]]
  (let [workspace (api/check-404 (t2/select-one :model/Workspace ws-id))
        ;; Batch lookup: one query per (db_id, schema) group for efficiency
        input-lookup (into {}
                           (for [[_ group] (group-by (juxt :db_id :schema) tables)
                                 :let [db-id  (:db_id (first group))
                                       schema (:schema (first group))
                                       names  (mapv :table group)]
                                 row (t2/select [:model/WorkspaceInput :id :db_id :schema :table :access_granted]
                                                :workspace_id ws-id
                                                :db_id db-id
                                                :schema schema
                                                :table [:in names])]
                             [[(:db_id row) (:schema row) (:table row)] row]))
        all-inputs (mapv #(get input-lookup [(:db_id %) (:schema %) (:table %)]) tables)]
    (when (some nil? all-inputs)
      (api/check-400 false
                     (str "The following tables do not have corresponding input rows: "
                          (pr-str (keep (fn [[table input]] (when-not input table))
                                        (map vector tables all-inputs))))))
    (let [{already-granted true ungranted false} (group-by :access_granted all-inputs)]
      ;; Grant access to ungranted tables, grouped by db_id
      (when (seq ungranted)
        (doseq [[db-id inputs] (group-by :db_id ungranted)
                :let [database (t2/select-one :model/Database :id db-id)
                      tables   (mapv (fn [{:keys [schema table]}] {:schema schema :name table}) inputs)]]
          (ws.isolation/grant-read-access-to-tables! database workspace tables))
        (t2/update! :model/WorkspaceInput {:id [:in (map :id ungranted)]} {:access_granted true}))
      {:already_granted (mapv #(select-keys % [:db_id :schema :table]) already-granted)
       :newly_granted   (mapv #(select-keys % [:db_id :schema :table]) ungranted)})))

;;; ---------------------------------------- Checkout ----------------------------------------

(def ^:private CheckoutTransformLegacy
  "Legacy format for workspace checkout transforms (DEPRECATED)."
  [:map
   [:id ::ws.t/ref-id]
   [:name :string]
   [:workspace [:map
                [:id ms/PositiveInt]
                [:name :string]]]])

(def ^:private WorkspaceWithCheckout
  "Workspace with checkout status information."
  [:map
   [:id ::ws.t/appdb-id]
   [:name :string]
   [:status WorkspaceStatus]
   [:existing [:maybe [:map
                       [:ref_id ::ws.t/ref-id]
                       [:name :string]]]]])

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case]}
(api.macros/defendpoint :get "/checkout"
  :- [:map
      [:checkout_disabled [:maybe [:enum "mbql" "card-reference" "unknown-type"]]]
      [:workspaces [:sequential WorkspaceWithCheckout]]
      [:transforms [:sequential CheckoutTransformLegacy]]]
  "Get checkout status for a global transform.

   Returns:
   - checkout_disabled: Why this transform cannot be checked out (nil if allowed)
   - workspaces: All workspaces for this transform's database, with checkout status
   - transforms: (DEPRECATED) Use :workspaces instead"
  [_route-params
   {:keys [transform-id]} :- [:map {:closed true} [:transform-id ms/PositiveInt]]]
  (let [transform        (api/check-404
                          (t2/select-one [:model/Transform :id :target_db_id :source_type :source]
                                         :id transform-id))
        db-id            (:target_db_id transform)
        workspaces       (t2/select [:model/Workspace :id :name :base_status :db_status]
                                    :database_id db-id
                                    :base_status [:not= :archived]
                                    {:order-by [[:name :asc]]})
        checkouts        (t2/select [:model/WorkspaceTransform :workspace_id :ref_id :name]
                                    :global_id transform-id)
        ws-id->checkouts (into {} (map (juxt :workspace_id identity) checkouts))
        id->workspace    (into {} (map (juxt :id identity) workspaces))]
    {:checkout_disabled (ws.api.common/checkout-disabled-reason transform)
     :workspaces        (for [{:keys [id name] :as ws} workspaces
                              :let [checkout (get ws-id->checkouts id)]]
                          {:id       id
                           :name     name
                           :status   (ws.model/computed-status ws)
                           :existing (when checkout
                                       {:ref_id (:ref_id checkout)
                                        :name   (:name checkout)})})
     :transforms        (for [{:keys [ref_id name workspace_id]} checkouts
                              :let [ws (get id->workspace workspace_id)]
                              :when ws]
                          {:id        ref_id
                           :name      name
                           :workspace {:id (:id ws) :name (:name ws)}})}))

;;; ---------------------------------------- Merge ----------------------------------------

(api.macros/defendpoint :post "/:ws-id/merge"
  :- [:or
      [:map
       [:merged
        [:map
         [:transforms [:sequential
                       [:map
                        [:op [:enum :create :delete :update :noop]]
                        [:global_id {:optional true} [:maybe ::ws.t/appdb-id]]
                        [:ref_id ::ws.t/ref-id]]]]]]
       [:errors
        [:sequential
         [:map
          [:op [:enum :create :delete :update :noop]]
          [:global_id {:optional true} [:maybe ::ws.t/appdb-id]]
          [:ref_id ::ws.t/ref-id]]]]
       [:workspace [:map [:id ::ws.t/appdb-id] [:name :string]]]]
      ;; error message from check-404 or check-400
      :string]
  "This will:
   1. Update original transforms with workspace versions
   2. Archive the workspace and clean up isolated resources
   Returns a report of merged entities, or error in errors key.

   Request body may include:
   - commit-message: A description of what changes are being merged (optional, will be required in future)"
  [{:keys [ws-id] :as _query-params} :- [:map [:ws-id ::ws.t/appdb-id]]
   _query-params
   {:keys [commit-message]
    :or   {commit-message "Placeholder for merge commit message. Should be required on FE"}} :- [:map
                                                                                                 [:commit-message {:optional true} [:string {:min 1}]]]]
  (let [ws               (u/prog1 (t2/select-one :model/Workspace :id ws-id)
                           (api/check-404 <>)
                           (api/check-400 (not= :archived (:base_status <>)) "Cannot merge an archived workspace"))
        {:keys [merged
                errors]} (-> (ws.merge/merge-workspace! ws api/*current-user-id* commit-message)
                             (update :errors
                                     (partial mapv #(-> %
                                                        (update :error (fn [e] (.getMessage ^Throwable e)))
                                                        (set/rename-keys {:error :message})))))]
    (u/prog1
      {:merged    merged
       :errors    errors
       :workspace {:id ws-id, :name (:name ws)}}
      (when-not (seq errors)
        (ws.model/archive! ws)))))

(api.macros/defendpoint :post "/:ws-id/transform/:tx-id/merge"
  :- [:map
      [:op [:enum :create :delete :update :noop]]
      [:global_id [:maybe ::ws.t/appdb-id]]
      [:ref_id ::ws.t/ref-id]
      [:message {:optional true} :string]]
  "Merge single transform from workspace back to the core. If workspace transform is archived
  the corresponding core transform is deleted.

   Request body may include:
   - commit-message: A description of what changes are being merged (optional, will be required in future)"
  [{:keys [ws-id tx-id] :as _query-params} :- [:map
                                               [:ws-id ::ws.t/appdb-id]
                                               [:tx-id ::ws.t/ref-id]]
   _query-params
   {:keys [commit-message]
    :or   {commit-message "Placeholder for merge commit message. Should be required on FE"}} :- [:map
                                                                                                 [:commit-message {:optional true} [:string {:min 1}]]]]
  (let [ws              (api/check-404 (t2/select-one [:model/Workspace :id :name] :id ws-id))
        ws-transform    (api/check-404 (t2/select-one :model/WorkspaceTransform :workspace_id ws-id :ref_id tx-id))
        ws-merge-id     (t2/insert-returning-pk!
                         :model/WorkspaceMerge
                         {:workspace_id   (:id ws)
                          :workspace_name (:name ws)
                          :commit_message commit-message
                          :creator_id     api/*current-user-id*})
        {:keys [error] :as result} (ws.merge/merge-transform! {:ws-transform       ws-transform
                                                               :workspace          ws
                                                               :workspace-merge-id ws-merge-id
                                                               :merging-user-id    api/*current-user-id*
                                                               :commit-message     commit-message})]
    (if error
      (throw (ex-info "Failed to merge transform."
                      (-> result
                          (dissoc :error)
                          (assoc :status-code 500))
                      error))
      result)))

;;; ---------------------------------------- Test Resources ----------------------------------------

(defn- shorthand-ref?
  "Check if string matches shorthand pattern like x1, t1, x23, etc."
  [s]
  (and (string? s) (boolean (re-matches #"[xt]\d+" s))))

(defn- parse-magic-references
  "Recursively walk data structure converting shorthand refs to keywords."
  [x]
  (walk/postwalk
   (fn [v]
     (if (shorthand-ref? v)
       (keyword v)
       v))
   x))

(when (or config/is-dev? config/is-test?)
  (mr/def ::dependency-graph
    "Map of shorthand symbols to lists of dependencies. The latter are all strings, and refs need to be detected."
    [:map-of :keyword [:sequential :string]])

  (mr/def ::test-resources-request
    "Request body for creating test resources."
    [:map
     [:database_id {:optional true} ::ws.t/appdb-id]
     [:global {:optional true} ::dependency-graph]
     [:workspace {:optional true} [:map
                                   [:name {:optional true} :string]
                                   [:checkouts {:optional true} [:sequential :keyword]]
                                   [:definitions {:optional true} ::dependency-graph]]]])

  (mr/def ::test-resources-response
    "Response from creating test resources."
    [:map
     [:workspace-id [:maybe :int]]
     [:global-map [:map-of [:or :keyword :string] :int]]
     [:workspace-map [:map-of :keyword :string]]])

  (api.macros/defendpoint :post "/test-resources" :- ::test-resources-response
    "Create test resources for workspace e2e tests. Only available in dev/test mode.

     Optionally accepts a database_id in the body; if not provided it will try to use the sample database."
    [_route-params
     _query-params
     {db-id :database_id :as body} :- ::test-resources-request]
    (if-let [create-fn (requiring-resolve 'metabase-enterprise.workspaces.test-util/create-resources!)]
      (create-fn (-> body
                     (dissoc :database_id)
                     (cond-> db-id (assoc :database-id db-id))
                     parse-magic-references))
      (throw (ex-info "Workspace test utilities not available" {:status-code 501})))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace/` routes."
  (api.macros/ns-handler *ns* api/+check-superuser +auth))
