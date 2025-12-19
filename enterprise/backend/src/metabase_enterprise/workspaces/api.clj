(ns metabase-enterprise.workspaces.api
  "`/api/ee/workspace/` routes"
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase-enterprise.transforms.core :as transforms]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.dag :as ws.dag]
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase-enterprise.workspaces.merge :as ws.merge]
   [metabase-enterprise.workspaces.models.workspace :as ws.model]
   [metabase-enterprise.workspaces.models.workspace-log]
   [metabase-enterprise.workspaces.types :as ws.t]
   [metabase-enterprise.workspaces.validation :as ws.validation]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.queries.schema :as queries.schema]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [tru deferred-tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private log-limit "Maximum number of recent workspace log items to show" 20)

(mr/def ::appdb-or-ref-id [:or ::ws.t/appdb-id ::ws.t/ref-id])

(mr/def ::status [:enum :pending :ready] #_[:enum :uninitialized :database-not-read :graph-not-ready :ready])

(def ^:private Workspace
  [:map
   [:id ::ws.t/appdb-id]
   [:name :string]
   [:collection_id ::ws.t/appdb-id]
   [:database_id ::ws.t/appdb-id]
   [:status ::status]
   [:created_at ms/TemporalInstant]
   [:updated_at ms/TemporalInstant]
   [:archived_at [:maybe :any]]])

;; Transform-related schemas (adapted from transforms/api.clj)
;; TODO we should reuse these schemas, by exposing common types from the transforms module. they *can* match exactly.

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
   [:archived :boolean]])

(api.macros/defendpoint :get "/" :- [:map {:closed true}
                                     [:items [:sequential WorkspaceListing]]
                                     [:limit [:maybe :int]]
                                     [:offset [:maybe :int]]]
  "Get a list of all workspaces"
  [_route-params
   _query-params]
  {:items  (t2/select [:model/Workspace :id :name [[:not= nil :archived_at] :archived]]
                      (cond-> {:order-by [[:created_at :desc]]}
                        (request/limit) (sql.helpers/limit (request/limit))
                        (request/offset) (sql.helpers/offset (request/offset))))
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
             [:transform_id [:maybe ::ws.t/appdb-id]]
             [:schema [:maybe :string]]
             [:table :string]
             [:table_id [:maybe ::ws.t/appdb-id]]]]
   [:isolated [:map
               [:transform_id ::ws.t/ref-id]
               [:schema :string]
               [:table :string]
               [:table_id [:maybe ::ws.t/appdb-id]]]]])

(defn- batch-lookup-table-ids
  "Given a bounded list of tables, all within the same database, return an association list of [db schema table] => id"
  [db-id schema-key table-key table-refs]
  (when (seq table-refs)
    (t2/select-fn-vec (juxt (juxt (constantly db-id) :schema :name) :id)
                      [:model/Table :id :schema :name]
                      :db_id db-id
                      {:where (into [:or] (for [tr table-refs]
                                            [:and
                                             [:= :schema (get tr schema-key)]
                                             [:= :name (get tr table-key)]]))})))

(defn- table-ids-fallbacks
  "Given a list of maps holding [db_id schema table], return a mapping from those tuples => table_id"
  [schema-key table-key id-key table-refs]
  (when-let [table-refs (seq (remove id-key table-refs))]
    ;; These are ordered by db, so this will partition fine.
    (u/for-map [table-refs (partition-by :db_id table-refs)
                :let [db_id (:db_id (first table-refs))]
                ;; Guesstimating a number that prevents this query being too large.
                table-refs (partition-all 20 table-refs)
                map-entry (batch-lookup-table-ids db_id schema-key table-key table-refs)]
      map-entry)))

(api.macros/defendpoint :get "/:id/table"
  :- [:map {:closed true}
      [:inputs [:sequential ::input-table]]
      [:outputs [:sequential ::output-table]]]
  "Get workspace tables"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  (let [order-by        {:order-by [:db_id :global_schema :global_table]}
        outputs         (t2/select [:model/WorkspaceOutput
                                    :db_id :global_schema :global_table :global_table_id
                                    :isolated_schema :isolated_table :isolated_table_id :ref_id]
                                   :workspace_id id order-by)
        raw-inputs      (t2/select [:model/WorkspaceInput :db_id :schema :table :table_id]
                                   :workspace_id id {:order-by [:db_id :schema :table]})
        ;; Some of our inputs may be shadowed by the outputs of other transforms. We only want external inputs.
        shadowed?       (into #{} (map (juxt :db_id :global_schema :global_table)) outputs)
        inputs          (remove (comp shadowed? (juxt :db_id :schema :table)) raw-inputs)
        ;; Build a map of [d s t] => id for every table that has been synced since the output row was written.
        fallback-map    (merge
                         (table-ids-fallbacks :global_schema :global_table :global_table_id outputs)
                         (table-ids-fallbacks :isolated_schema :isolated_table :isolated_table_id outputs))]
    {:inputs  inputs
     :outputs (for [{:keys [ref_id db_id global_schema global_table global_table_id
                            isolated_schema isolated_table isolated_table_id]} outputs]
                {:db_id    db_id
                 :global   {:transform_id nil
                            :schema       global_schema
                            :table        global_table
                            :table_id     (or global_table_id (get fallback-map [db_id global_schema global_table]))}
                 :isolated {:transform_id ref_id
                            :schema       isolated_schema
                            :table        isolated_table
                            :table_id     (or isolated_table_id (get fallback-map [db_id isolated_schema isolated_table]))}})}))

(api.macros/defendpoint :get "/:id" :- Workspace
  "Get a single workspace by ID"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (-> (t2/select-one :model/Workspace :id id) api/check-404 ws->response))

(api.macros/defendpoint :get "/:id/log"
  :- [:map
      [:workspace_id ms/PositiveInt]
      [:status [:enum :pending :ready :archived]]
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
   [:database_id ::ws.t/appdb-id]])

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

(defn- db-unsupported-reason [db]
  (when (not (driver.u/supports? (:engine db) :workspace db))
    "Database type not supported."))

(api.macros/defendpoint :get "/enabled" :- [:map [:supported :boolean] [:reason {:optional true} :string]]
  "Test whether the current user can use Workspaces. Optionally takes a specific database.
   Factors include: driver support, database user privileges, metabase permissions."
  [_url-params
   {:keys [database-id]} :- [:map [:database-id {:optional true} ms/PositiveInt]]]
  (if-let [reason (or (when (not api/*is-superuser?*)
                        (tru "Not allowed."))
                      (when database-id
                        (db-unsupported-reason (api/check-404 (t2/select-one :model/Database database-id)))))]
    {:supported false, :reason reason}
    {:supported true}))

(api.macros/defendpoint :get "/database" :- [:map
                                             [:databases
                                              [:sequential [:map
                                                            [:id ms/PositiveInt]
                                                            [:name :string]
                                                            [:supported :boolean]
                                                            [:reason {:optional true} :string]]]]]
  "Get a list of databases to show in the workspace picker, along with whether they're supported."
  [_url-params
   _query-params]
  {:databases (->> (t2/select :model/Database {:order-by [:name]})
                   ;; Omit those we don't even support
                   (filter #(driver.u/supports? (:engine %) :workspace %))
                   (mapv (fn [db]
                           (merge (select-keys db [:id :name])
                                  (if-let [reason (db-unsupported-reason db)]
                                    {:supported false, :reason reason}
                                    {:supported true})))))})

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
    (ws.model/archive! ws)
    (-> (t2/select-one :model/Workspace :id id)
        ws->response)))

(api.macros/defendpoint :post "/:id/unarchive" :- Workspace
  "Restore an archived workspace. Recreates the isolated schema and tables."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body-params]
  (let [ws (api/check-404 (t2/select-one :model/Workspace :id id))]
    (api/check-400 (some? (:archived_at ws)) "You cannot unarchive a workspace that is not archived")
    (ws.model/unarchive! ws)
    (-> (t2/select-one :model/Workspace :id id)
        ws->response)))

(api.macros/defendpoint :delete "/:ws-id" :- [:map [:ok [:= true]]]
  "Delete a workspace and all its contents, including mirrored entities."
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params]
  (let [ws (api/check-404 (t2/select-one :model/Workspace :id ws-id))]
    (api/check-400 (some? (:archived_at ws)) "You cannot delete a workspace without first archiving it")
    (ws.model/delete! ws)
    {:ok true}))

(def ^:private ExternalTransform
  ;; Might be interesting to show whether they're enclosed, once we have the graph.
  ;; When they're enclosed, it could also be interesting to know whether they're stale.
  [:map
   [:id ::ws.t/appdb-id]
   [:name :string]
   [:source_type :keyword]
   [:checkout_disabled [:maybe :string]]])

(api.macros/defendpoint :get "/:ws-id/external/transform" :- [:map [:transforms [:sequential ExternalTransform]]]
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]
   _query-params]
  (api/check-superuser)
  (let [db-id      (:database_id (api/check-404 (t2/select-one [:model/Workspace :database_id] ws-id)))
        ;; TODO (chris 2025/12/11) use target_db_id once it's there, and skip :target
        transforms (t2/select [:model/Transform :id :name :source_type :source :target]
                              {:left-join [[:workspace_transform :wt]
                                           [:and
                                            [:= :transform.id :wt.global_id]
                                            [:= :wt.workspace_id ws-id]]]
                               ;; NULL workspace_id means transform is not checked out into this workspace
                               :where     [:= nil :wt.workspace_id]
                               :order-by  [[:id :asc]]})]
    {:transforms
     (into []
           (comp (filter #(= db-id (:database (:target %))))
                 (map #(-> %
                           (dissoc :source :target)
                           (assoc :checkout_disabled (case (:source_type %)
                                                       :mbql "mbql"
                                                       :native (when (seq (lib/template-tags-referenced-cards (:query (:source %))))
                                                                 "card-reference")
                                                       :python nil
                                                       "unknown-type"))))
                 #_(map #(update % :last_run transforms.util/localize-run-timestamps)))
           transforms
           ;; Perhaps we want to expose some of this later?
           #_(t2/hydrate transforms :last_run :creator))}))

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
   {:keys [stale_only]} :- [:map [:stale_only {:optional true} [:or [:= 1] :boolean]]]]
  (let [workspace (t2/select-one :model/Workspace :id ws-id)]
    (api/check-404 workspace)
    (api/check-400 (nil? (:archived_at workspace)) "Cannot execute archived workspace")
    (ws.impl/execute-workspace! workspace {:stale-only stale_only})))

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

;; TODO we'll want to bulk query this of course...
(defn- node-data [{:keys [node-type id]}]
  (case node-type
    :table id
    :external-transform (t2/select-one [:model/Transform :id :name] id)
    ;; TODO we'll want to select by workspace as well here, to relax uniqueness assumption
    :workspace-transform (t2/select-one [:model/WorkspaceTransform :ref_id :name] :ref_id id)))

(api.macros/defendpoint :get "/:ws-id/graph" :- GraphResult
  "Display the dependency graph between the Changeset and the (potentially external) entities that they depend on."
  [{:keys [ws-id]} :- [:map [:ws-id ms/PositiveInt]]
   _query-params]
  (api/check-404 (t2/select-one :model/Workspace :id ws-id))

  (let [changeset (t2/select-fn-vec (fn [{:keys [ref_id]}] {:entity-type :transform, :id ref_id})
                                    [:model/WorkspaceTransform :ref_id] :workspace_id ws-id)
        {:keys [inputs entities dependencies]} (ws.dag/path-induced-subgraph ws-id changeset)
        ;; TODO Graph analysis doesn't return this currently, we need to invert the deps graph
        ;;      It could be cheaper to build it as we go.
        inverted (reduce
                  (fn [inv [c parents]]
                    (reduce (fn [inv p] (update inv p (fnil conj #{}) c)) inv parents))
                  {}
                  dependencies)
        dep-count #(frequencies (map node-type (get inverted %)))]

    {:nodes (concat (for [i inputs]
                      {:type             :input-table
                       ;; Use an id that's independent of whether the table exists yet.
                       :id               (node-id {:id i, :node-type :table})
                       :data             i
                       :dependents_count (dep-count {:node-type :table, :id i})})
                    (for [e entities]
                      {:type             (node-type e)
                       :id               (:id e)
                       :data             (node-data e)
                       :dependents_count (dep-count e)}))
     :edges (for [[child parents] dependencies, parent parents]
              ;; Yeah, this graph points to dependents, not dependencies
              {:from_entity_type (name (node-type parent))
               :from_entity_id   (node-id parent)
               :to_entity_type   (name (node-type child))
               :to_entity_id     (node-id child)})}))

;;; ---------------------------------------- Problems/Validation ----------------------------------------

(api.macros/defendpoint :get "/:id/problem" :- [:sequential ::ws.t/problem]
  "Detect problems in the workspace that would affect downstream transforms after merge.

   Returns a list of problems, each with:
   - category:    the problem category (e.g. 'unused', 'internal-downstream', 'external-downstream')
   - problem:     the specific problem (e.g. 'not-run', 'stale', 'removed-field')
   - severity:    :error, :warning, or :info
   - block-merge: whether this problem prevents merging
   - data:        extra information, shape depends on the problem type

   See `metabase-enterprise.workspaces.types/problem-types` for the full list."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  (let [changeset (t2/select-fn-vec (fn [{:keys [ref_id]}] {:entity-type :transform, :id ref_id})
                                    [:model/WorkspaceTransform :ref_id] :workspace_id id)
        graph     (ws.dag/path-induced-subgraph id changeset)]
    (ws.validation/find-downstream-problems id graph)))

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
  [{:keys [ws-id]} :- [:map [:ws-id ::ws.t/appdb-id]]
   {:keys [transform-id]} :- [:map [:transform-id {:optional true} ::ws.t/ref-id]]
   {:keys [db_id target]} :- [:map
                              [:db_id {:optional true} ::ws.t/appdb-id]
                              [:target [:map
                                        [:database {:optional true} ::ws.t/appdb-id]
                                        [:type :string]
                                        [:schema :string]
                                        [:name :string]]]]]
  (let [workspace (api/check-404 (t2/select-one [:model/Workspace :database_id] ws-id))
        target    (update target :database #(or % db_id))
        tx-id     (when transform-id (parse-long transform-id))
        ws-db-id  (:database_id workspace)]
    (cond
      (not= "table" (:type target))
      {:status 403 :body (deferred-tru "Unsupported target type")}

      (and db_id ws-db-id (not= db_id ws-db-id))
      {:status 403 :body (deferred-tru "Must target the workspace database")}

      (not (or db_id ws-db-id))
      {:status 403 :body (deferred-tru "Must target a database")}

      (str/starts-with? (:schema target) "mb__isolation_")
      {:status 403 :body (deferred-tru "Must not target an isolated workspace schema")}

      ;; Within a workspace, we defer blocking on conflicts outside the workspace
      #_{:status 403 :body (deferred-tru "A table with that name already exists.")}

      ;; TODO consider deferring this validation until merge also.
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
   [:target_stale :boolean]
   [:workspace_id ::ws.t/appdb-id]
   ;;[:creator_id ::ws.t/appdb-id]
   [:archived_at :any]
   [:created_at :any]
   [:updated_at :any]
   [:last_run_at :any]])

(def ^:private workspace-transform-alias {:target_stale :stale})

(api.macros/defendpoint :post "/:id/transform"
  :- WorkspaceTransform
  "Add another transform to the Changeset. This could be a fork of an existing global transform, or something new."
  [{:keys [id]} :- [:map [:id ::ws.t/appdb-id]]
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
    (let [workspace (u/prog1 (api/check-404 (t2/select-one :model/Workspace :id id))
                      (api/check-400 (nil? (:archived_at <>)) "Cannot create transforms in an archived workspace"))
          ;; TODO why 400 here and 403 in the validation route? T_T
          _         (api/check-400 (not (internal-target-conflict? id (:target body)))
                                   (deferred-tru "Another transform in this workspace already targets that table"))
          global-id (:global_id body (:id body))
          body      (-> body (dissoc :global_id) (update :target assoc :database (:database_id workspace)))
          transform (ws.common/add-to-changeset! api/*current-user-id* workspace :transform global-id body)]
      (select-malli-keys WorkspaceTransform workspace-transform-alias transform))))

;; TODO Confirm precisely which fields are needed by the FE
(def ^:private WorkspaceTransformListing
  "Schema for a transform in a workspace"
  [:map {:closed true}
   [:ref_id ::ws.t/ref-id]
   [:global_id [:maybe ::ws.t/appdb-id]]
   [:name :string]
   [:source_type [:maybe :keyword]]
   ;[:creator_id ::ws.t/appdb-id]
   ;[:last_run :map]
   ; See https://metaboat.slack.com/archives/C099RKNLP6U/p1765205882655869?thread_ts=1765205222.888209&cid=C099RKNLP6U
   #_[:target_stale :boolean]])

;; Global transforms precalculate these in a toucan hook - maybe we should do that too? Let's review later.
(defn- map-source-type [ws-tx]
  (-> ws-tx
      (assoc :source_type (transforms/transform-source-type (:source ws-tx)))
      (dissoc :source)))

(api.macros/defendpoint :get "/:id/transform" :- [:map [:transforms [:sequential WorkspaceTransformListing]]]
  "Get all transforms in a workspace."
  [{:keys [id]} :- [:map [:id ::ws.t/appdb-id]]]
  (api/check-404 (t2/select-one :model/Workspace :id id))
  {:transforms (map map-source-type (t2/select [:model/WorkspaceTransform :ref_id :global_id :name :source] :workspace_id id {:order-by [:created_at]}))})

(defn- fetch-ws-transform [ws-id tx-id]
  ;; TODO We still need to do some hydration, e.g. of the target table (both internal and external)
  (-> (select-model-malli-keys :model/WorkspaceTransform WorkspaceTransform workspace-transform-alias)
      (t2/select-one :ref_id tx-id :workspace_id ws-id)
      api/check-404))

(api.macros/defendpoint :get "/:id/transform/:tx-id" :- WorkspaceTransform
  "Get a specific transform in a workspace."
  [{:keys [id tx-id]} :- [:map [:id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]]
  (fetch-ws-transform id tx-id))

(api.macros/defendpoint :put "/:ws-id/transform/:tx-id" :- WorkspaceTransform
  "Update a transform in a workspace."
  [{:keys [ws-id tx-id]} :- [:map [:ws-id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]
   _query-params
   body :- [:map
            [:name {:optional true} :string]
            [:description {:optional true} [:maybe :string]]
            [:source {:optional true} ::transform-source]
            [:target {:optional true} ::transform-target]]]
  (t2/with-transaction [_tx]
    (api/check-404 (t2/select-one :model/WorkspaceTransform :ref_id tx-id :workspace_id ws-id))
    (t2/update! :model/WorkspaceTransform tx-id body)
    ;; Being cheeky and using the API response value for the pre-validation, to save a query.
    (u/prog1 (fetch-ws-transform ws-id tx-id)
      ;; NOTE: FE may send these fields even when unchanged, causing unnecessary re-syncs.
      ;; This is acceptable for now, but using t2/changes in hooks might catch false positives?
      ;; The most reliable thing would be to have a clear, tested contract with the FE to NOT send them if unchanged.
      (when (or (:source body) (:target body))
        ;; Note that we do NOT want to couple ourselves to the response shape of this API.
        ;; We want to be extremely mindful of the fields we depend on, in case we remove them from the response.
        (let [transform (select-keys <> [:ref_id :source :source_type :target])
              workspace (t2/select-one :model/Workspace :id ws-id)]
          ;; Re-sync dependencies if source or target changed.
          (ws.impl/sync-transform-dependencies! workspace transform))))))

(api.macros/defendpoint :post "/:id/transform/:tx-id/archive" :- :nil
  "Mark the given transform to be archived when the workspace is merged.
   For provisional transforms we will skip even creating it in the first place."
  [{:keys [id tx-id]} :- [:map [:id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]]
  (api/check-404 (pos? (t2/update! :model/WorkspaceTransform {:ref_id tx-id :workspace_id id} {:archived_at [:now]})))
  nil)

(api.macros/defendpoint :post "/:id/transform/:tx-id/unarchive" :- :nil
  "Unmark the given transform for archival. This will recall the last definition it had within the workspace."
  [{:keys [id tx-id]} :- [:map [:id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]]
  (api/check-404 (pos? (t2/update! :model/WorkspaceTransform {:ref_id tx-id :workspace_id id} {:archived_at nil})))
  nil)

(api.macros/defendpoint :delete "/:id/transform/:tx-id" :- :nil
  "Discard a transform from the changeset.
   Equivalent to resetting a checked-out transform to its global definition, or deleting a provisional transform."
  [{:keys [id tx-id]} :- [:map [:id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]]
  (api/check-404 (pos? (t2/delete! :model/WorkspaceTransform :ref_id tx-id :workspace_id id)))
  nil)

(api.macros/defendpoint :post "/:id/transform/:tx-id/run"
  :- ::ws.t/execution-result
  "Run a transform in a workspace.

  App DB changes are rolled back. Warehouse DB changes persist."
  [{:keys [id tx-id]} :- [:map [:id ::ws.t/appdb-id] [:tx-id ::ws.t/ref-id]]]
  (let [workspace  (api/check-404 (t2/select-one :model/Workspace id))
        transform  (api/check-404 (t2/select-one :model/WorkspaceTransform :ref_id tx-id :workspace_id id))]
    (api/check-400 (nil? (:archived_at workspace)) "Cannot execute archived workspace")
    (check-transforms-enabled! (:database_id workspace))
    (ws.impl/run-transform! workspace transform)))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case]}
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
   {:keys [transform-id]} :- [:map {:closed true} [:transform-id ms/PositiveInt]]]
  (let [transforms       (t2/select [:model/WorkspaceTransform :ref_id :name :workspace_id] :global_id transform-id)
        workspace-ids    (map :workspace_id transforms)
        workspaces-by-id (when (seq transforms)
                           (t2/select-fn->fn :id identity [:model/Workspace :id :name] :id [:in workspace-ids]))]
    {:transforms (for [{:keys [ref_id name workspace_id]} transforms]
                   {:id        ref_id
                    :name      name
                    :workspace (get workspaces-by-id workspace_id)})}))

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
       [:workspace [:map [:id ::ws.t/appdb-id] [:name :string]]]
       [:archived_at [:maybe :any]]]
      ;; error message from check-404 or check-400
      :string]
  "This will:
   1. Update original transforms with workspace versions
   2. Delete the workspace and clean up isolated resources
   Returns a report of merged entities, or error in errors key."
  [{:keys [ws-id] :as _query-params} :- [:map [:ws-id ::ws.t/appdb-id]]
   _body-params]
  (let [ws               (u/prog1 (t2/select-one :model/Workspace :id ws-id)
                           (api/check-404 <>)
                           (api/check-400 (nil? (:archived_at <>)) "Cannot merge an archived workspace"))
        {:keys [merged
                errors]} (-> (ws.merge/merge-workspace! ws-id)
                             (update :errors
                                     (partial mapv #(-> %
                                                        (update :error (fn [e] (.getMessage ^Throwable e)))
                                                        (set/rename-keys {:error :message})))))]
    (u/prog1
      {:merged      merged
       :errors      errors
       :workspace   {:id ws-id, :name (:name ws)}
       :archived_at (when-not (seq errors)
                      ;; TODO call a ws.common method, which can handle the clean-up too
                      (t2/update! :model/Workspace :id ws-id {:archived_at [:now]})
                      (t2/select-one-fn :archived_at [:model/Workspace :archived_at] :id ws-id))}
      (when-not (seq errors)
        ;; Most of the APIs and the FE are not respecting when a Workspace is archived yet.
        (ws.model/delete! ws)))))

(api.macros/defendpoint :post "/:ws-id/transform/:tx-id/merge"
  :- [:map
      [:op [:enum :create :delete :update :noop]]
      [:global_id [:maybe ::ws.t/appdb-id]]
      [:ref_id ::ws.t/ref-id]
      [:message {:optional true} :string]]
  "Merge single transform from workspace back to the core. If workspace transform is archived
  the corresponding core transform is deleted."
  [{:keys [ws-id tx-id] :as _query-params} :- [:map
                                               [:ws-id ::ws.t/appdb-id]
                                               [:tx-id ::ws.t/ref-id]]
   _body-params]
  (let [ws-transform (u/prog1 (t2/select-one :model/WorkspaceTransform :workspace_id ws-id :ref_id tx-id)
                       (api/check-404 <>))
        {:keys [error] :as result} (ws.merge/merge-transform! ws-transform)]
    (if error
      (throw (ex-info "Failed to merge transform."
                      (-> result
                          (dissoc :error)
                          (assoc :status-code 500))
                      error))
      result)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/workspace/` routes."
  (api.macros/ns-handler *ns* api/+check-superuser +auth))
