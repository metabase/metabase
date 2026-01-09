(ns metabase-enterprise.workspaces.impl
  "Glue code connecting workspace subsystems (dependencies, isolation)."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.workspaces.dag :as ws.dag]
   [metabase-enterprise.workspaces.dependencies :as ws.deps]
   [metabase-enterprise.workspaces.execute :as ws.execute]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.driver.sql :as driver.sql]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- query-ungranted-external-inputs
  "Query for external inputs in a workspace that haven't been granted access yet.
   External inputs are tables that are not shadowed by any output.
   Returns seq of WorkspaceInput records where access_granted is false."
  [workspace-id]
  ;; It would be nice if we could optimize this join to use table_id.
  ;; In the case where the table doesn't exist yet (i.e. table_id is nil) it's OK to skip it - we can't grant any
  ;; permissions until it exists.
  ;; Currently, though, we fail if any of the global input tables don't yet exist. Maybe we're happy changing that.
  (t2/select :model/WorkspaceInput
             :workspace_id workspace-id
             {:where [:and
                      [:= :workspace_input.access_granted false]
                      [:not [:exists {:select [1]
                                      :from   [[:workspace_output :wo]]
                                      :where  [:and
                                               [:= :wo.workspace_id :workspace_input.workspace_id]
                                               [:= :wo.db_id :workspace_input.db_id]
                                               [:or
                                                [:and [:= :wo.global_schema nil] [:= :workspace_input.schema nil]]
                                                [:= :wo.global_schema :workspace_input.schema]]
                                               [:= :wo.global_table :workspace_input.table]]}]]]}))

(defn- external-input->table
  [{:keys [schema table]}]
  {:schema schema
   :name   table})

(defn sync-grant-accesses!
  "Grant read access to external input tables for a workspace that haven't been granted yet.
   External inputs are tables that are read by transforms but not produced by any transform in the workspace.
   This should be called after adding transforms to a workspace or when re-initializing workspace isolation
   (e.g., after unarchiving)."
  [{workspace-id :id :as workspace}]
  (let [ungranted-inputs (query-ungranted-external-inputs workspace-id)]
    (if-not (:database_details workspace)
      ;; TODO (chris 2025/12/15) we will want to make this strict before merging to master
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
              (log/warn e "Error granting RO table permissions"))))))))

(defn- build-remapping [workspace]
  ;; Build table remapping from stored WorkspaceOutput and WorkspaceOutputExternal data.
  ;; Maps [db_id global_schema global_table] -> {:db-id :schema :table :id} for isolated tables.
  ;; Also maps global_table_id -> same. This is more convenient and reliable for MBQL queries and Python transforms.
  ;; Also maps [db_id nil global_table] for tables in the default schema, so unqualified SQL references work.
  ;; This is used to remap queries, sources and targets to reflect the "isolated" tables used to seal the Workspace.
  (let [outputs          (t2/select [:model/WorkspaceOutput
                                     :db_id :global_schema :global_table :global_table_id
                                     :isolated_schema :isolated_table :isolated_table_id]
                                    :workspace_id (:id workspace))
        external-outputs (t2/select [:model/WorkspaceOutputExternal
                                     :db_id :global_schema :global_table :global_table_id
                                     :isolated_schema :isolated_table :isolated_table_id]
                                    :workspace_id (:id workspace))
        all-outputs      (concat outputs external-outputs)
        ;; Get default schema for each database involved
        db-ids           (into #{} (map :db_id) all-outputs)
        db-id->default   (when (seq db-ids)
                           (t2/select-fn->fn :id #(driver.sql/default-schema (:engine %))
                                             [:model/Database :id :engine]
                                             :id [:in db-ids]))
        table-map        (reduce
                          (fn [m {:keys [db_id global_schema global_table global_table_id
                                         isolated_schema isolated_table isolated_table_id]}]
                            (let [replacement    {:db-id  db_id
                                                  :schema isolated_schema
                                                  :table  isolated_table
                                                  :id     isolated_table_id}
                                  default-schema (get db-id->default db_id)]
                              (cond-> (assoc m [db_id global_schema global_table] replacement)
                                global_table_id (assoc global_table_id replacement)
                                ;; Add nil-schema entry for tables in the default schema
                                (= global_schema default-schema) (assoc [db_id nil global_table] replacement))))
                          {}
                          all-outputs)]
    {:tables          table-map
     ;; We never want to write to any global tables, so remap on-the-fly if we hit an un-mapped target.
     :target-fallback (fn [[d s t]]
                        (log/warn "Missing remapping for" {:db d :schema s, :table s})
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

(defn run-transform!
  "Execute the given workspace transform or enclosed external transform."
  ([workspace transform]
   (run-transform! workspace transform (build-remapping workspace)))
  ([workspace transform remapping]
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
       (t2/update! :model/WorkspaceTransform {:ref_id ref-id :workspace_id (:id workspace)}
                   {:last_run_at      (:end_time result)
                    :last_run_status  (name (:status result))
                    :last_run_message (:message result)}))
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
  ([workspace transform]
   (dry-run-transform workspace transform (build-remapping workspace)))
  ([workspace transform remapping]
   (ws.isolation/with-workspace-isolation
     workspace
     (ws.execute/run-transform-preview transform remapping))))

;;;; ---------------------------------------- External Transform Sync ----------------------------------------

(defn- extract-external-transform-ids
  "Extract IDs of external transforms from graph entities."
  [entities]
  (into [] (comp (filter #(= :external-transform (:node-type %)))
                 (map :id))
        entities))

(defn- sync-external-outputs!
  "Sync workspace_output_external table based on enclosed external transforms in the graph.
   Deletes obsolete rows, upserts current ones, and backfills table IDs where possible."
  [workspace-id isolated-schema entities]
  (let [external-tx-ids (extract-external-transform-ids entities)
        existing-rows   (when (seq external-tx-ids)
                          (t2/select-fn->fn :transform_id identity
                                            :model/WorkspaceOutputExternal
                                            :workspace_id workspace-id))
        existing-tx-ids (set (keys existing-rows))]
    ;; Delete rows for transforms no longer in the graph
    (let [obsolete-ids (set/difference existing-tx-ids (set external-tx-ids))]
      (when (seq obsolete-ids)
        (t2/delete! :model/WorkspaceOutputExternal
                    :workspace_id workspace-id
                    :transform_id [:in obsolete-ids])))
    ;; Upsert rows for current external transforms
    (when (seq external-tx-ids)
      (let [transforms (t2/select [:model/Transform :id :target] :id [:in external-tx-ids])]
        (doseq [{tx-id :id, {:keys [database schema name]} :target} transforms]
          (let [isolated-table (ws.u/isolated-table-name schema name)
                existing       (get existing-rows tx-id)
                ;; Try to find table IDs - reuse existing if schema/table match
                global-table-id (or (when (and existing
                                               (= schema (:global_schema existing))
                                               (= name (:global_table existing)))
                                      (:global_table_id existing))
                                    (t2/select-one-fn :id [:model/Table :id]
                                                      :db_id database :schema schema :name name))
                isolated-table-id (or (when (and existing
                                                 (= isolated-schema (:isolated_schema existing))
                                                 (= isolated-table (:isolated_table existing)))
                                        (:isolated_table_id existing))
                                      (t2/select-one-fn :id [:model/Table :id]
                                                        :db_id database :schema isolated-schema :name isolated-table))]
            (if existing
              (t2/update! :model/WorkspaceOutputExternal (:id existing)
                          {:db_id             database
                           :global_schema     schema
                           :global_table      name
                           :global_table_id   global-table-id
                           :isolated_schema   isolated-schema
                           :isolated_table    isolated-table
                           :isolated_table_id isolated-table-id})
              (t2/insert! :model/WorkspaceOutputExternal
                          {:workspace_id      workspace-id
                           :transform_id      tx-id
                           :db_id             database
                           :global_schema     schema
                           :global_table      name
                           :global_table_id   global-table-id
                           :isolated_schema   isolated-schema
                           :isolated_table    isolated-table
                           :isolated_table_id isolated-table-id}))))))))

(defn- normalize-table-schema
  "Normalize a table's schema: replace nil with the driver's default schema.
   Takes a map of db_id -> default-schema for lookup."
  [db-id->default-schema {:keys [db_id schema] :as table}]
  (if (some? schema)
    table
    (assoc table :schema (get db-id->default-schema db_id))))

(defn- sync-external-inputs!
  "Sync workspace_input_external table based on enclosed external transforms in the graph.
   Tracks external tables consumed by enclosed transforms that aren't outputs of other transforms.
   Inputs are deduplicated per workspace. Normalizes nil schemas to driver defaults."
  [workspace-id entities]
  (let [external-tx-ids (extract-external-transform-ids entities)]
    (when (seq external-tx-ids)
      ;; Query global Dependency table for all inputs of external transforms
      (let [input-tables (t2/select [:model/Dependency :to_entity_id]
                                    :from_entity_type :transform
                                    :from_entity_id [:in external-tx-ids]
                                    :to_entity_type :table)
            input-table-ids (into #{} (map :to_entity_id) input-tables)
            ;; Get workspace output table IDs (both workspace and external outputs)
            workspace-output-ids (t2/select-fn-set :global_table_id
                                                   [:model/WorkspaceOutput :global_table_id]
                                                   :workspace_id workspace-id
                                                   {:where [:not= :global_table_id nil]})
            external-output-ids (t2/select-fn-set :global_table_id
                                                  [:model/WorkspaceOutputExternal :global_table_id]
                                                  :workspace_id workspace-id
                                                  {:where [:not= :global_table_id nil]})
            all-output-ids (set/union workspace-output-ids external-output-ids)
            ;; Filter to only true external inputs (not outputs of transforms in graph)
            external-input-ids (set/difference input-table-ids all-output-ids)]
        (when (seq external-input-ids)
          ;; Get table details for external inputs
          (let [tables (t2/select [:model/Table :id :db_id :schema :name] :id [:in external-input-ids])
                ;; Build default schema lookup for each database involved
                db-ids (into #{} (map :db_id) tables)
                db-id->default-schema (when (seq db-ids)
                                        (into {}
                                              (map (fn [{:keys [id engine]}]
                                                     [id (driver.sql/default-schema engine)]))
                                              (t2/select [:model/Database :id :engine] :id [:in db-ids])))
                ;; Normalize schemas: nil -> default schema for the table's database
                normalized-tables (map (partial normalize-table-schema db-id->default-schema) tables)
                new-inputs (into {}
                                 (map (fn [{:keys [id db_id schema name]}]
                                        [[db_id schema name] {:table_id id}]))
                                 normalized-tables)
                ;; Get existing external inputs
                existing-inputs (t2/select-fn->fn (juxt :db_id :schema :table)
                                                  #(select-keys % [:id :table_id])
                                                  [:model/WorkspaceInputExternal :id :db_id :schema :table :table_id]
                                                  :workspace_id workspace-id)
                existing-keys (set (keys existing-inputs))
                new-keys (set (keys new-inputs))
                obsolete-keys (set/difference existing-keys new-keys)
                missing-keys (set/difference new-keys existing-keys)]
            ;; Delete obsolete rows
            (doseq [[db_id schema table] obsolete-keys]
              (t2/delete! :model/WorkspaceInputExternal
                          :workspace_id workspace-id
                          :db_id db_id
                          :schema schema
                          :table table))
            ;; Insert missing rows
            (when (seq missing-keys)
              (t2/insert! :model/WorkspaceInputExternal
                          (for [[db_id schema table] missing-keys]
                            {:workspace_id   workspace-id
                             :db_id          db_id
                             :schema         schema
                             :table          table
                             :table_id       (:table_id (get new-inputs [db_id schema table]))
                             :access_granted false})))))))))

;;;; ---------------------------------------- Epochal Versioning ----------------------------------------
;; Two-level versioning for thread-safe graph calculation:
;; - Transform level: analysis_version on workspace_transform, transform_version on workspace_input/workspace_output
;; - Graph level: graph_version on workspace, workspace_graph, workspace_input_external, workspace_output_external

(defn increment-graph-version!
  "Atomically increment graph_version for a workspace. Returns the new version."
  [workspace-id]
  (:graph_version
   (first (t2/query {:update    :workspace
                     :set       {:graph_version [:+ :graph_version 1]}
                     :where     [:= :id workspace-id]
                     :returning [:graph_version]}))))

(defn increment-analysis-version!
  "Atomically increment analysis_version for a transform. Returns the new version."
  [workspace-id ref-id]
  (:analysis_version
   (first (t2/query {:update    :workspace_transform
                     :set       {:analysis_version [:+ :analysis_version 1]}
                     :where     [:and
                                 [:= :workspace_id workspace-id]
                                 [:= :ref_id ref-id]]
                     :returning [:analysis_version]}))))

;;;; ---------------------------------------- Lazy Graph Calculation ----------------------------------------

(defn- calculate-graph!
  "Calculate the dependency graph for a workspace.
   Returns the graph without caching - caller is responsible for caching."
  [ws-id]
  (ws.dag/path-induced-subgraph ws-id (t2/select-fn-vec (fn [{:keys [ref_id]}] {:entity-type :transform :id ref_id})
                                                        [:model/WorkspaceTransform :ref_id]
                                                        :workspace_id ws-id)))

(defn- cleanup-old-transform-versions!
  "Delete obsolete analysis for a given workspace transform."
  [ws-id ref-id]
  (doseq [model [:model/WorkspaceOutput :model/WorkspaceInput]]
    (t2/delete! model
                :workspace_id ws-id
                :ref_id ref-id
                ;; Use a subselect to avoid left over gunk from race conditions.
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

(defn analyze-stale-transforms!
  "Analyze transforms where workspace_output doesn't exist for current analysis_version.
   Skips transforms that haven't changed since last analysis.
   Returns true if any transforms were analyzed."
  [{ws-id :id :as workspace}]
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
                                                                 [:= :wo.transform_version :workspace_transform.analysis_version]]}]]]})]
    ;; Analyze each stale transform
    (doseq [transform stale-transforms]
      (analyze-transform! workspace transform))
    ;; Grant any missing read access. Do this even if no transforms were stale, as we may have been unable to grant
    ;; some permissions previously (insufficient permissions, table didn't exist yet, etc.)
    (sync-grant-accesses! workspace)
    (boolean (seq stale-transforms))))

(defn- transform-output-exists-for-version?
  "Check if workspace_output exists for a transform at the given version or later."
  [ws-id ref-id analysis-version]
  (t2/exists? :model/WorkspaceOutput
              :workspace_id ws-id
              :ref_id ref-id
              :transform_version [:>= analysis-version]))

(defn analyze-transform-if-stale!
  "Analyze a single transform if its workspace_output doesn't exist for current analysis_version.
   Used before running a transform to ensure grants are up-to-date."
  [{ws-id :id :as workspace} {:keys [ref_id analysis_version] :as transform}]
  (when-not (transform-output-exists-for-version? ws-id ref_id analysis_version)
    (analyze-transform! workspace transform)
    (sync-grant-accesses! workspace)))

(defn- insert-workspace-graph!
  "Insert a new graph for the given version. Silently ignores constraint violations
   from concurrent inserts (another process already inserted this version)."
  [ws-id graph-version graph]
  (ws.u/ignore-constraint-violation
   (t2/insert! :model/WorkspaceGraph
               {:workspace_id ws-id
                :graph_version graph-version
                :graph graph})))

(defn- get-cached-graph
  "Get the cached graph for a specific version, or nil if not found."
  [ws-id graph-version]
  (when-let [cached (t2/select-one :model/WorkspaceGraph
                                   :workspace_id ws-id
                                   :graph_version graph-version)]
    (:graph cached)))

(defn- graph-exists-for-version?
  "Check if a graph exists for the given version or newer."
  [ws-id target-version]
  (t2/exists? :model/WorkspaceGraph
              :workspace_id ws-id
              :graph_version [:>= target-version]))

(defn- external-outputs-exist-for-version?
  "Check if external outputs exist for the given version or newer."
  [ws-id target-version]
  (t2/exists? :model/WorkspaceOutputExternal
              :workspace_id ws-id
              :graph_version [:>= target-version]))

(defn- external-inputs-exist-for-version?
  "Check if external inputs exist for the given version or newer."
  [ws-id target-version]
  (t2/exists? :model/WorkspaceInputExternal
              :workspace_id ws-id
              :graph_version [:>= target-version]))

(defn- sync-external-outputs-for-version!
  "Sync workspace_output_external for a specific graph version.
   Creates new rows with graph_version set. Silently ignores constraint violations."
  [workspace-id isolated-schema entities graph-version]
  (let [external-tx-ids (extract-external-transform-ids entities)]
    (when (seq external-tx-ids)
      (let [transforms (t2/select [:model/Transform :id :target] :id [:in external-tx-ids])
            rows (for [{tx-id :id, {:keys [database schema name]} :target} transforms]
                   (let [isolated-table (ws.u/isolated-table-name schema name)
                         global-table-id (t2/select-one-fn :id [:model/Table :id]
                                                           :db_id database :schema schema :name name)
                         isolated-table-id (t2/select-one-fn :id [:model/Table :id]
                                                             :db_id database :schema isolated-schema :name isolated-table)]
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
           (t2/insert! :model/WorkspaceOutputExternal rows)))))))

(defn- sync-external-inputs-for-version!
  "Sync workspace_input_external for a specific graph version.
   Creates new rows with graph_version set. Silently ignores constraint violations."
  [workspace-id entities graph-version]
  (let [external-tx-ids (extract-external-transform-ids entities)]
    (when (seq external-tx-ids)
      (let [input-tables (t2/select [:model/Dependency :to_entity_id]
                                    :from_entity_type :transform
                                    :from_entity_id [:in external-tx-ids]
                                    :to_entity_type :table)
            input-table-ids (into #{} (map :to_entity_id) input-tables)
            ;; Get workspace output table IDs (both workspace and external outputs)
            workspace-output-ids (t2/select-fn-set :global_table_id
                                                   [:model/WorkspaceOutput :global_table_id]
                                                   :workspace_id workspace-id
                                                   {:where [:not= :global_table_id nil]})
            external-output-ids (t2/select-fn-set :global_table_id
                                                  [:model/WorkspaceOutputExternal :global_table_id]
                                                  :workspace_id workspace-id
                                                  :graph_version graph-version
                                                  {:where [:not= :global_table_id nil]})
            all-output-ids (set/union workspace-output-ids external-output-ids)
            external-input-ids (set/difference input-table-ids all-output-ids)]
        (when (seq external-input-ids)
          (let [tables (t2/select [:model/Table :id :db_id :schema :name] :id [:in external-input-ids])
                db-ids (into #{} (map :db_id) tables)
                db-id->default-schema (when (seq db-ids)
                                        (into {}
                                              (map (fn [{:keys [id engine]}]
                                                     [id (driver.sql/default-schema engine)]))
                                              (t2/select [:model/Database :id :engine] :id [:in db-ids])))
                normalized-tables (map (partial normalize-table-schema db-id->default-schema) tables)]
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
                              :access_granted false}))))))))))

(defn- calculate-graph-for-version!
  "Calculate the graph for target-version. Thread-safe implementation.
   - Analyzes transforms that need it (transform-level versioning)
   - Calculates and caches graph (graph-level versioning)
   - Syncs external outputs/inputs
   - Cleans up old versions"
  [{ws-id :id, isolated-schema :schema :as workspace} target-graph-version]
  ;; Step 1: Analyze transforms that need it (transform-level versioning)
  (analyze-stale-transforms! workspace)

  ;; Step 2: Calculate and cache graph if needed
  (when-not (graph-exists-for-version? ws-id target-graph-version)
    (let [graph (calculate-graph! ws-id)]
      (insert-workspace-graph! ws-id target-graph-version graph)))

  (let [graph (get-cached-graph ws-id target-graph-version)]
    ;; Step 3: Sync external outputs if needed
    (when-not (external-outputs-exist-for-version? ws-id target-graph-version)
      (sync-external-outputs-for-version! ws-id isolated-schema (:entities graph) target-graph-version))

    ;; Step 4: Sync external inputs if needed
    (when-not (external-inputs-exist-for-version? ws-id target-graph-version)
      (sync-external-inputs-for-version! ws-id (:entities graph) target-graph-version))

    ;; Step 5: Cleanup old versions
    (cleanup-old-graph-versions! ws-id)

    graph))

(defn get-or-calculate-graph
  "Return the dependency graph for a workspace. Uses cached graph if version matches,
   otherwise recalculates it. Thread-safe via epochal versioning.
   Also syncs workspace_output_external and workspace_input_external tables when recalculating."
  [{ws-id :id, graph-version :graph_version :as workspace}]
  (if-let [cached (get-cached-graph ws-id graph-version)]
    ;; Return cached graph for current version
    cached
    ;; Recalculate
    (calculate-graph-for-version! workspace graph-version)))

(defn- transforms-to-execute
  "Given a workspace and an optional filter, return the global and workspace definitions to run, in the correct order."
  [{ws-id :id :as workspace} & {:keys [stale-only?]}]
  ;; 1. Depending on what we end up storing in this field, we might not be considering stale ancestors.
  ;; 2. For now, we never set this field to false, so we'll always run everything, even with the flag.
  ;; Why is there all this weird code then? To avoid unused references.
  (let [stale-clause (if stale-only? {:where [:= :stale true]} {})
        entities     (:entities (get-or-calculate-graph workspace))
        type->ids    (u/group-by :node-type :id entities)
        id->tx       (merge
                      {}
                      (when-let [ids (seq (type->ids :external-transform))]
                        (t2/select-fn->fn :id identity
                                          [:model/Transform :id :name :source :target]
                                          :id [:in ids]
                                          stale-clause))
                      (when-let [ref-ids (seq (type->ids :workspace-transform))]
                        (t2/select-fn->fn :ref_id identity
                                          [:model/WorkspaceTransform :ref_id :name :source :target]
                                          :workspace_id ws-id
                                          :ref_id [:in ref-ids]
                                          stale-clause)))]
    (keep (comp id->tx :id) entities)))

(defn- id->str [ref-id-or-id]
  (if (string? ref-id-or-id)
    ref-id-or-id
    (str "global-id:" ref-id-or-id)))

(defn execute-workspace!
  "Execute all the transforms within a given workspace."
  [workspace & {:keys [stale-only?] :or {stale-only? false}}]
  (let [ws-id     (:id workspace)
        remapping (build-remapping workspace)]
    (reduce
     (fn [acc {external-id :id ref-id :ref_id :as transform}]
       (let [node-type (if external-id :external-transform :workspace-transform)
             id-str    (id->str (or external-id ref-id))]
         (try
           ;; Perhaps we want to return some of the metadata from this as well?
           (if (= :succeeded (:status (run-transform! workspace transform remapping)))
             (update acc :succeeded conj id-str)
             ;; Perhaps the status might indicate it never ran?
             (update acc :failed conj id-str))
           (catch Exception e
             (log/error e "Failed to execute transform" {:workspace-id ws-id :node-type node-type :id id-str})
             (update acc :failed conj id-str)))))
     {:succeeded []
      :failed    []
      :not_run   []}
     (transforms-to-execute workspace {:stale-only stale-only?}))))
