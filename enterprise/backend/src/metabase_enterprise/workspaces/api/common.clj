(ns metabase-enterprise.workspaces.api.common
  "Shared schemas, validations, and handler logic for workspace API routes.
  Used by `workspaces.api` only currently, but may be shared with agent APIs in future."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase-enterprise.workspaces.models.workspace :as ws.model]
   [metabase-enterprise.workspaces.models.workspace-input-external]
   [metabase-enterprise.workspaces.models.workspace-log]
   [metabase-enterprise.workspaces.models.workspace-output-external]
   [metabase-enterprise.workspaces.types :as ws.t]
   [metabase-enterprise.workspaces.validation :as ws.validation]
   [metabase.api.common :as api]
   [metabase.database-routing.core :as database-routing]
   ^{:clj-kondo/ignore [:metabase/modules]}
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.queries.schema :as queries.schema]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.core :as transforms]
   [metabase.transforms.feature-gating :as transforms.gating]
   [metabase.transforms.util :as transforms.u]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.warehouse-schema.models.table :as table]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; --------------------------------------------------- Schemas ------------------------------------------------------

(def computed-statuses
  "All possible values returned by computed-status (computed from base_status, etc.)"
  #{:uninitialized :pending :ready :broken :archived})

(def workspace-transform-alias
  "Alias map for workspace transform fields (e.g. :target_stale -> :definition_changed)."
  {:target_stale :definition_changed})

(mr/def ::run-trigger
  [:enum "none" "global-schedule"])

(def TransformSource
  "Schema for a transform source. Shared across APIs — this is a data model concern, not an API contract."
  [:multi {:dispatch transforms-base.u/keyword-type-dispatch}
   [:query
    [:map
     [:type [:= "query"]]
     [:query ::queries.schema/query]]]
   [:python
    [:map {:closed true}
     [:source-database {:optional true} :int]
     [:source-tables   [:sequential ::transforms-base.u/source-table-entry]]
     [:type [:= "python"]]
     [:body :string]]]])

(def ^:private WorkspaceTransform
  "Internal schema used by handler functions for column selection. Each API namespace maintains
   its own copy of this schema for response validation — keep them in sync."
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

;;; ------------------------------------------------- Utilities ------------------------------------------------------

(defn- flag-enabled?
  "Coerce a flag parameter (true, false, or 1) to boolean."
  [v]
  (boolean (#{1 true} v)))

(defn ws->response
  "Transform a workspace record into an API response, computing the backwards-compatible status."
  [ws]
  (-> ws
      (select-keys [:id :name :collection_id :database_id :created_at :updated_at])
      (assoc :status (ws.model/computed-status ws))))

(defn check-transforms-enabled!
  "Validates that the database supports transforms: exists, is not sample/audit, supports :transforms/table, and no DB routing."
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

(defn checkout-disabled-reason
  "Returns reason why a transform cannot be checked out, or nil if checkout is allowed."
  [{:keys [source_type source]}]
  (case source_type
    :mbql   "mbql"
    :native (when (seq (lib/template-tags-referenced-cards (:query source)))
              "card-reference")
    :python nil
    "unknown-type"))

(def ^:private db+schema+table (juxt :database :schema :name))

(defn internal-target-conflict?
  "Check whether the given table is the target of another transform within the workspace. Ignores global transforms.
   NOTE: This intentionally includes archived transforms in the conflict check. Excluding them would allow a new
   transform to target the same table, creating a catch-22 when unarchiving the original (it can't be edited until
   after unarchiving, but unarchiving would create a conflict). Revisit if product decides on a UX for this."
  [ws-id target & [tx-id]]
  (contains?
   (t2/select-fn-set (comp db+schema+table :target)
                     [:model/WorkspaceTransform :target]
                     :ref_id [:not= tx-id]
                     :workspace_id ws-id)
   (db+schema+table target)))

(defn check-inputs-granted!
  "Throws 400 if any input tables required by the transform have not been granted access."
  [ws-id tx-id]
  (let [ungranted (ws.impl/ungranted-inputs-for-transform ws-id tx-id)]
    (when (seq ungranted)
      (let [tables (mapv #(select-keys % [:db_id :schema :table]) ungranted)]
        (throw (ex-info (str "Transform cannot run: the following input tables have not been granted access: "
                             (pr-str tables))
                        {:status-code      400
                         :ungranted-tables tables}))))))

;;; ---------------------------------------- Schema-driven select-keys ----------------------------------------

(defn- malli-map-keys [schema]
  (into [] (map first) (rest schema)))

(defn select-malli-keys
  "Like select-keys, but with the arguments reversed, and taking the malli schema for the output map.
   Nothing smart - for example, it doesn't understand optional versus maybe."
  ([schema m]
   (select-keys m (malli-map-keys schema)))
  ([schema alias-map m]
   (merge (select-malli-keys schema m)
          (u/for-map [[to from] alias-map] [to (from m)]))))

(defn select-model-malli-keys
  "Build the model-fields vector for a t2/select from a malli schema for the output row(s)"
  ([model schema]
   (into [model] (malli-map-keys schema)))
  ([model schema alias-map]
   (into [model]
         (map (fn [to] (if-let [from (to alias-map)] [from to] to)))
         (malli-map-keys schema))))

;;; ---------------------------------------- Transform CRUD helpers ----------------------------------------

(defn attach-isolated-target
  "Attaches the isolated (workspace-scoped) target table info to a workspace transform."
  [{:keys [workspace_id ref_id] :as ws-transform}]
  (let [{:keys [db_id isolated_schema isolated_table]}
        (t2/select-one :model/WorkspaceOutput :workspace_id workspace_id :ref_id ref_id)]
    (assoc ws-transform :target_isolated {:type     "table"
                                          :database db_id
                                          :schema   isolated_schema
                                          :name     isolated_table})))

;; Global transforms precalculate these in a toucan hook - maybe we should do that too? Let's review later.
(defn map-source-type
  "Derives :source_type from the transform's :source and removes :source from the map."
  [ws-tx]
  (-> ws-tx
      (assoc :source_type (transforms/transform-source-type (:source ws-tx)))
      (dissoc :source)))

(defn fetch-ws-transform
  "Fetches a single workspace transform by workspace-id and ref-id, with isolated target attached. 404s if not found."
  [ws-id tx-id]
  (-> (select-model-malli-keys :model/WorkspaceTransform WorkspaceTransform workspace-transform-alias)
      (t2/select-one :workspace_id ws-id :ref_id tx-id)
      api/check-404
      attach-isolated-target))

(defn create-workspace-transform!
  "Shared logic for creating a new workspace transform.
   Validates the transform, checks constraints, and inserts it into the changeset.
   Returns the created transform with isolated target info attached.

   Options:
   - `:ref-id` - Optional custom ref_id for the transform (defaults to auto-generated)"
  [ws-id body & {:keys [ref-id]}]
  (doseq [field [:name :source :target]]
    (api/check-400 (get body field) (str (name field) " is required when creating a new transform")))
  ;; Check premium feature requirements
  (api/check (transforms.u/check-feature-enabled body)
             [402 (deferred-tru "Premium features required for this transform type are not enabled.")])
  (t2/with-transaction [_tx]
    (let [workspace (u/prog1 (api/check-404 (t2/select-one :model/Workspace :id ws-id))
                      (api/check-400 (not= :archived (:base_status <>))
                                     "Cannot create transforms in an archived workspace"))
          global-id (:global_id body (:id body))
          ;; Verify transform source is allowed in workspaces (not MBQL, no card references, etc.)
          _         (let [source-type (transforms/transform-source-type (:source body))
                          reason      (checkout-disabled-reason {:source_type source-type :source (:source body)})]
                      (api/check-400 (nil? reason)
                                     (case reason
                                       "mbql"
                                       (deferred-tru "MBQL transforms cannot be added to workspaces.")
                                       "card-reference"
                                       (deferred-tru "Transforms referencing questions cannot be added to workspaces.")
                                       (deferred-tru "This transform cannot be added to a workspace: {0}." reason))))
          ;; For uninitialized workspaces, preserve the target database from the request body
          ;; For initialized workspaces, ensure the target database matches the workspace database
          body      (-> body (dissoc :global_id)
                        (cond-> (not= :uninitialized (:db_status workspace))
                          (update :target assoc :database (:database_id workspace))))
          ;; Check for internal target conflict AFTER adding database to target
          _         (api/check-400 (not (internal-target-conflict? ws-id (:target body)))
                                   (deferred-tru "Another transform in this workspace already targets that table"))
          ;; Eagerly create global target table row so it's immediately visible
          {:keys [database schema name]} (:target body)
          _         (when (and database name)
                      (table/upsert-transform-target-table! database schema name))
          transform (ws.common/add-to-changeset! api/*current-user-id* workspace :transform global-id body
                                                 :ref-id ref-id)]
      (-> (select-malli-keys WorkspaceTransform workspace-transform-alias transform)
          attach-isolated-target))))

;;; ---------------------------------------- Pending inputs ----------------------------------------

(defn pending-inputs
  "Pending (ungranted) inputs in a workspace, excluding tables shadowed by workspace outputs.
   Only includes inputs that are still referenced by at least one current transform version.
   Unlike query-ungranted-external-inputs, this includes tables that may not exist yet in metabase_table."
  [workspace-id]
  (t2/select [:model/WorkspaceInput :db_id :schema :table]
             {:where [:and
                      [:= :workspace_input.workspace_id workspace-id]
                      [:= :workspace_input.access_granted false]
                      ;; Only include inputs referenced by a current transform version.
                      [:exists {:select [1]
                                :from   [[:workspace_input_transform :wit]]
                                :where  [:and
                                         [:= :wit.workspace_input_id :workspace_input.id]
                                         [:= :wit.transform_version
                                          {:select [[:%max.transform_version]]
                                           :from   [[:workspace_input_transform :wit2]]
                                           :where  [:and
                                                    [:= :wit2.workspace_id :wit.workspace_id]
                                                    [:= :wit2.ref_id :wit.ref_id]]}]]}]
                      ;; Ignore tables that will be shadowed by outputs of other transforms.
                      [:not [:exists {:select [1]
                                      :from   [[:workspace_output :wo]]
                                      :where  [:and
                                               [:= :wo.workspace_id :workspace_input.workspace_id]
                                               [:= :wo.db_id :workspace_input.db_id]
                                               [:or
                                                [:and [:= :wo.global_schema nil] [:= :workspace_input.schema nil]]
                                                [:= :wo.global_schema :workspace_input.schema]]
                                               [:= :wo.global_table :workspace_input.table]]}]]
                      [:not [:exists {:select [1]
                                      :from   [[:workspace_output_external :woe]]
                                      :where  [:and
                                               [:= :woe.workspace_id :workspace_input.workspace_id]
                                               [:= :woe.db_id :workspace_input.db_id]
                                               [:or
                                                [:and [:= :woe.global_schema nil] [:= :workspace_input.schema nil]]
                                                [:= :woe.global_schema :workspace_input.schema]]
                                               [:= :woe.global_table :workspace_input.table]]}]]]
              :order-by [:db_id :schema :table]}))

;;; ---------------------------------------- Graph helpers ----------------------------------------

(defn node-type
  "Returns the graph node type, mapping :table to :input-table."
  [node]
  (let [nt (:node-type node)]
    (case nt
      :table :input-table
      nt)))

(defn node-id
  "Returns a unique string identifier for a graph node."
  [{:keys [node-type id]}]
  (case node-type
    :workspace-transform id
    :external-transform id
    :table (str (:db id) "-" (:schema id) "-" (:table id))))

(defn table-ids-by-target
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

(defn target->spec
  "Resolves a transform's target to a spec map with :db, :schema, :table, and :table_id."
  [driver table-id-map {:keys [target] :as tx}]
  (let [table-key [(:database target)
                   (sql.normalize/normalize-name driver (:schema target))
                   (sql.normalize/normalize-name driver (:name target))]
        table-id  (:id (get table-id-map table-key))]
    (assoc tx :target {:db       (:database target)
                       :schema   (:schema target)
                       :table    (:name target)
                       :table_id table-id})))

(defn fetch-transforms-for-graph
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

(defn node-data
  "Returns the data payload for a graph node, resolving targets to specs."
  [driver transforms-map table-id-map {:keys [node-type id]}]
  (case node-type
    :table id
    :external-transform (some->> (get-in transforms-map [:external id])
                                 (target->spec driver table-id-map))
    :workspace-transform (some->> (get-in transforms-map [:workspace id])
                                  (target->spec driver table-id-map))))

;;; ---------------------------------------- Shared endpoint handlers ----------------------------------------
;; These functions contain the handler logic for the workspace API (`workspaces/api.clj`).
;; Each `defendpoint` becomes a thin wrapper that calls the corresponding function here.

(def ^:private log-limit "Maximum number of recent workspace log items to show" 20)

(defn get-pending-inputs
  "Handler body for GET /:ws-id/input/pending."
  [ws-id]
  (api/check-404 (t2/select-one :model/Workspace :id ws-id))
  {:inputs (pending-inputs ws-id)})

(defn get-workspace
  "Handler body for GET /:ws-id."
  [ws-id]
  (-> (t2/select-one :model/Workspace :id ws-id) api/check-404 ws->response))

(defn get-workspace-tables
  "Handler body for GET /:ws-id/table."
  [ws-id]
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
                          (ws.impl/table-ids-fallbacks :isolated_schema :isolated_table :isolated_table_id all-outputs))
        table-ids        (into (into #{} (keep :isolated_table_id) all-outputs) (vals fallback-map))
        active-table-ids (t2/select-fn-set :id [:model/Table :id] :id [:in table-ids] :active true)]
    {:inputs  (sort-by (juxt :db_id :schema :table) inputs)
     :outputs (sort-by
               (juxt :db_id (comp (juxt :schema :table) :global))
               (concat
                ;; Workspace transform outputs
                (for [{:keys [ref_id db_id global_schema global_table global_table_id
                              isolated_schema isolated_table isolated_table_id]} outputs
                      :let [isolated_table_id (or isolated_table_id
                                                  (get fallback-map [db_id isolated_schema isolated_table]))]]
                  {:db_id    db_id
                   :global   {:transform_id nil
                              :schema       global_schema
                              :table        global_table
                              :table_id     (or global_table_id (get fallback-map [db_id global_schema global_table]))}
                   :isolated {:transform_id ref_id
                              :schema       isolated_schema
                              :table        isolated_table
                              :table_id     isolated_table_id
                              :active       (contains? active-table-ids isolated_table_id)}})

                ;; External transform outputs
                (for [{:keys [transform_id db_id global_schema global_table global_table_id
                              isolated_schema isolated_table isolated_table_id]} external-outputs
                      :let [isolated_table_id (or isolated_table_id
                                                  (get fallback-map [db_id isolated_schema isolated_table]))]]
                  {:db_id    db_id
                   :global   {:transform_id transform_id
                              :schema       global_schema
                              :table        global_table
                              :table_id     (or global_table_id (get fallback-map [db_id global_schema global_table]))}
                   :isolated {:transform_id transform_id
                              :schema       isolated_schema
                              :table        isolated_table
                              :table_id     isolated_table_id
                              :active       (contains? active-table-ids isolated_table_id)}})))}))

(defn get-workspace-log
  "Handler body for GET /:ws-id/log."
  [ws-id]
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

(defn get-workspace-graph
  "Handler body for GET /:ws-id/graph."
  [ws-id]
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

(defn get-workspace-problems
  "Handler body for GET /:ws-id/problem."
  [ws-id]
  (let [workspace (api/check-404 (t2/select-one :model/Workspace :id ws-id))
        graph     (ws.impl/get-or-calculate-graph! workspace)]
    (ws.validation/find-downstream-problems ws-id graph)))

(defn get-external-transforms
  "Handler body for GET /:ws-id/external/transform."
  [ws-id database-id]
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

(defn list-transforms
  "Handler body for GET /:ws-id/transform."
  [ws-id]
  (api/check-404 (t2/select-one :model/Workspace :id ws-id))
  {:transforms (->> (t2/select [:model/WorkspaceTransform :ref_id :global_id :name :source :creator_id]
                               :workspace_id ws-id {:order-by [:created_at]})
                    (map map-source-type))})

(defn archive-workspace!
  "Handler body for POST /:ws-id/archive."
  [ws-id]
  (let [ws (api/check-404 (t2/select-one :model/Workspace :id ws-id))]
    (api/check-400 (not= :archived (:base_status ws)) "You cannot archive an archived workspace")
    (ws.model/archive! ws)
    (-> (t2/select-one :model/Workspace :id ws-id) ws->response)))

(defn archive-transform!
  "Handler body for POST /:ws-id/transform/:tx-id/archive."
  [ws-id tx-id]
  (api/check-404 (pos? (t2/update! :model/WorkspaceTransform
                                   {:workspace_id ws-id, :ref_id tx-id}
                                   {:archived_at [:now]})))
  ;; Increment graph version since transform is leaving the graph
  (ws.impl/increment-graph-version! ws-id)
  nil)

(defn unarchive-transform!
  "Handler body for POST /:ws-id/transform/:tx-id/unarchive."
  [ws-id tx-id]
  (api/check-404 (pos? (t2/update! :model/WorkspaceTransform
                                   {:workspace_id ws-id, :ref_id tx-id}
                                   {:archived_at nil})))
  ;; Increment both versions - transform re-enters graph and needs re-analysis
  (ws.impl/increment-analysis-version! ws-id tx-id)
  ;; We could merge this with the initial WorkspaceTransform update to save a statement, but it adds complexity.
  (ws.impl/increment-graph-version! ws-id)
  nil)

(defn validate-target
  "Handler body for POST /:ws-id/transform/validate/target."
  [ws-id transform-id db_id target]
  (let [workspace    (api/check-404 (t2/select-one [:model/Workspace :database_id :db_status] ws-id))
        target       (update target :database #(or % db_id))
        target-db-id (:database target)
        ;; For uninitialized workspaces we skip over checks for their db id
        ws-db-id     (when (not= :uninitialized (:db_status workspace)) (:database_id workspace))]
    (cond
      (not= "table" (:type target))
      {:status 403 :body (deferred-tru "Unsupported target type")}

      (and target-db-id ws-db-id (not= target-db-id ws-db-id))
      {:status 403 :body (deferred-tru "Must target the workspace database")}

      (not (or target-db-id ws-db-id))
      {:status 403 :body (deferred-tru "Must target a database")}

      (when-let [schema (:schema target)] (str/starts-with? schema "mb__isolation_"))
      {:status 403 :body (deferred-tru "Must not target an isolated workspace schema")}

      ;; Within a workspace, we defer blocking on conflicts outside the workspace
      #_{:status 403 :body (deferred-tru "A table with that name already exists.")}

      ;; Consider deferring this validation until merge also.
      (internal-target-conflict? ws-id target transform-id)
      {:status 403 :body (deferred-tru "Another transform in this workspace already targets that table")}

      :else
      {:status 200 :body "OK"})))

(defn run-workspace!
  "Handler body for POST /:ws-id/run."
  [ws-id stale_only]
  (let [workspace (t2/select-one :model/Workspace :id ws-id)
        _         (api/check-404 workspace)
        _         (api/check-400 (not= :archived (:base_status workspace)) "Cannot execute archived workspace")
        _         (check-transforms-enabled! (:database_id workspace))
        graph     (ws.impl/get-or-calculate-graph! workspace)]
    (ws.impl/execute-workspace! workspace graph {:stale-only? (flag-enabled? stale_only)})))

(defn run-transform!
  "Handler body for POST /:ws-id/transform/:tx-id/run."
  [ws-id tx-id run_stale_ancestors]
  (let [workspace          (api/check-404 (t2/select-one :model/Workspace ws-id))
        transform          (api/check-404 (t2/select-one :model/WorkspaceTransform :workspace_id ws-id :ref_id tx-id))
        _                  (api/check-400 (not= :archived (:base_status workspace)) "Cannot execute archived workspace")
        _                  (check-transforms-enabled! (:database_id workspace))
        _                  (check-inputs-granted! ws-id tx-id)
        graph              (ws.impl/get-or-calculate-graph! workspace)
        run-ancestors?     (flag-enabled? run_stale_ancestors)
        ancestors-result   (when run-ancestors?
                             (ws.impl/run-stale-ancestors! workspace graph tx-id))
        failed-ancestors   (:failed ancestors-result)
        transform-result   (if (seq failed-ancestors)
                             {:status  :failed
                              :message (str "Ancestor transform failed: "
                                            (str/join ", " failed-ancestors))
                              :table   (select-keys (:target transform) [:schema :name])}
                             (ws.impl/run-transform! workspace graph transform))]
    (cond-> transform-result
      run-ancestors? (assoc :ancestors ancestors-result))))

(defn dry-run-transform!
  "Handler body for POST /:ws-id/transform/:tx-id/dry-run."
  [ws-id tx-id run_stale_ancestors]
  (let [workspace          (api/check-404 (t2/select-one :model/Workspace ws-id))
        transform          (api/check-404 (t2/select-one :model/WorkspaceTransform :workspace_id ws-id :ref_id tx-id))
        _                  (api/check-400 (not= :archived (:base_status workspace)) "Cannot execute archived workspace")
        _                  (check-transforms-enabled! (:database_id workspace))
        _                  (check-inputs-granted! ws-id tx-id)
        graph              (ws.impl/get-or-calculate-graph! workspace)
        run-ancestors?     (flag-enabled? run_stale_ancestors)
        ancestors-result   (when run-ancestors?
                             (ws.impl/run-stale-ancestors! workspace graph tx-id))
        failed-ancestors   (:failed ancestors-result)
        dry-run-result     (if (seq failed-ancestors)
                             {:status  :failed
                              :message (str "Ancestor transform failed: "
                                            (str/join ", " failed-ancestors))}
                             (ws.impl/dry-run-transform workspace graph transform))]
    (cond-> dry-run-result
      run-ancestors? (assoc :ancestors ancestors-result))))

(defn execute-query!
  "Handler body for POST /:ws-id/query."
  [ws-id sql]
  (let [workspace (api/check-404 (t2/select-one :model/Workspace ws-id))
        _         (api/check-400 (not= :archived (:base_status workspace))
                                 "Cannot query archived workspace")
        _         (api/check-400 (not= :uninitialized (:db_status workspace))
                                 "Workspace is not initialized")
        _         (api/check-400 (some? (:database_details workspace))
                                 "Workspace is not ready for queries")
        _         (check-transforms-enabled! (:database_id workspace))
        graph     (ws.impl/get-or-calculate-graph! workspace)]
    (ws.impl/execute-adhoc-query workspace graph sql)))

(defn update-transform!
  "Handler body for PUT /:ws-id/transform/:tx-id."
  [ws-id tx-id body]
  ;; We use explicit check-then-branch rather than app-db/update-or-insert! because:
  ;; 1. WorkspaceTransform has a compound primary key which that helper doesn't support
  ;; 2. Update and insert have very different logic (update merges + increments versions,
  ;;    insert requires full validation, workspace initialization, status transitions)
  (let [existing (t2/select-one :model/WorkspaceTransform :ref_id tx-id :workspace_id ws-id)]
    (if existing
      ;; UPDATE path
      (t2/with-transaction [_tx]
        (let [;; Merge only :database and :schema from existing target to preserve them when not explicitly provided.
              ;; Other fields are NOT merged, allowing them to be removed by omitting from the request.
              base (select-keys (:target existing) [:database :schema])
              merged-body (cond-> body
                            (:target body) (update :target #(merge base %)))
              source-or-target-changed? (or (:source body) (:target body))]
          ;; If target is changing, check for conflicts with other transforms (excluding this one)
          (when (:target body)
            (api/check-400 (not (internal-target-conflict? ws-id (:target merged-body) tx-id))
                           (deferred-tru "Another transform in this workspace already targets that table"))
            ;; Eagerly create global target table row so it's immediately visible
            (let [{:keys [database schema name]} (:target merged-body)]
              (when (and database name)
                (table/upsert-transform-target-table! database schema name))))
          (t2/update! :model/WorkspaceTransform {:workspace_id ws-id :ref_id tx-id} merged-body)
          ;; If source or target changed, increment versions for re-analysis
          (when source-or-target-changed?
            (ws.impl/increment-analysis-version! ws-id tx-id)
            ;; It's unfortunate that we are using an extra SQL statement for this, rather than doing it in the earlier
            ;; statement that set the [[body]]. Combining them would be tricky, as we still need the model transforms to
            ;; serialize the fields in the body, but the increment requires using an SQL expression.
            (ws.impl/increment-graph-version! ws-id)))
        (fetch-ws-transform ws-id tx-id))
      ;; INSERT path (upsert creates new transform)
      (create-workspace-transform! ws-id body :ref-id tx-id))))

(defn delete-transform!
  "Handler body for DELETE /:ws-id/transform/:tx-id."
  [ws-id tx-id]
  (api/check-404 (pos? (t2/delete! :model/WorkspaceTransform :workspace_id ws-id :ref_id tx-id)))
  ;; Increment graph version since transform is potentially leaving the graph, or reverting to the global definition.
  (ws.impl/increment-graph-version! ws-id)
  nil)
