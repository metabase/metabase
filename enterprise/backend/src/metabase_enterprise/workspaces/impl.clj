(ns metabase-enterprise.workspaces.impl
  "Glue code connecting workspace subsystems (dependencies, isolation)."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.workspaces.dag :as ws.dag]
   [metabase-enterprise.workspaces.dependencies :as ws.deps]
   [metabase-enterprise.workspaces.execute :as ws.execute]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.api.common :as api]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql.util :as sql.util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- query-ungranted-external-inputs
  "Query for external inputs in a workspace that haven't been granted access yet.
   External inputs are tables that are not shadowed by any output tables.
   Returns seq of WorkspaceInput records where the table is active, and access_granted is false."
  [workspace-id]
  ;; It would be nice if we could optimize this join to use table_id, since we ignore tables that don't exist anyway.
  (t2/select :model/WorkspaceInput
             :workspace_id workspace-id
             {:where [:and
                      [:= :workspace_input.access_granted false]
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
                                               [:= :woe.global_table :workspace_input.table]]}]]
                      ;; Ignore tables that don't currently exist.
                      [:exists {:select [1]
                                :from [[:metabase_table :t]]
                                :where [:and
                                        [:= :active true]
                                        [:= :t.db_id :workspace_input.db_id]
                                        [:or
                                         [:and [:= :t.schema nil] [:= :workspace_input.schema nil]]
                                         [:= :t.schema :workspace_input.schema]]
                                        [:= :t.name :workspace_input.table]]}]]}))

(defn- external-input->table
  [{:keys [schema table]}]
  {:schema schema
   :name   table})

(defn ungranted-inputs-for-transform
  "Return ungranted WorkspaceInput rows that are linked to the given transform (by ref-id).
   Uses the latest transform_version from workspace_input_transform."
  [ws-id ref-id]
  (t2/select [:model/WorkspaceInput :id :db_id :schema :table :table_id]
             {:join  [[:workspace_input_transform :wit]
                      [:= :wit.workspace_input_id :workspace_input.id]]
              :where [:and
                      [:= :wit.workspace_id ws-id]
                      [:= :wit.ref_id ref-id]
                      [:= :workspace_input.access_granted false]
                      [:= :wit.transform_version
                       {:select [[:%max.transform_version]]
                        :from   [:workspace_input_transform]
                        :where  [:and
                                 [:= :workspace_id ws-id]
                                 [:= :ref_id ref-id]]}]]}))

(defn inputs-granted?
  "Whether all input tables for a given transform have been granted access."
  [ws-id ref-id]
  (empty? (ungranted-inputs-for-transform ws-id ref-id)))

(defn sync-grant-accesses!
  "Grant read access to external input tables for a workspace that haven't been granted yet.
   External inputs are tables that are read by transforms but not produced by any transform in the workspace.
   This should be called after adding transforms to a workspace or when re-initializing workspace isolation
   (e.g., after unarchiving)."
  [{workspace-id :id :as workspace}]
  (let [ungranted-inputs (query-ungranted-external-inputs workspace-id)]
    (if-not (:database_details workspace)
      ;; TODO (Chris 2025-12-15) -- this should throw, but we're cautious about racing with initialization
      #_(throw (ex-info "No database details, unable to grant read only access to the service account." {}))
      (log/warn "No database details, unable to grant read only access to the service account.")
      (when (seq ungranted-inputs)
        (let [database (t2/select-one :model/Database :id (:database_id workspace))
              tables   (mapv external-input->table ungranted-inputs)]
          (try
            (ws.isolation/grant-read-access-to-tables! database workspace tables)
            ;; Mark inputs as granted after successful grant
            (t2/update! :model/WorkspaceInput {:id [:in (map :id ungranted-inputs)]}
                        {:access_granted true})
            (catch Exception e
              ;; Suppress errors for tables that don't exist (common in tests with fake tables)
              (when-not (some->> (ex-message e) (re-find #"(?i)(does not exist|not found|no such table)"))
                (log/warn e "Error granting RO table permissions")))))))))

(defn grant-accesses-if-superuser!
  "Grant read access to external input tables if the current user is a superuser.
   Wrapper around sync-grant-accesses! that checks superuser permission."
  [workspace]
  (when api/*is-superuser?*
    (sync-grant-accesses! workspace)))

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

(defn table-ids-fallbacks
  "Given a list of maps holding [db_id schema table], return a mapping from those tuples => table_id"
  ([table-refs]
   (table-ids-fallbacks :schema :name :id table-refs))
  ([schema-key table-key id-key table-refs]
   (when-let [table-refs (seq (remove id-key table-refs))]
     ;; These are ordered by db, so this will partition fine.
     (u/for-map [table-refs (partition-by :db_id table-refs)
                 :let [db_id (:db_id (first table-refs))]
                 ;; Guesstimating a number that prevents this query being too large.
                 table-refs (partition-all 20 table-refs)
                 map-entry (batch-lookup-table-ids db_id schema-key table-key table-refs)]
       map-entry))))

(defn- add-table-mapping-entries
  "Add table mapping entries for a single table.
   Adds:
   - [db-id schema table] -> replacement (for qualified SQL references)
   - table-id             -> replacement (for MBQL/Python, if table-id provided)
   - [db-id nil table]    -> replacement (for unqualified SQL, if in-default-schema? is true)"
  [m {:keys [db-id schema table table-id replacement in-default-schema?]}]
  (cond-> m
    true             (assoc [db-id schema table] replacement)
    table-id         (assoc table-id replacement)
    in-default-schema? (assoc [db-id nil table] replacement)))

(defn- quote-name [driver s] (when s (sql.util/quote-name driver :table s)))

(defn- quote-default-schema
  "Return the quoted default schema for a database.
   Pre-quotes the name because it will be spliced into SQL for unqualified references
   (e.g. `orders` → `\"public\".\"orders\"` or `test-data`.`orders`).
   These names don't appear in the original SQL, so macaw won't quote them for us."
  [{:keys [engine details]}]
  (quote-name engine (or (driver.sql/default-schema engine)
                         ;; For MySQL and similar, use database name from connection details
                         ((some-fn :dbname :db) details))))

(defn- build-remapping
  "Build table remapping from the analyzed input and output tables.

   Uses stored WorkspaceOutput, WorkspaceOutputExternal, WorkspaceInput, and WorkspaceInputExternal data.

   For OUTPUTS (isolated tables):
   Maps [db_id global_schema global_table] -> {:db-id :schema :table :id} for isolated tables.
   Also maps global_table_id -> same. This is more convenient and reliable for MBQL queries and Python transforms.
   Also maps [db_id nil global_table] for tables in the default schema, so unqualified SQL references work.

   For INPUTS (external tables read from source DB):
   Maps [db_id schema table] -> {:db-id :schema :table :id} to qualify references.
   This ensures \"SELECT * FROM orders\" becomes \"SELECT * FROM public.orders\" (or \"mydb.orders\" for MySQL).

   Output mappings take precedence over input mappings (merged last).
   This is used to remap queries, sources and targets to reflect the \"isolated\" tables used to seal the Workspace."
  [workspace _graph]
  (let [outputs          (t2/select [:model/WorkspaceOutput
                                     :db_id :global_schema :global_table :global_table_id
                                     :isolated_schema :isolated_table :isolated_table_id]
                                    :workspace_id (:id workspace))
        external-outputs (t2/select [:model/WorkspaceOutputExternal
                                     :db_id :global_schema :global_table :global_table_id
                                     :isolated_schema :isolated_table :isolated_table_id]
                                    :workspace_id (:id workspace))
        all-outputs      (concat outputs external-outputs)
        ;; Fetch input tables (external tables that transforms read from)
        inputs           (t2/select [:model/WorkspaceInput :db_id :schema :table :table_id]
                                    :workspace_id (:id workspace))
        external-inputs  (t2/select [:model/WorkspaceInputExternal :db_id :schema :table :table_id]
                                    :workspace_id (:id workspace))
        all-inputs       (concat inputs external-inputs)
        ;; Get default schema for each database involved (both inputs and outputs).
        ;; For databases with schemas (PostgreSQL), this is the default schema (e.g., "public").
        ;; For databases without schemas (MySQL), we use the database name from connection details.
        db-ids           (into #{} (map :db_id) (concat all-outputs all-inputs))
        databases        (when (seq db-ids)
                           (t2/select [:model/Database :id :engine :details] :id [:in db-ids]))
        db-id->default   (u/index-by :id
                                     (fn [{:keys [engine details]}]
                                       (or (driver.sql/default-schema engine)
                                           ((some-fn :dbname :db) details)))
                                     databases)
        db-id->quoted    (u/index-by :id quote-default-schema databases)
        fallback-map     (merge
                          (table-ids-fallbacks :global_schema :global_table :global_table_id all-outputs)
                          (table-ids-fallbacks :isolated_schema :isolated_table :isolated_table_id all-outputs))
        ;; Build output mappings (remap to isolated tables)
        output-map       (reduce
                          (fn [m {:keys [db_id global_schema global_table global_table_id
                                         isolated_schema isolated_table isolated_table_id]}]
                            (add-table-mapping-entries m
                                                       {:db-id              db_id
                                                        :schema             global_schema
                                                        :table              global_table
                                                        :table-id           (or global_table_id
                                                                                (fallback-map [db_id global_schema global_table]))
                                                        :replacement        {:db-id  db_id
                                                                             :schema isolated_schema
                                                                             :table  isolated_table
                                                                             :id     (or isolated_table_id
                                                                                         (fallback-map [db_id isolated_schema isolated_table]))}
                                                        :in-default-schema? (= global_schema (db-id->default db_id))}))
                          {}
                          all-outputs)
        ;; Build input mappings (qualify unqualified references to external tables).
        ;; For inputs, we only need to add a mapping for unqualified references (nil schema).
        ;; When the table already has an explicit schema, Macaw will preserve it as-is.
        input-map        (reduce
                          (fn [m {:keys [db_id schema table table_id]}]
                            (let [quoted-schema (db-id->quoted db_id)]
                              ;; Only add a mapping for unqualified references (nil schema).
                              ;; When the table already has an explicit schema, Macaw preserves it.
                              (cond-> m
                                (and (nil? schema) (some? quoted-schema))
                                (assoc [db_id nil table] {:db-id  db_id
                                                          :schema quoted-schema
                                                          :table  table
                                                          :id     table_id}))))
                          {}
                          all-inputs)
        ;; Merge with outputs taking precedence
        table-map        (merge input-map output-map)]
    {:tables          table-map
     ;; We never want to write to any global tables, so remap on-the-fly if we hit an un-mapped target.
     :target-fallback (fn [[d s t]]
                        (log/warn "Missing remapping for" {:db d :schema s, :table t})
                        {:db-id d, :schema (:schema workspace), :table (ws.u/isolated-table-name s t), :id nil})
     ;; We won't need the field-map until we support MBQL.
     :fields          nil}))

(defn- backfill-isolated-table-id!
  "Backfill workspace_output.isolated_table_id FK in the case where we just created the table for the first time."
  [ref-id]
  (when-let [table-id (:id (t2/query-one
                            {:from   [[:workspace_output :wo]]
                             :join   [[:metabase_table :t] [:and
                                                            [:= :t.db_id :wo.db_id]
                                                            [:= :t.schema :wo.isolated_schema]
                                                            [:= :t.name :wo.isolated_table]]]
                             :select [:t.id]
                             :where  [:and
                                      [:= :wo.ref_id ref-id]
                                      [:or [:= :wo.isolated_table_id nil] [:not= :t.id :wo.isolated_table_id]]]}))]
    (t2/update! :model/WorkspaceOutput {:ref_id ref-id} {:isolated_table_id table-id})))

(defn- backfill-external-isolated-table-id!
  "Backfill workspace_output_external.isolated_table_id FK after running an enclosed external transform."
  [transform-id]
  (when-let [table-id (:id (t2/query-one
                            {:from   [[:workspace_output_external :woe]]
                             :join   [[:metabase_table :t] [:and
                                                            [:= :t.db_id :woe.db_id]
                                                            [:= :t.schema :woe.isolated_schema]
                                                            [:= :t.name :woe.isolated_table]]]
                             :select [:t.id]
                             :where  [:and
                                      [:= :woe.transform_id transform-id]
                                      [:or [:= :woe.isolated_table_id nil] [:not= :t.id :woe.isolated_table_id]]]}))]
    (t2/update! :model/WorkspaceOutputExternal {:transform_id transform-id} {:isolated_table_id table-id})))

(defn- db-time
  "Returns the current timestamp from the database. Avoids timezone differences and clock skew with app server."
  []
  (:t (first (t2/query {:select [[:%now :t]]}))))

(defn- node-type-id-xf
  "Create a transducer that filters nodes by type and extracts IDs."
  [node-type]
  (keep #(when (= node-type (:node-type %)) (:id %))))

(defn- node-type-id-rf
  "Create a reducing function that filters nodes by type and extracts IDs."
  [node-type]
  ((node-type-id-xf node-type) conj))

(defn- workspace-transform-ids
  "Extract ref-ids from nodes that are workspace transforms."
  [nodes]
  (into [] (node-type-id-xf :workspace-transform) nodes))

(declare get-or-calculate-graph!)

(defn upstream-nodes
  "Given a graph and a workspace transform ref-id, find all upstream nodes (all node types).
   Returns a set of {:node-type ... :id ...} maps (not including the starting node).

   Takes a graph with :dependencies map (child->parents) and traverses upstream."
  [graph ref-id]
  (when-let [deps-map (:dependencies graph)]
    (ws.dag/bfs-reduce deps-map [{:node-type :workspace-transform, :id ref-id}]
                       :init #{}
                       :rf (fn [acc entity]
                             (conj acc (select-keys entity [:node-type :id]))))))

(defn upstream-ids
  "Given a graph, filter node-type, and workspace transform ref-id, find upstream node IDs.
   Returns IDs of upstream nodes matching the filter-type (not including the starting node).

   Takes a graph with :dependencies map (child->parents) and traverses upstream."
  [graph filter-type ref-id]
  (when-let [deps-map (:dependencies graph)]
    (ws.dag/bfs-reduce deps-map [{:node-type :workspace-transform, :id ref-id}]
                       :rf (node-type-id-rf filter-type))))

(defn downstream-nodes
  "Given a graph and a workspace transform ref-id, find all downstream nodes (all node types).
   Returns a set of {:node-type ... :id ...} maps (not including the starting node).

   Takes a graph with :dependencies map (child->parents), reverses it for downstream traversal."
  [graph ref-id]
  (when-let [deps-map (:dependencies graph)]
    (let [forward-edges (ws.dag/reverse-graph deps-map)]
      (ws.dag/bfs-reduce forward-edges [{:node-type :workspace-transform, :id ref-id}]
                         :init #{}
                         :rf (fn [acc entity]
                               (conj acc (select-keys entity [:node-type :id])))))))

(defn downstream-ids
  "Given a graph, filter node-type, and workspace transform ref-id, find downstream node IDs.
   Returns IDs of downstream nodes matching the filter-type (not including the starting node).

   Takes a graph with :dependencies map (child->parents), reverses it for downstream traversal."
  [graph filter-type ref-id]
  (when-let [deps-map (:dependencies graph)]
    (let [forward-edges (ws.dag/reverse-graph deps-map)]
      (ws.dag/bfs-reduce forward-edges [{:node-type :workspace-transform, :id ref-id}]
                         :rf (node-type-id-rf filter-type)))))

(defn- any-internal-ancestor-stale?
  "Check if any in-workspace entity ancestor is stale.
   Returns true if any ancestor had its definition or input data changed since it last ran.
   Note: external transforms are not checked here, their staleness must be checked separately."
  [graph workspace ref-id]
  (when-let [ids (seq (upstream-ids graph :workspace-transform ref-id))]
    (t2/exists? :model/WorkspaceTransform
                :workspace_id (:id workspace)
                :ref_id [:in ids]
                {:where [:or
                         [:= :definition_changed true]
                         [:= :input_data_changed true]]})))

(defn- mark-descendants-input-datastale!
  "Mark all transitive downstream workspace transforms as input_data_changed.
   Traverses the dependency graph downward from the given transform."
  [graph workspace ref-id]
  (when-let [ids (seq (downstream-ids graph :workspace-transform ref-id))]
    (t2/update! :model/WorkspaceTransform
                {:workspace_id (:id workspace)
                 :ref_id [:in ids]}
                {:input_data_changed true})))

(defn run-transform!
  "Execute the given workspace transform or enclosed external transform."
  ([workspace graph transform]
   (run-transform! workspace graph transform (build-remapping workspace graph)))
  ([workspace graph transform remapping]
   (let [ref-id      (:ref_id transform)
         external-id (:id transform)
         start-time  (db-time)
         result      (try
                       (ws.isolation/with-workspace-isolation
                         workspace
                         (ws.execute/run-transform-with-remapping transform remapping))
                       (catch Exception e
                         (log/errorf e "Failed to execute %s transform %s"
                                     (if ref-id "workspace" "external")
                                     (or ref-id external-id))
                         {:status     :failed
                          :message    (ex-message e)
                          :start_time start-time
                          :end_time   (db-time)
                          :table      (select-keys (ws.execute/remapped-target transform remapping) [:schema :name])}))]
     ;; We don't currently keep any record of when enclosed transforms were run.
     (when ref-id
       (let [succeeded? (= :succeeded (:status result))
             pre-stale? (any-internal-ancestor-stale? graph workspace ref-id)]
         (t2/update! :model/WorkspaceTransform {:ref_id ref-id :workspace_id (:id workspace)}
                     (cond-> {:last_run_at      (:end_time result)
                              :last_run_status  (some-> (:status result) name)
                              :last_run_message (:message result)}
                       ;; On success, always clear definition_changed
                       succeeded? (assoc :definition_changed false)
                       ;; On success, clear input_data_changed only if no ancestors are stale
                       (and succeeded? (not pre-stale?))
                       (assoc :input_data_changed false)))
         ;; Always mark transitive downstream as stale when we run successfully
         ;; (their input data may have changed even if nothing was "stale")
         (when succeeded?
           (mark-descendants-input-datastale! graph workspace ref-id))))
     (when (= :succeeded (:status result))
       (if ref-id
         ;; Workspace transform
         (backfill-isolated-table-id! ref-id)
         ;; External transform (enclosed in workspace)
         (backfill-external-isolated-table-id! external-id)))
     result)))

(defn dry-run-transform
  "Execute the given workspace transform without persisting to the target table.
   Returns the first 2000 rows of transform output for preview purposes."
  [workspace graph transform]
  (ws.isolation/with-workspace-isolation
    workspace
    (ws.execute/run-transform-preview transform (build-remapping workspace graph))))

(defn execute-adhoc-query
  "Execute an arbitrary SQL query in the workspace's isolated database context.
   Applies workspace table remapping so queries can reference global table names.
   Options: :row-limit (default 2000).
   Returns a ::ws.t/query-result."
  [{db-id :database_id :as workspace} graph sql & {:as opts}]
  (ws.isolation/with-workspace-isolation
    workspace
    (ws.execute/execute-adhoc-sql db-id sql (build-remapping workspace graph) opts)))

;;;; ---------------------------------------- External Transform Sync ----------------------------------------

(defn- extract-external-transform-ids
  "Extract IDs of external transforms from graph entities."
  [entities]
  (into [] (comp (filter #(= :external-transform (:node-type %)))
                 (map :id))
        entities))

(defn- normalize-table-schema
  "Normalize a table's schema: replace nil with the driver's default schema.
   Takes a map of db_id -> default-schema for lookup."
  [db-id->default-schema {:keys [db_id schema] :as table}]
  (if (some? schema)
    table
    (assoc table :schema (get db-id->default-schema db_id))))

;;;; ---------------------------------------- Epochal Versioning ----------------------------------------
;; Two-level versioning for thread-safe graph calculation:
;; - Transform level: analysis_version on workspace_transform, transform_version on workspace_input/workspace_output
;; - Graph level: graph_version on workspace, workspace_graph, workspace_input_external, workspace_output_external

(defn increment-graph-version!
  "Atomically increment graph_version for a workspace. Used to invalidate cached analysis."
  [workspace-id]
  (t2/update! :model/Workspace workspace-id {:graph_version [:+ :graph_version 1]}))

(defn increment-analysis-version!
  "Atomically increment analysis_version for a transform. Used to invalidate cached analysis."
  [workspace-id ref-id]
  ;; definition_changed is also set by the WorkspaceTransform before-update hook when source/target changes,
  ;; but we set it here as well since this function is also called for unarchive (where source/target don't change).
  (t2/update! :model/WorkspaceTransform
              {:workspace_id workspace-id, :ref_id ref-id}
              {:analysis_version [:+ :analysis_version 1]
               :definition_changed true}))

;;;; ---------------------------------------- Lazy Graph Calculation ----------------------------------------

(defn- workspace-transforms
  "Return the entity values for the internal transforms."
  [ws-id]
  (t2/select-fn-vec (fn [{:keys [ref_id]}] {:entity-type :transform :id ref_id})
                    [:model/WorkspaceTransform :ref_id]
                    :workspace_id ws-id))

(defn- calculate-graph
  "Calculate the dependency graph for a workspace.
   Returns the graph without caching - caller is responsible for caching."
  [ws-id]
  (ws.dag/path-induced-subgraph ws-id (workspace-transforms ws-id)))

(defn- cleanup-old-transform-versions!
  "Delete obsolete analysis for a given workspace transform."
  [ws-id ref-id]
  (doseq [model [:model/WorkspaceOutput :model/WorkspaceInputTransform]]
    ;; Use a subselect to avoid left over gunk from race conditions.
    (t2/delete! model
                :workspace_id ws-id
                :ref_id ref-id
                {:where [:< :transform_version {:select [:analysis_version]
                                                :from   [:workspace_transform]
                                                :where  [:and
                                                         [:= :workspace_id ws-id]
                                                         [:= :ref_id ref-id]]}]})))

(defn- cleanup-old-graph-versions!
  "Delete obsolete graph-level rows."
  [ws-id]
  (doseq [model [:model/WorkspaceGraph
                 :model/WorkspaceInputExternal
                 :model/WorkspaceOutputExternal]]
    (t2/delete! model
                :workspace_id ws-id
                ;; Use a subselect to avoid left over gunk from race conditions.
                {:where [:< :graph_version {:select [:graph_version]
                                            :from   [:workspace]
                                            :where  [:= :id ws-id]}]})))

(defn- analyze-transform!
  "Analyze a transform and write its outputs/inputs with the given transform_version.
   Called when the transform's output doesn't exist for current analysis_version."
  [{ws-id :id, isolated-schema :schema :as _workspace}
   {:keys [ref_id analysis_version] :as transform}]
  (let [analysis (ws.deps/analyze-entity :transform transform)]
    (ws.deps/write-entity-analysis! ws-id isolated-schema :transform ref_id analysis analysis_version)
    (cleanup-old-transform-versions! ws-id ref_id)))

(defn- analyze-stale-transforms!
  "Analyze transforms where workspace_output doesn't exist for current analysis_version.
   Skips transforms that haven't changed since last analysis.
   Returns true if any transforms were analyzed."
  [{ws-id :id, db-status :db_status :as workspace}]
  ;; Find transforms needing analysis: those without output at current analysis_version
  (let [stale-transforms (t2/select :model/WorkspaceTransform
                                    ;; Ordering is only for determinism in tests.
                                    {:order-by [:updated_at]
                                     :where    [:and
                                                [:= :workspace_transform.workspace_id ws-id]
                                                [:not [:exists
                                                       {:select [1]
                                                        :from   [[:workspace_output :wo]]
                                                        :where  [:and
                                                                 [:= :wo.workspace_id ws-id]
                                                                 [:= :wo.ref_id :workspace_transform.ref_id]
                                                                 [:= :wo.transform_version
                                                                  :workspace_transform.analysis_version]]}]]]})]
    ;; Analyze each stale transform
    (doseq [transform stale-transforms]
      (analyze-transform! workspace transform))
    ;; Grant any missing read access. Do this even if no transforms were stale, as we may have been unable to grant
    ;; some permissions previously (insufficient permissions, table didn't exist yet, etc.)
    (when (= :ready db-status)
      (grant-accesses-if-superuser! workspace))
    (boolean (seq stale-transforms))))

(defn analyze-transform-if-stale!
  "Analyze a single transform if its workspace_output doesn't exist for current analysis_version.
   Used before running a transform to ensure grants are up-to-date."
  [{ws-id :id :as workspace} {:keys [ref_id analysis_version] :as transform}]
  (when-not (ws.deps/transform-output-exists-for-version? ws-id ref_id analysis_version)
    (analyze-transform! workspace transform)
    (grant-accesses-if-superuser! workspace)))

(defn- insert-workspace-graph!
  "Insert a new graph for the given version. Silently ignores constraint violations
   from concurrent inserts (another process already inserted this version)."
  [ws-id graph-version graph]
  (when-not (t2/exists? :model/WorkspaceGraph
                        :workspace_id  ws-id
                        :graph_version [:>= graph-version])
    (ws.u/ignore-constraint-violation
     (t2/insert! :model/WorkspaceGraph
                 {:workspace_id  ws-id
                  :graph_version graph-version
                  :graph         graph}))))

(defn- insert-external-outputs-for-version!
  "Sync workspace_output_external for a specific graph version.
   Creates new rows with graph_version set. Silently ignores constraint violations."
  [workspace-id isolated-schema entities graph-version]
  (when-not (t2/exists? :model/WorkspaceOutputExternal :workspace_id workspace-id :graph_version [:>= graph-version])
    (let [external-tx-ids (extract-external-transform-ids entities)]
      (when (seq external-tx-ids)
        (let [transforms (t2/select [:model/Transform :id :target] :id [:in external-tx-ids])
              rows       (for [{tx-id :id, {:keys [database schema name]} :target} transforms]
                           (let [isolated-table    (ws.u/isolated-table-name schema name)
                                 ;; TODO (Chris 2026-01-26) -- 2N + 1 is really not great here...
                                 global-table-id   (t2/select-one-fn :id [:model/Table :id]
                                                                     :db_id database :schema schema :name name)
                                 isolated-table-id (t2/select-one-fn :id [:model/Table :id]
                                                                     :db_id database
                                                                     :schema isolated-schema
                                                                     :name isolated-table)]
                             {:workspace_id      workspace-id
                              :transform_id      tx-id
                              :graph_version     graph-version
                              :db_id             database
                              :global_schema     schema
                              :global_table      name
                              :global_table_id   global-table-id
                              :isolated_schema   isolated-schema
                              :isolated_table    isolated-table
                              :isolated_table_id isolated-table-id}))]
          (when (seq rows)
            (ws.u/ignore-constraint-violation
             (t2/insert! :model/WorkspaceOutputExternal rows))))))))

(defn- insert-external-inputs-for-version!
  "Write `workspace_input_external` for a specific graph version, unless they (or a new version) already have been."
  [workspace-id entities graph-version]
  (when-not (t2/exists? :model/WorkspaceInputExternal :workspace_id workspace-id :graph_version [:>= graph-version])
    (let [external-tx-ids (extract-external-transform-ids entities)]
      (when (seq external-tx-ids)
        (let [input-tables         (t2/select [:model/Dependency :to_entity_id]
                                              :from_entity_type :transform
                                              :from_entity_id [:in external-tx-ids]
                                              :to_entity_type :table)
              input-table-ids      (into #{} (map :to_entity_id) input-tables)
              ;; Get workspace output table IDs (both workspace and external outputs)
              workspace-output-ids (t2/select-fn-set :global_table_id
                                                     [:model/WorkspaceOutput :global_table_id]
                                                     :workspace_id workspace-id
                                                     {:where [:not= :global_table_id nil]})
              external-output-ids  (t2/select-fn-set :global_table_id
                                                     [:model/WorkspaceOutputExternal :global_table_id]
                                                     :workspace_id workspace-id
                                                     :graph_version graph-version
                                                     {:where [:not= :global_table_id nil]})
              all-output-ids       (set/union workspace-output-ids external-output-ids)
              external-input-ids   (set/difference input-table-ids all-output-ids)]
          (when (seq external-input-ids)
            (let [tables                (t2/select [:model/Table :id :db_id :schema :name] :id [:in external-input-ids])
                  db-ids                (into #{} (map :db_id) tables)
                  db-id->default-schema (when (seq db-ids)
                                          (into {}
                                                (map (fn [{:keys [id engine]}]
                                                       [id (driver.sql/default-schema engine)]))
                                                (t2/select [:model/Database :id :engine] :id [:in db-ids])))
                  normalized-tables     (map (partial normalize-table-schema db-id->default-schema) tables)]
              (when (seq normalized-tables)
                (ws.u/ignore-constraint-violation
                 (t2/insert! :model/WorkspaceInputExternal
                             (for [{:keys [id db_id schema name]} normalized-tables]
                               {:workspace_id   workspace-id
                                :graph_version  graph-version
                                :db_id          db_id
                                :schema         schema
                                :table          name
                                :table_id       id
                                :access_granted false})))))))))))

(defn- fully-persisted-graph
  "Fetch the latest graph for which all the related tables have all been populated, that meets a minimum version.
   Returns nil if no sufficiently recent graph, with all its derivatives persisted, exists.
   It uses a subselect to avoid races where the latest version could be superseded and deleted before we can fetch it."
  [ws-id min-version]
  (t2/select-one-fn :graph
                    [:model/WorkspaceGraph :graph]
                    :workspace_id ws-id
                    :graph_version [:>= min-version]
                    {:order-by [[:workspace_graph.graph_version :desc]]
                     :limit    1}))

(defn- graph-with-minimum-version
  "Fetch the latest graph (and its version) that meets a minimum version constraint."
  [ws-id min-version]
  (t2/select-one [:model/WorkspaceGraph :graph [:graph_version :version]]
                 :workspace_id ws-id
                 {:where    [:>= :workspace_graph.graph_version min-version]
                  :order-by [[:workspace_graph.graph_version :desc]]
                  :limit    1}))

(defn- calculate-and-persist-graph!
  "Return a graph for version > min-version.

   Non-blocking implementation that uses epochal steps to avoid co-ordination while providing workable consistency.
   If at any step we find results for a later version, we proceed to calculating (if necessary) that version.
   In the best case, we find complete results for the latest version and simply return them, without any computation.

   The analysis is computed in various stages, and written to the following tables in the given order:

   1. workspace_input  (per tx)
   2. workspace_output (per tx, marks that we're done for that tx)
   3. workspace_graph
   4. workspace_input_external
   5. workspace_output_external

   Returns the graph."
  [{ws-id :id, isolated-schema :schema :as workspace} min-version]
  ;; Analyze transforms that need it (transform-level versioning)
  ;; This writes workspace_input and workspace_output.
  (analyze-stale-transforms! workspace)
  ;; See if there's already a computed graph we can use, otherwise compute a new one.
  (let [{:keys [graph version]} (graph-with-minimum-version ws-id min-version)
        graph   (or graph
                    ;; Note that we can't freeze the versions of the transform's input and outputs, used to
                    ;; calculate the graph, they don't use the same version numbering.
                    ;; Instead, it will use the latest version across its various reads.
                    ;; This means the graph is only eventually consistent - it doesn't have snapshot consistency
                    ;; across the reads we make to the transforms. There are perverse cases where this can lead
                    ;; to cycles or other data defects. Since such a graph will itself be stale, we will recover
                    ;; from those defects on the next read.
                    (u/prog1 (calculate-graph ws-id)
                      (insert-workspace-graph! ws-id min-version <>)))
        version (or version min-version)
        ;; Write workspace_input_external if needed, bump version if we have been overtaken.
        _ (insert-external-inputs-for-version! ws-id (:entities graph) version)
        ;; Write workspace_output_external if needed, bump version if we have been overtaken.
        _ (insert-external-outputs-for-version! ws-id isolated-schema (:entities graph) version)]
    (log/debugf "Have graph for workspace %d at version %d (target was %d)" ws-id version min-version)
    ;; Discard any obsolete rows (including our own, if we've been overtaken)
    (cleanup-old-graph-versions! ws-id)
    ;; If there's an even more recent version in the database now, return that.
    ;; This decreases the chance of returning a graph with transient corruption.
    (or (graph-with-minimum-version ws-id (inc version)) graph)))

(defn- fetch-staleness-map
  "Fetch staleness flags for workspace transforms from the database.
   Returns a map of ref-id -> {:definition_changed bool, :input_data_changed bool}.
   Only fetches rows where at least one flag is true; callers can rely on nil-punning
   for missing entries (missing = not stale)."
  [ws-id ref-ids]
  (when (seq ref-ids)
    (t2/select-fn->fn :ref_id #(select-keys % [:definition_changed :input_data_changed])
                      :model/WorkspaceTransform
                      :workspace_id ws-id
                      :ref_id [:in ref-ids]
                      {:where [:or
                               [:= :definition_changed true]
                               [:= :input_data_changed true]]})))

(defn- workspace-transform? [entity]
  (= :workspace-transform (:node-type entity)))

(defn- external-transform? [entity]
  (= :external-transform (:node-type entity)))

(defn- transform? [entity]
  (#{:workspace-transform :external-transform} (:node-type entity)))

(defn annotate-staleness
  "Annotate graph entities with transitive staleness given a staleness-map.
   An entity is stale if:
   - Its definition_changed is true (definition changed since last run), OR
   - Its input_data_changed is true (input data changed since last run), OR
   - Any of its ancestors are stale (transitively)

   Takes a graph and a staleness-map: {entity-id -> {:definition_changed bool, :input_data_changed bool}}
   Returns updated graph with :stale, :definition_changed, :input_data_changed on each transform entity.

   This propagates staleness down the graph using a BFS from all initially stale nodes.
   Both workspace transforms and external transforms are marked as stale so they can be
   executed in the correct toposorted order."
  [graph staleness-map]
  (let [locally-stale? (fn [entity]
                         (let [staleness (get staleness-map (:id entity))]
                           (or (:definition_changed staleness)
                               (:input_data_changed staleness))))
        init-stale     (filter (every-pred workspace-transform? locally-stale?)
                               (:entities graph))
        forward-edges  (some-> (:dependencies graph) ws.dag/reverse-graph)
        ;; BFS traverses through ALL nodes (including external transforms) to find all stale transforms
        all-reachable  (if forward-edges
                         (ws.dag/bfs-reduce forward-edges init-stale :include-start? true :init #{})
                         (set init-stale))
        ;; Include both workspace and external transforms in the stale set
        all-stale      (set (filter transform? all-reachable))
        annotate       (fn [entity]
                         (cond
                           (workspace-transform? entity)
                           (-> entity
                               (merge (get staleness-map (:id entity)
                                           {:definition_changed false :input_data_changed false}))
                               (assoc :stale (contains? all-stale entity)))

                           (external-transform? entity)
                           (assoc entity :stale (contains? all-stale entity))

                           :else
                           entity))]
    (update graph :entities #(mapv annotate %))))

(defn with-staleness
  "Annotate graph entities with transitive staleness.
   Takes a workspace and a graph, fetches staleness from the database, and annotates the graph.
   Returns updated graph with :stale, :definition_changed, :input_data_changed on each workspace transform entity.

   Use `annotate-staleness` directly if you already have a staleness-map."
  [{ws-id :id} graph]
  (let [staleness-map (->> (:entities graph) workspace-transform-ids (fetch-staleness-map ws-id))]
    (annotate-staleness graph staleness-map)))

(defn get-or-calculate-graph!
  "Return the dependency graph for a workspace.
   Uses cached graph if version matches, otherwise recalculates it.
   Thread-safe via epochal versioning.
   Also syncs workspace_output_external and workspace_input_external tables when recalculating.

   Use `with-staleness` to annotate the graph with transitive staleness."
  [{ws-id :id, graph-version :graph_version :as workspace}]
  (or (fully-persisted-graph ws-id graph-version)
      (calculate-and-persist-graph! workspace graph-version)))

(defn- entities->transforms
  "Given a workspace-id and a sequence of graph entities, fetch the corresponding transform records.
   Returns transforms in the same order as the input entities."
  [ws-id entities]
  (let [type->ids (u/group-by :node-type :id entities)
        id->tx    (merge
                   {}
                   (when-let [ids (seq (type->ids :external-transform))]
                     (t2/select-fn->fn :id identity
                                       [:model/Transform :id :name :source :target]
                                       :id [:in ids]))
                   (when-let [ref-ids (seq (type->ids :workspace-transform))]
                     (t2/select-fn->fn :ref_id identity
                                       [:model/WorkspaceTransform :ref_id :name :source :target]
                                       :workspace_id ws-id
                                       :ref_id [:in ref-ids])))]
    (keep (comp id->tx :id) entities)))

(defn- transforms-to-execute
  "Given a workspace, graph, and an optional filter, return the global and workspace definitions to run, in order."
  [{ws-id :id :as workspace} graph & {:keys [stale-only?]}]
  (let [graph    (cond->> graph
                   stale-only? (with-staleness workspace))
        entities (cond->> (:entities graph)
                   stale-only? (filter :stale))]
    (entities->transforms ws-id entities)))

(defn- id->str [ref-id-or-id]
  (if (string? ref-id-or-id)
    ref-id-or-id
    (str "global-id:" ref-id-or-id)))

(defn- ungranted-transform-ref-ids
  "Return the set of workspace transform ref-ids that have at least one ungranted input
   at their current (max) transform version. str/trim is needed because ref_id is char(36)
   which pads with trailing spaces."
  [ws-id]
  (into #{}
        (map (comp str/trim :ref_id))
        (t2/query {:select-distinct [:wit.ref_id]
                   :from            [[:workspace_input_transform :wit]]
                   :join            [[:workspace_input :wi]
                                     [:= :wi.id :wit.workspace_input_id]]
                   :where           [:and
                                     [:= :wit.workspace_id ws-id]
                                     [:= :wi.access_granted false]
                                     [:= :wit.transform_version
                                      {:select [[:%max.transform_version]]
                                       :from   [[:workspace_input_transform :wit2]]
                                       :where  [:and
                                                [:= :wit2.workspace_id ws-id]
                                                [:= :wit2.ref_id :wit.ref_id]]}]]})))

(defn execute-workspace!
  "Execute all the transforms within a given workspace.
   Skips transforms whose inputs have not been granted access."
  [workspace graph & {:keys [stale-only?] :or {stale-only? false}}]
  (let [ws-id     (:id workspace)
        remapping (build-remapping workspace graph)
        ungranted-ref-ids (ungranted-transform-ref-ids ws-id)]
    (reduce
     (fn [acc {external-id :id ref-id :ref_id :as transform}]
       (let [node-type (if external-id :external-transform :workspace-transform)
             id-str    (id->str (or external-id ref-id))]
         ;; TODO: external transforms may also have ungranted inputs (via external inputs table)
         (if (and ref-id (contains? ungranted-ref-ids ref-id))
           (update acc :not_run conj id-str)
           (try
             (if (= :succeeded (:status (run-transform! workspace graph transform remapping)))
               (update acc :succeeded conj id-str)
               (update acc :failed conj id-str))
             (catch Exception e
               (log/error e "Failed to execute transform" {:workspace-id ws-id :node-type node-type :id id-str})
               (update acc :failed conj id-str))))))
     {:succeeded []
      :failed    []
      :not_run   []}
     (transforms-to-execute workspace graph {:stale-only? stale-only?}))))

(defn- stale-ancestors-to-execute
  "Given a workspace, graph, and target ref-id, return the stale ancestor transforms to run, in dependency order.
   Only returns transforms that are both ancestors of the target AND stale.
   Includes both workspace transforms and external transforms in the ancestor chain."
  [{ws-id :id} graph ref-id]
  (let [ancestor-keys     (upstream-nodes graph ref-id)
        ancestor?         (fn [entity] (contains? ancestor-keys (select-keys entity [:node-type :id])))
        ancestor-entities (filter ancestor? (:entities graph))
        ;; Build a subgraph with only ancestor entities and their inter-dependencies
        ;; Dependencies map is keyed by entities (maps with :id), not by IDs directly
        ancestor-deps     (into {}
                                (keep (fn [[to-entity from-list]]
                                        (when (ancestor? to-entity)
                                          [to-entity (filterv ancestor? from-list)]))
                                      (:dependencies graph)))
        ancestor-graph    {:entities     ancestor-entities
                           :dependencies ancestor-deps}
        ;; Only fetch staleness for ancestors, not the entire graph
        ancestor-ref-ids  (workspace-transform-ids ancestor-entities)
        staleness-map     (fetch-staleness-map ws-id ancestor-ref-ids)
        annotated-graph   (annotate-staleness ancestor-graph staleness-map)
        stale-entities    (filter :stale (:entities annotated-graph))]
    (entities->transforms ws-id stale-entities)))

(defn run-stale-ancestors!
  "Run all stale ancestors of a given transform in dependency order.
   Stops on first failure, marking remaining transforms as not_run.
   Returns a map with :succeeded, :failed, and :not_run lists of ref-ids/transform-ids."
  [workspace graph ref-id]
  (let [ws-id     (:id workspace)
        remapping (build-remapping workspace graph)]
    (reduce
     (fn [acc {external-id :id tx-ref-id :ref_id :as transform}]
       (let [node-type (if external-id :external-transform :workspace-transform)
             id-str    (id->str (or external-id tx-ref-id))]
         (if (seq (:failed acc))
           ;; Skip execution if any previous transform failed
           (update acc :not_run conj id-str)
           (let [result (try
                          (run-transform! workspace graph transform remapping)
                          (catch Exception e
                            {:status  :failed
                             :message (ex-message e)
                             :error   e}))]
             (if (= :succeeded (:status result))
               (update acc :succeeded conj id-str)
               (let [log-data {:workspace-id ws-id :node-type node-type :id id-str :result (dissoc result :error)}]
                 (if-let [e (:error result)]
                   (log/error e "Failed to execute ancestor transform" log-data)
                   (log/error "Failed to execute ancestor transform" log-data))
                 (update acc :failed conj id-str)))))))
     {:succeeded []
      :failed    []
      :not_run   []}
     (stale-ancestors-to-execute workspace graph ref-id))))
