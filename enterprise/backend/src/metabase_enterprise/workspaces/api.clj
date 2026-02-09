(ns metabase-enterprise.workspaces.api
  "`/api/ee/workspace/` routes"
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase-enterprise.workspaces.merge :as ws.merge]
   [metabase-enterprise.workspaces.models.workspace :as ws.model]
   [metabase-enterprise.workspaces.models.workspace-input-external]
   [metabase-enterprise.workspaces.models.workspace-log]
   [metabase-enterprise.workspaces.models.workspace-output-external]
   [metabase-enterprise.workspaces.types :as ws.t]
   [metabase-enterprise.workspaces.validation :as ws.validation]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :as routes.common :refer [+auth]]
   [metabase.config.core :as config]
   [metabase.database-routing.core :as database-routing]
   ^{:clj-kondo/ignore [:metabase/modules]}
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.queries.schema :as queries.schema]
   [metabase.request.core :as request]
   [metabase.transforms.core :as transforms]
   [metabase.transforms.feature-gating :as transforms.gating]
   [metabase.transforms.util :as transforms.util]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [deferred-tru tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private log-limit "Maximum number of recent workspace log items to show" 20)

(defn- flag-enabled?
  "Coerce a flag parameter (true, false, or 1) to boolean."
  [v]
  (boolean (#{1 true} v)))

(mr/def ::appdb-or-ref-id [:or ::ws.t/appdb-id ::ws.t/ref-id])

(def ^:private computed-statuses
  "All possible values returned by computed-status (computed from base_status, etc.)"
  #{:uninitialized :pending :ready :broken :archived})

(mr/def ::status (into [:enum] computed-statuses))

(def ^:private Workspace
  [:map
   [:id ::ws.t/appdb-id]
   [:name :string]
   [:collection_id ::ws.t/appdb-id]
   [:database_id ::ws.t/appdb-id]
   [:status ::status]
   [:created_at ms/TemporalInstant]
   [:updated_at ms/TemporalInstant]])

;; Transform-related schemas (adapted from transforms/api.clj)
;; TODO (Chris 2026-02-02) -- We should reuse these schemas, by exposing common types from the transforms module. They *can* match exactly.

(mr/def ::transform-source
  [:multi {:dispatch (comp keyword :type)}
   [:query
    [:map
     [:type [:= "query"]]
     [:query ::queries.schema/query]]]
   [:python
    [:map {:closed true}
     [:source-database {:optional true} :int]
     [:source-tables   [:map-of [:string {:min 1}] :int]]
     [:type [:= "python"]]
     [:body :string]]]])

(mr/def ::transform-target
  [:map {:closed true}
   [:database {:optional true} ::ws.t/appdb-id]
   [:type [:enum "table"]]
   [:schema {:optional true} [:maybe [:string {:min 1}]]]
   [:name [:string {:min 1}]]])

(mr/def ::run-trigger
  [:enum "none" "global-schedule"])

(defn- check-transforms-enabled!
  [db-id]
  (let [database (api/check-400 (t2/select-one :model/Database db-id)
                                (deferred-tru "The target database cannot be found."))]
    (api/check (transforms.gating/any-transforms-enabled?)
               [402 (deferred-tru "Premium features required for transforms are not enabled.")])
    (api/check-400 (not (:is_sample database))
                   (deferred-tru "Cannot run transforms on the sample database."))
    (api/check-400 (not (:is_audit database))
                   (deferred-tru "Cannot run transforms on audit databases."))
    (api/check-400 (driver.u/supports? (:engine database) :transforms/table database)
                   (deferred-tru "The database does not support the requested transform target type."))
    (api/check-400 (not (database-routing/db-routing-enabled? database))
                   (deferred-tru "Transforms are not supported on databases with DB routing enabled."))))

(def ^:private ws-prefix "/api/ee/workspace/\\d+")

(defn- ws-pattern
  "Compile a regex matching the workspace API prefix followed by `suffix`."
  ^java.util.regex.Pattern [suffix]
  (re-pattern (str ws-prefix suffix)))

;; Service users may read workspace state and manage transforms within their workspace.
;; All other routes relate to the lifecycle of the workspace itself, and require superuser — including:
;;   GET/POST  /                              (list/create workspaces)
;;   GET       /enabled, /database, /checkout (cross-workspace state)
;;   PUT       /:ws-id                        (reconfigure workspace)
;;   POST      /:ws-id/archive                (archive workspace)
;;   POST      /:ws-id/unarchive              (unarchive workspace)
;;   DELETE    /:ws-id                        (delete workspace)
;;   POST      /:ws-id/merge                  (merge workspace)
;;   POST      /:ws-id/transform/:tx-id/merge (merge single transform)
;;   POST      /test-resources                (create test resources - available in non-prod environments only)
(def ^:private service-user-patterns
  "URI patterns that workspace service users may access.
   New routes default to admin-only for safety."
  (update-vals
   {;; Read workspace state
    :get    ["$"
             "/table$"
             "/log$"
             "/graph$"
             "/problem$"
             "/external/transform$"
             "/transform$"
             "/transform/[^/]+$"]
    ;; Manage & run transforms
    :post   ["/transform$"
             "/transform/[^/]+/archive$"
             "/transform/[^/]+/unarchive$"
             "/transform/validate/target$"
             "/run$"
             "/transform/[^/]+/run$"
             "/transform/[^/]+/dry-run$"]
    :put    ["/transform/[^/]+$"]
    :delete ["/transform/[^/]+$"]}
   (partial mapv ws-pattern)))

(defn- service-user-allowed?
  "True if this request can be made by a workspace's service user."
  [{:keys [uri request-method]}]
  (when-let [patterns (get service-user-patterns request-method)]
    (some #(re-matches % uri) patterns)))

(defn- owns-workspace?
  "True if the current user is the service user for the workspace in this request's URI."
  [uri]
  (when-let [[_ ws-id-str] (re-find #"/api/ee/workspace/(\d+)" uri)]
    (let [ws-id   (parse-long ws-id-str)
          user-id api/*current-user-id*]
      (and user-id (t2/exists? :model/Workspace :id ws-id :execution_user user-id)))))

(defn- authorize*
  "Authorization middleware for workspace routes.

   Access rules:
   - Service user routes: superuser OR the workspace's own service user
   - All other routes: superuser required (default)"
  [handler]
  (fn [request respond raise]
    (if (service-user-allowed? request)
      (api/check-403 (or api/*is-superuser?* (owns-workspace? (:uri request))))
      (api/check-superuser))
    (handler request respond raise)))

(def ^:private +authorize
  (routes.common/wrap-middleware-for-open-api-spec-generation authorize*))

(defn- ws->response
  "Transform a workspace record into an API response, computing the backwards-compatible status."
  [ws]
  (-> ws
      (select-keys [:id :name :collection_id :database_id :created_at :updated_at])
      (assoc :status (ws.model/computed-status ws))))

;;; routes

(def ^:private WorkspaceListing
  [:map {:closed true}
   [:id ::ws.t/appdb-id]
   [:database_id ::ws.t/appdb-id]
   [:name :string]
   [:status ::status]
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

(mr/def ::input-table
  [:map
   ;; Future-proof with cross-db Python transforms
   [:db_id ::ws.t/appdb-id]
   [:schema [:maybe :string]]
   [:table :string]
   [:table_id [:maybe ::ws.t/appdb-id]]])

(mr/def ::output-table
  [:map
   ;; Future-proof with multi-db Workspaces, plus necessary to resolve table references when id is null.
   [:db_id ::ws.t/appdb-id]
   [:global [:map
             ;; transform_id is nil for workspace outputs, int for external outputs
             [:transform_id [:maybe ::ws.t/appdb-id]]
             [:schema [:maybe :string]]
             [:table :string]
             [:table_id [:maybe ::ws.t/appdb-id]]]]
   [:isolated [:map
               ;; transform_id is ref_id (string) for workspace outputs, int for external outputs
               [:transform_id [:or ::ws.t/ref-id ::ws.t/appdb-id]]
               [:schema :string]
               [:table :string]
               [:table_id [:maybe ::ws.t/appdb-id]]]]])

(api.macros/defendpoint :get "/:ws-id/table"
  :- [:map {:closed true}
      [:inputs [:sequential ::input-table]]
      [:outputs [:sequential ::output-table]]]
  "Get workspace tables"
  {:access :workspace}
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params]
  (let [workspace        (api/check-404 (t2/select-one :model/Workspace :id ws-id))
        ;; Trigger creation of the Workspace*External entries
        _                (ws.impl/get-or-calculate-graph! workspace)
        order-by         {:order-by [:db_id :global_schema :global_table]}
        outputs          (t2/select [:model/WorkspaceOutput
                                     :db_id :global_schema :global_table :global_table_id
                                     :isolated_schema :isolated_table :isolated_table_id :ref_id]
                                    :workspace_id ws-id order-by)
        external-outputs (t2/select [:model/WorkspaceOutputExternal
                                     :db_id :global_schema :global_table :global_table_id
                                     :isolated_schema :isolated_table :isolated_table_id :transform_id]
                                    :workspace_id ws-id order-by)
        all-outputs      (concat outputs external-outputs)
        raw-inputs       (distinct
                          (t2/select [:model/WorkspaceInput :db_id :schema :table :table_id]
                                     :workspace_id ws-id {:order-by [:db_id :schema :table]}))
        external-inputs  (distinct
                          (t2/select [:model/WorkspaceInputExternal :db_id :schema :table :table_id]
                                     :workspace_id ws-id {:order-by [:db_id :schema :table]}))
        all-raw-inputs   (concat raw-inputs external-inputs)
        ;; Some of our inputs may be shadowed by the outputs of other transforms. We only want external inputs.
        shadowed?        (into #{} (map (juxt :db_id :global_schema :global_table)) all-outputs)
        inputs           (remove (comp shadowed? (juxt :db_id :schema :table)) all-raw-inputs)
        ;; Build a map of [d s t] => id for every table that has been synced since the output row was written.
        fallback-map     (merge
                          (ws.impl/table-ids-fallbacks :global_schema :global_table :global_table_id all-outputs)
                          (ws.impl/table-ids-fallbacks :isolated_schema :isolated_table :isolated_table_id all-outputs))]
    {:inputs  (sort-by (juxt :db_id :schema :table) inputs)
     :outputs (sort-by
               (juxt :db_id (comp (juxt :schema :table) :global))
               (concat
                ;; Workspace transform outputs
                (for [{:keys [ref_id db_id global_schema global_table global_table_id
                              isolated_schema isolated_table isolated_table_id]} outputs]
                  {:db_id    db_id
                   :global   {:transform_id nil
                              :schema       global_schema
                              :table        global_table
                              :table_id     (or global_table_id (get fallback-map [db_id global_schema global_table]))}
                   :isolated {:transform_id ref_id
                              :schema       isolated_schema
                              :table        isolated_table
                              :table_id     (or isolated_table_id (get fallback-map [db_id isolated_schema isolated_table]))}})
                ;; External transform outputs
                (for [{:keys [transform_id db_id global_schema global_table global_table_id
                              isolated_schema isolated_table isolated_table_id]} external-outputs]
                  {:db_id    db_id
                   :global   {:transform_id transform_id
                              :schema       global_schema
                              :table        global_table
                              :table_id     (or global_table_id (get fallback-map [db_id global_schema global_table]))}
                   :isolated {:transform_id transform_id
                              :schema       isolated_schema
                              :table        isolated_table
                              :table_id     (or isolated_table_id (get fallback-map [db_id isolated_schema isolated_table]))}})))}))

(api.macros/defendpoint :get "/:ws-id" :- Workspace
  "Get a single workspace by ID"
  {:access :workspace}
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params]
  (-> (t2/select-one :model/Workspace :id ws-id) api/check-404 ws->response))

(api.macros/defendpoint :get "/:ws-id/log"
  :- [:map
      [:workspace_id ms/PositiveInt]
      [:status ::status]
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
  {:access :workspace}
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params]
  (let [workspace (api/check-404 (t2/select-one :model/Workspace :id ws-id))
        logs      (t2/select [:model/WorkspaceLog
                              :id :task :started_at :completed_at :status :message
                              :updated_at]
                             :workspace_id ws-id
                             {:order-by [[:started_at :desc]]
                              :limit    log-limit})]
    {:workspace_id      ws-id
     :status            (ws.model/computed-status workspace)
     :logs              logs
     :updated_at        (->> (map :updated_at logs) sort reverse first)
     :last_completed_at (->> (seq (keep :completed_at logs)) sort reverse first)}))

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
    (check-transforms-enabled! database_id))

  ;; If no database_id provided, use first supported DB as provisional default (uninitialized workspace)
  (let [provisional? (not database_id)
        database-id  (or database_id
                         (api/check-400 (first-supported-database-id)
                                        (tru "No supported databases configured. Please add a database that supports workspaces.")))]
    (ws->response (ws.common/create-workspace! api/*current-user-id*
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
                                      (check-transforms-enabled! database_id))
                                    (assoc :database_id database_id))
                    name        (assoc :name name))]
    (ws->response
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
  (let [ws (api/check-404 (t2/select-one :model/Workspace :id ws-id))]
    (api/check-400 (not= :archived (:base_status ws)) "You cannot archive an archived workspace")
    (ws.model/archive! ws)
    (-> (t2/select-one :model/Workspace :id ws-id)
        ws->response)))

(api.macros/defendpoint :post "/:ws-id/unarchive" :- Workspace
  "Restore an archived workspace. Recreates the isolated schema and tables."
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params
   _body-params]
  (let [ws (api/check-404 (t2/select-one :model/Workspace :id ws-id))]
    (api/check-400 (= :archived (:base_status ws)) "You cannot unarchive a workspace that is not archived")
    (ws.model/unarchive! ws)
    (-> (t2/select-one :model/Workspace :id ws-id)
        ws->response)))

(api.macros/defendpoint :delete "/:ws-id" :- [:map [:ok [:= true]]]
  "Delete a workspace and all its contents, including mirrored entities."
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params]
  (let [ws (api/check-404 (t2/select-one :model/Workspace :id ws-id))]
    (api/check-400 (= :archived (:base_status ws)) "You cannot delete a workspace without first archiving it")
    (ws.model/delete! ws)
    {:ok true}))

(defn- checkout-disabled-reason
  "Returns reason why a transform cannot be checked out, or nil if checkout is allowed."
  [{:keys [source_type source]}]
  (case source_type
    :mbql   "mbql"
    :native (when (seq (lib/template-tags-referenced-cards (:query source)))
              "card-reference")
    :python nil
    "unknown-type"))

(def ^:private ExternalTransform
  ;; Might be interesting to show whether they're enclosed, once we have the graph.
  ;; When they're enclosed, it could also be interesting to know whether they're stale.
  [:map
   [:id ::ws.t/appdb-id]
   [:name :string]
   [:source_type :keyword]
   [:checkout_disabled [:maybe :string]]])

(api.macros/defendpoint :get "/:ws-id/external/transform" :- [:map [:transforms [:sequential ExternalTransform]]]
  "Get transforms that are external to the workspace, i.e. no matching workspace_transform row exists."
  {:access :workspace}
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]
   {:keys [database-id]} :- [:map [:database-id {:optional true} ::ws.t/appdb-id]]]
  (let [db-id      (or database-id
                       (:database_id (api/check-404 (t2/select-one [:model/Workspace :database_id] ws-id))))
        transforms (t2/select [:model/Transform :id :name :source_type :source]
                              {:left-join [[:workspace_transform :wt]
                                           [:and
                                            [:= :transform.id :wt.global_id]
                                            [:= :wt.workspace_id ws-id]]]
                               ;; NULL workspace_id means transform is not checked out into this workspace
                               :where     [:and
                                           [:= nil :wt.workspace_id]
                                           [:= :target_db_id db-id]]
                               :order-by  [[:id :asc]]})]
    {:transforms
     (into []
           (map #(-> %
                     (dissoc :source)
                     (assoc :checkout_disabled (checkout-disabled-reason %))))
           transforms)}))

(api.macros/defendpoint :post "/:ws-id/run"
  :- [:map
      [:succeeded [:sequential ::ws.t/ref-id]]
      [:failed [:sequential ::ws.t/ref-id]]
      [:not_run [:sequential ::ws.t/ref-id]]]
  "Execute all transforms in the workspace in dependency order.
   Returns which transforms succeeded, failed, and were not run."
  {:access :workspace}
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]
   _query-params
   ;; Hmmm, I wonder why this isn't a boolean? T_T
   {:keys [stale_only]} :- [:map [:stale_only {:optional true} ::ws.t/flag]]]
  (let [workspace (t2/select-one :model/Workspace :id ws-id)
        _         (api/check-404 workspace)
        _         (api/check-400 (not= :archived (:base_status workspace)) "Cannot execute archived workspace")
        graph     (ws.impl/get-or-calculate-graph! workspace)]
    (ws.impl/execute-workspace! workspace graph {:stale-only? (flag-enabled? stale_only)})))

(mr/def ::graph-node-type [:enum :input-table :external-transform :workspace-transform])

(mr/def ::graph-node
  [:map
   [:id ::appdb-or-ref-id]
   [:type [:enum :input-table :external-transform :workspace-transform]]
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

(defn- node-type [node]
  (let [nt (:node-type node)]
    (case nt
      :table :input-table
      nt)))

(defn- node-id [{:keys [node-type id]}]
  (case node-type
    :workspace-transform id
    :external-transform id
    :table (str (:db id) "-" (:schema id) "-" (:table id))))

(defn- table-ids-by-target
  "Batch lookup table IDs for transform targets.
   Returns {[db_id normalized_schema normalized_name] -> table-record}.
   Schema and table names are normalized per database driver to match how tables are stored in metabase_table."
  [db-id driver transforms]
  (when (seq transforms)
    (let [table-keys     (into #{}
                               (keep (fn [{:keys [target]}]
                                       (when (:database target)
                                         [db-id
                                          (sql.normalize/normalize-name driver (:schema target))
                                          (sql.normalize/normalize-name driver (:name target))])))
                               transforms)
          with-schema    (filter second table-keys)
          without-schema (keep (fn [[db-id schema table-name]]
                                 (when-not schema [db-id table-name]))
                               table-keys)]
      (when (or (seq with-schema) (seq without-schema))
        (let [tables (t2/select [:model/Table :id :db_id :schema :name]
                                {:where [:or
                                         (when (seq with-schema)
                                           [:in [:composite :db_id :schema :name] with-schema])
                                         (when (seq without-schema)
                                           [:and
                                            [:= :schema nil]
                                            [:in [:composite :db_id :name] without-schema]])]})]
          (m/index-by (juxt :db_id :schema :name) tables))))))

(defn- target->spec [driver table-id-map {:keys [target] :as tx}]
  (let [table-key [(:database target)
                   (sql.normalize/normalize-name driver (:schema target))
                   (sql.normalize/normalize-name driver (:name target))]
        table-id  (:id (get table-id-map table-key))]
    (assoc tx :target {:db       (:database target)
                       :schema   (:schema target)
                       :table    (:name target)
                       :table_id table-id})))

(defn- fetch-transforms-for-graph
  "Batch fetch all transforms needed for the graph. Returns {:external {id -> tx}, :workspace {ref_id -> tx}}."
  [ws-id entities]
  (let [external-ids (into [] (keep #(when (= :external-transform (:node-type %)) (:id %))) entities)
        ref-ids (into [] (keep #(when (= :workspace-transform (:node-type %)) (:id %))) entities)
        external-txs (when (seq external-ids)
                       (m/index-by :id (t2/select [:model/Transform :id :name :target] :id [:in external-ids])))
        workspace-txs (when (seq ref-ids)
                        (m/index-by :ref_id (t2/select [:model/WorkspaceTransform :ref_id :name :target]
                                                       :workspace_id ws-id :ref_id [:in ref-ids])))]
    {:external external-txs
     :workspace workspace-txs}))

(defn- node-data [driver transforms-map table-id-map {:keys [node-type id]}]
  (case node-type
    :table id
    :external-transform (some->> (get-in transforms-map [:external id])
                                 (target->spec driver table-id-map))
    :workspace-transform (some->> (get-in transforms-map [:workspace id])
                                  (target->spec driver table-id-map))))

(api.macros/defendpoint :get "/:ws-id/graph" :- GraphResult
  "Display the dependency graph between the Changeset and the (potentially external) entities that they depend on."
  {:access :workspace}
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params]
  (let [workspace      (api/check-404 (t2/select-one :model/Workspace :id ws-id))
        db-id          (:database_id workspace)
        driver         (t2/select-one-fn :engine [:model/Database :engine] :id db-id)
        {:keys [inputs entities dependencies]} (ws.impl/get-or-calculate-graph! workspace)
        ;; Batch fetch all transforms and build table-id lookup map
        transforms-map (fetch-transforms-for-graph ws-id entities)
        all-transforms (concat (vals (:external transforms-map))
                               (vals (:workspace transforms-map)))
        table-id-map   (table-ids-by-target db-id driver all-transforms)
        ;; We may want to cache this inverted graph in the database JSON to avoid recalculating it each time.
        inverted       (reduce
                        (fn [inv [c parents]]
                          (reduce (fn [inv p] (update inv p (fnil conj #{}) c)) inv parents))
                        {}
                        dependencies)
        dep-count      #(frequencies (map node-type (get inverted %)))]

    {:nodes (concat (for [i inputs]
                      {:type             :input-table
                       ;; Use an id that's independent of whether the table exists yet.
                       :id               (node-id {:id i, :node-type :table})
                       :data             i
                       :dependents_count (dep-count {:node-type :table, :id i})})
                    (for [e entities]
                      {:type             (node-type e)
                       :id               (:id e)
                       :data             (node-data driver transforms-map table-id-map e)
                       :dependents_count (dep-count e)}))
     :edges (for [[child parents] dependencies, parent parents]
              {:to_entity_type   (name (node-type parent))
               :to_entity_id     (node-id parent)
               :from_entity_type (name (node-type child))
               :from_entity_id   (node-id child)})}))

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
  {:access :workspace}
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params]
  (let [workspace (api/check-404 (t2/select-one :model/Workspace :id ws-id))
        graph     (ws.impl/get-or-calculate-graph! workspace)]
    (ws.validation/find-downstream-problems ws-id graph)))

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

(api.macros/defendpoint :post "/:ws-id/transform/validate/target"
  :- [:map [:status :int] [:body [:or :string i18n/LocalizedString]]]
  "Validate the target table for a workspace transform"
  {:access :workspace}
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]
   {:keys [transform-id]} :- [:map [:transform-id {:optional true} ::ws.t/ref-id]]
   {:keys [db_id target]} :- [:map
                              [:db_id {:optional true} ::ws.t/appdb-id]
                              [:target [:map
                                        [:database {:optional true} ::ws.t/appdb-id]
                                        [:type :string]
                                        [:schema [:maybe :string]]
                                        [:name :string]]]]]
  (let [workspace (api/check-404 (t2/select-one [:model/Workspace :database_id :db_status] ws-id))
        target    (update target :database #(or % db_id))
        tx-id     (when transform-id (parse-long transform-id))
        ;; For uninitialized workspaces we skip over checks for their db id
        ws-db-id  (when (not= :uninitialized (:db_status workspace)) (:database_id workspace))]
    (cond
      (not= "table" (:type target))
      {:status 403 :body (deferred-tru "Unsupported target type")}

      (and db_id ws-db-id (not= db_id ws-db-id))
      {:status 403 :body (deferred-tru "Must target the workspace database")}

      (not (or db_id ws-db-id))
      {:status 403 :body (deferred-tru "Must target a database")}

      (when-let [schema (:schema target)] (str/starts-with? schema "mb__isolation_"))
      {:status 403 :body (deferred-tru "Must not target an isolated workspace schema")}

      ;; Within a workspace, we defer blocking on conflicts outside the workspace
      #_{:status 403 :body (deferred-tru "A table with that name already exists.")}

      ;; Consider deferring this validation until merge also.
      (internal-target-conflict? ws-id target tx-id)
      {:status 403 :body (deferred-tru "Another transform in this workspace already targets that table")}

      :else
      {:status 200 :body "OK"})))

(defn- malli-map-keys [schema]
  (into [] (map first) (rest schema)))

(defn- select-malli-keys
  "Like select-keys, but with the arguments reversed, and taking the malli schema for the output map.
   Nothing smart - for example, it doesn't understand optional verus maybe."
  ([schema m]
   (select-keys m (malli-map-keys schema)))
  ([schema alias-map m]
   (merge (select-malli-keys schema m)
          (u/for-map [[to from] alias-map] [to (from m)]))))

(defn- select-model-malli-keys
  "Build the model-fields vector for a t2/select from a malli schema for the output row(s)"
  ([model schema]
   (into [model] (malli-map-keys schema)))
  ([model schema alias-map]
   (into [model]
         (map (fn [to] (if-let [from (to alias-map)] [from to] to)))
         (malli-map-keys schema))))

(def ^:private WorkspaceTransform
  [:map
   [:ref_id ::ws.t/ref-id]
   [:global_id [:maybe ::ws.t/appdb-id]]
   [:name :string]
   [:description [:maybe :string]]
   [:source :map]
   [:target :map]
   ;; Not yet calculated, see https://linear.app/metabase/issue/BOT-684/mark-stale-transforms-workspace-only
   [:target_stale [:maybe :boolean]]
   [:workspace_id ::ws.t/appdb-id]
   [:creator_id [:maybe ::ws.t/appdb-id]]
   [:archived_at :any]
   [:created_at :any]
   [:updated_at :any]
   [:last_run_at :any]
   [:last_run_status [:maybe :string]]
   [:last_run_message [:maybe :string]]])

(def ^:private workspace-transform-alias {:target_stale :definition_changed})

(defn- attach-isolated-target [{:keys [workspace_id ref_id] :as ws-transform}]
  (let [{:keys [db_id isolated_schema isolated_table]}
        (t2/select-one :model/WorkspaceOutput :workspace_id workspace_id :ref_id ref_id)]
    (assoc ws-transform :target_isolated {:type     "table"
                                          :database db_id
                                          :schema   isolated_schema
                                          :name     isolated_table})))

(api.macros/defendpoint :post "/:ws-id/transform"
  :- WorkspaceTransform
  "Add another transform to the Changeset. This could be a fork of an existing global transform, or something new."
  {:access :workspace}
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]
   _query-params
   body :- [:map #_{:closed true}
            [:name :string]
            [:description {:optional true} [:maybe :string]]
            [:source ::transform-source]
            ;; Not sure why this schema is giving trouble
            #_[:target ::transform-target]]]
  (api/check (transforms.util/check-feature-enabled body)
             [402 (deferred-tru "Premium features required for this transform type are not enabled.")])
  (t2/with-transaction [_tx]
    (let [workspace (u/prog1 (api/check-404 (t2/select-one :model/Workspace :id ws-id))
                      (api/check-400 (not= :archived (:base_status <>)) "Cannot create transforms in an archived workspace"))
          ;; TODO (Chris 2026-02-02) -- We use 400 here, but 403 in the validation route. Consistency would be nice.
          _         (api/check-400 (not (internal-target-conflict? ws-id (:target body)))
                                   (deferred-tru "Another transform in this workspace already targets that table"))
          global-id (:global_id body (:id body))
          ;; Verify transform source is allowed in workspaces (not MBQL, no card references, etc.)
          _         (let [source-type (transforms/transform-source-type (:source body))
                          reason      (checkout-disabled-reason {:source_type source-type :source (:source body)})]
                      (api/check-400 (nil? reason)
                                     (case reason
                                       "mbql"           (deferred-tru "MBQL transforms cannot be added to workspaces.")
                                       "card-reference" (deferred-tru "Transforms that reference other questions cannot be added to workspaces.")
                                       (deferred-tru "This transform cannot be added to a workspace: {0}." reason))))
          ;; For uninitialized workspaces, preserve the target database from the request body
          ;; (add-to-changeset! will reinitialize the workspace with it if different from provisional)
          ;; For initialized workspaces, ensure the target database matches the workspace database
          body      (-> body (dissoc :global_id)
                        (cond-> (not= :uninitialized (:db_status workspace))
                          (update :target assoc :database (:database_id workspace))))
          transform (ws.common/add-to-changeset! api/*current-user-id* workspace :transform global-id body)]
      (attach-isolated-target (select-malli-keys WorkspaceTransform workspace-transform-alias transform)))))

;; TODO (Sanya 2025-12-12) -- Confirm precisely which fields are needed by the FE
(def ^:private WorkspaceTransformListing
  "Schema for a transform in a workspace"
  [:map {:closed true}
   [:ref_id ::ws.t/ref-id]
   [:global_id [:maybe ::ws.t/appdb-id]]
   [:name :string]
   [:source_type [:maybe :keyword]]
   [:creator_id [:maybe ::ws.t/appdb-id]]
   ;[:last_run :map]
   ; See https://metaboat.slack.com/archives/C099RKNLP6U/p1765205882655869?thread_ts=1765205222.888209&cid=C099RKNLP6U
   #_[:target_stale :boolean]])

;; Global transforms precalculate these in a toucan hook - maybe we should do that too? Let's review later.
(defn- map-source-type [ws-tx]
  (-> ws-tx
      (assoc :source_type (transforms/transform-source-type (:source ws-tx)))
      (dissoc :source)))

(api.macros/defendpoint :get "/:ws-id/transform" :- [:map [:transforms [:sequential WorkspaceTransformListing]]]
  "Get all transforms in a workspace."
  {:access :workspace}
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]]
  (api/check-404 (t2/select-one :model/Workspace :id ws-id))
  {:transforms (->> (t2/select [:model/WorkspaceTransform :ref_id :global_id :name :source :creator_id]
                               :workspace_id ws-id {:order-by [:created_at]})
                    (map map-source-type))})

(defn- fetch-ws-transform [ws-id tx-id]
  (-> (select-model-malli-keys :model/WorkspaceTransform WorkspaceTransform workspace-transform-alias)
      (t2/select-one :ref_id tx-id :workspace_id ws-id)
      api/check-404
      attach-isolated-target))

(api.macros/defendpoint :get "/:ws-id/transform/:tx-id" :- WorkspaceTransform
  "Get a specific transform in a workspace."
  {:access :workspace}
  [{:keys [ws-id tx-id]} :- [:map [:ws-id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]]
  (fetch-ws-transform ws-id tx-id))

(api.macros/defendpoint :put "/:ws-id/transform/:tx-id" :- WorkspaceTransform
  "Update a transform in a workspace."
  {:access :workspace}
  [{:keys [ws-id tx-id]} :- [:map [:ws-id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]
   _query-params
   body :- [:map
            [:name {:optional true} :string]
            [:description {:optional true} [:maybe :string]]
            [:source {:optional true} ::transform-source]
            [:target {:optional true} ::transform-target]]]
  (t2/with-transaction [_tx]
    (api/check-404 (t2/select-one :model/WorkspaceTransform :ref_id tx-id :workspace_id ws-id))
    (let [source-or-target-changed? (or (:source body) (:target body))]
      (t2/update! :model/WorkspaceTransform {:workspace_id ws-id :ref_id tx-id} body)
      ;; If source or target changed, increment versions for re-analysis
      (when source-or-target-changed?
        (ws.impl/increment-analysis-version! ws-id tx-id)
        ;; It's unfortunate that we are using an extra SQL statement for this, rather than doing it in the earlier
        ;; statement that set the [[body]]. Combining them would be tricky, as we still need the model transforms to
        ;; serialize the fields in the body, but the increment requires using an SQL expression.
        (ws.impl/increment-graph-version! ws-id)))
    (fetch-ws-transform ws-id tx-id)))

(api.macros/defendpoint :post "/:ws-id/transform/:tx-id/archive" :- :nil
  "Mark the given transform to be archived when the workspace is merged.
   For provisional transforms we will skip even creating it in the first place."
  {:access :workspace}
  [{:keys [ws-id tx-id]} :- [:map [:ws-id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]]
  (api/check-404 (pos? (t2/update! :model/WorkspaceTransform
                                   {:ref_id tx-id :workspace_id ws-id}
                                   {:archived_at [:now]})))
  ;; Increment graph version since transform is leaving the graph
  (ws.impl/increment-graph-version! ws-id)
  nil)

(api.macros/defendpoint :post "/:ws-id/transform/:tx-id/unarchive" :- :nil
  "Unmark the given transform for archival. This will recall the last definition it had within the workspace."
  {:access :workspace}
  [{:keys [ws-id tx-id]} :- [:map [:ws-id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]]
  (api/check-404 (pos? (t2/update! :model/WorkspaceTransform
                                   {:ref_id tx-id :workspace_id ws-id}
                                   {:archived_at nil})))
  ;; Increment both versions - transform re-enters graph and needs re-analysis
  (ws.impl/increment-analysis-version! ws-id tx-id)
  ;; We could merge this with the initial WorkspaceTransform update to save a statement, but it adds complexity.
  (ws.impl/increment-graph-version! ws-id)
  nil)

(api.macros/defendpoint :delete "/:ws-id/transform/:tx-id" :- :nil
  "Discard a transform from the changeset.
   Equivalent to resetting a checked-out transform to its global definition, or deleting a provisional transform."
  {:access :workspace}
  [{:keys [ws-id tx-id]} :- [:map [:ws-id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]]
  (api/check-404 (pos? (t2/delete! :model/WorkspaceTransform :ref_id tx-id :workspace_id ws-id)))
  ;; Increment graph version since transform is potentially leaving the graph, or reverting to the global definition.
  (ws.impl/increment-graph-version! ws-id)
  nil)

(api.macros/defendpoint :post "/:ws-id/transform/:tx-id/run"
  :- ::ws.t/execution-result
  "Run a transform in a workspace.

  App DB changes are rolled back. Warehouse DB changes persist.

  When run_stale_ancestors is true, any stale ancestor transforms will be executed first
  in dependency order. If any ancestor fails, execution stops and remaining ancestors
  are marked as not_run. The target transform will not run if any ancestor failed."
  {:access :workspace}
  [{:keys [ws-id tx-id]} :- [:map [:ws-id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]
   _query-params
   {:keys [run_stale_ancestors]} :- [:map [:run_stale_ancestors {:optional true} ::ws.t/flag]]]
  (let [workspace          (api/check-404 (t2/select-one :model/Workspace ws-id))
        transform          (api/check-404 (t2/select-one :model/WorkspaceTransform :ref_id tx-id :workspace_id ws-id))
        _                  (api/check-400 (not= :archived (:base_status workspace)) "Cannot execute archived workspace")
        _                  (check-transforms-enabled! (:database_id workspace))
        graph              (ws.impl/get-or-calculate-graph! workspace)
        run-ancestors?     (flag-enabled? run_stale_ancestors)
        ancestors-result   (when run-ancestors?
                             (ws.impl/run-stale-ancestors! workspace graph tx-id))
        ancestors-failed?  (seq (:failed ancestors-result))
        transform-result   (if ancestors-failed?
                             {:status  :failed
                              :message "Ancestor transform failed"
                              :table   (select-keys (:target transform) [:schema :name])}
                             (ws.impl/run-transform! workspace graph transform))]
    (cond-> transform-result
      run-ancestors? (assoc :ancestors ancestors-result))))

(api.macros/defendpoint :post "/:ws-id/transform/:tx-id/dry-run"
  :- ::ws.t/dry-run-result
  "Dry-run a transform in a workspace without persisting to the target table.

  Returns the first 2000 rows of transform output for preview purposes.
  Does not update last_run_at or create any database tables.

  When run_stale_ancestors is true, any stale ancestor transforms will be executed first
  in dependency order (these ARE persisted). If any ancestor fails, execution stops and
  the dry-run will not proceed."
  {:access :workspace}
  [{:keys [ws-id tx-id]} :- [:map [:ws-id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]
   _query-params
   {:keys [run_stale_ancestors]} :- [:map [:run_stale_ancestors {:optional true} ::ws.t/flag]]]
  (let [workspace          (api/check-404 (t2/select-one :model/Workspace ws-id))
        transform          (api/check-404 (t2/select-one :model/WorkspaceTransform :ref_id tx-id :workspace_id ws-id))
        _                  (api/check-400 (not= :archived (:base_status workspace)) "Cannot execute archived workspace")
        _                  (check-transforms-enabled! (:database_id workspace))
        graph              (ws.impl/get-or-calculate-graph! workspace)
        run-ancestors?     (flag-enabled? run_stale_ancestors)
        ancestors-result   (when run-ancestors?
                             (ws.impl/run-stale-ancestors! workspace graph tx-id))
        ancestors-failed?  (seq (:failed ancestors-result))
        dry-run-result     (if ancestors-failed?
                             {:status  :failed
                              :message "Ancestor transform failed"}
                             (ws.impl/dry-run-transform workspace graph transform))]
    (cond-> dry-run-result
      run-ancestors? (assoc :ancestors ancestors-result))))

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
   [:status ::status]
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
        checkouts        (t2/select [:model/WorkspaceTransform :ref_id :name :workspace_id]
                                    :global_id transform-id)
        ws-id->checkouts (into {} (map (juxt :workspace_id identity) checkouts))
        id->workspace    (into {} (map (juxt :id identity) workspaces))]
    {:checkout_disabled (checkout-disabled-reason transform)
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
  (api.macros/ns-handler *ns* +authorize +auth))
