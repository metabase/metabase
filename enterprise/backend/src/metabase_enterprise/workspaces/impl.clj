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
              ;; Suppress errors for tables that don't exist (common in tests with fake tables)
              (when-not (some->> (ex-message e) (re-find #"(?i)(does not exist|not found|no such table)"))
                (log/warn e "Error granting RO table permissions")))))))))

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
   - table-id -> replacement (for MBQL/Python, if table-id provided)
   - [db-id nil table] -> replacement (for unqualified SQL, if in-default-schema? is true)"
  [m {:keys [db-id schema table table-id replacement in-default-schema?]}]
  (cond-> m
    true             (assoc [db-id schema table] replacement)
    table-id         (assoc table-id replacement)
    in-default-schema? (assoc [db-id nil table] replacement)))

(defn- quote-name [driver s] (when s (sql.util/quote-name driver :table s)))

(defn- build-remapping [workspace]
  ;; Build table remapping from stored WorkspaceOutput, WorkspaceOutputExternal, WorkspaceInput, and
  ;; WorkspaceInputExternal data.
  ;;
  ;; For OUTPUTS (isolated tables):
  ;; Maps [db_id global_schema global_table] -> {:db-id :schema :table :id} for isolated tables.
  ;; Also maps global_table_id -> same. This is more convenient and reliable for MBQL queries and Python transforms.
  ;; Also maps [db_id nil global_table] for tables in the default schema, so unqualified SQL references work.
  ;;
  ;; For INPUTS (external tables read from source DB):
  ;; Maps [db_id schema table] -> {:db-id :schema :table :id} to qualify references.
  ;; This ensures "SELECT * FROM orders" becomes "SELECT * FROM public.orders" (or "mydb.orders" for MySQL).
  ;;
  ;; Output mappings take precedence over input mappings (merged last).
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
        ;; Fetch input tables (external tables that transforms read from)
        inputs           (t2/select [:model/WorkspaceInput :db_id :schema :table :table_id]
                                    :workspace_id (:id workspace))
        external-inputs  (t2/select [:model/WorkspaceInputExternal :db_id :schema :table :table_id]
                                    :workspace_id (:id workspace))
        all-inputs       (concat inputs external-inputs)
        ;; Get default schema for each database involved (both inputs and outputs)
        ;; For databases with schemas (PostgreSQL), this is the default schema (e.g., "public").
        ;; For databases without schemas (MySQL), default-schema returns nil, but we can use the
        ;; database name from connection details for qualification (e.g., "mydb.orders").
        db-ids           (into #{} (map :db_id) (concat all-outputs all-inputs))
        databases        (when (seq db-ids)
                           (t2/select [:model/Database :id :engine :details] :id [:in db-ids]))
        db-id->default   (into {}
                               (map (fn [{:keys [id engine details]}]
                                      ;; Pre-quote the default schema/database name because it will be spliced into SQL
                                      ;; for unqualified references (e.g. `orders` → `"public"."orders"` or `test-data`.`orders`).
                                      ;; These names don't appear in the original SQL, so macaw won't quote them for us.
                                      [id (quote-name engine (or (driver.sql/default-schema engine)
                                                                 ;; For MySQL and similar, use database name from connection details
                                                                 ((some-fn :dbname :db) details)))]))
                               databases)
        fallback-map     (merge
                          (table-ids-fallbacks :global_schema :global_table :global_table_id all-outputs)
                          (table-ids-fallbacks :isolated_schema :isolated_table :isolated_table_id all-outputs))
        ;; Build output mappings (remap to isolated tables)
        output-map       (reduce
                          (fn [m {:keys [db_id global_schema global_table global_table_id
                                         isolated_schema isolated_table isolated_table_id]}]
                            (let [default-schema (get db-id->default db_id)]
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
                                                          :in-default-schema? (= global_schema default-schema)})))
                          {}
                          all-outputs)
        ;; Build input mappings (qualify references to external tables)
        input-map        (reduce
                          (fn [m {:keys [db_id schema table table_id]}]
                            (let [default-schema (get db-id->default db_id)
                                  ;; For inputs, determine the schema to use for qualification:
                                  ;; - If table has a schema, use it (PostgreSQL with non-default schema)
                                  ;; - Otherwise use default-schema (already quoted via db-id->default)
                                  qualify-schema (or schema default-schema)]
                              (if (some? qualify-schema)
                                (add-table-mapping-entries m
                                                           {:db-id              db_id
                                                            :schema             qualify-schema
                                                            :table              table
                                                            :table-id           table_id
                                                            :replacement        {:db-id  db_id
                                                                                 :schema qualify-schema
                                                                                 :table  table
                                                                                 :id     table_id}
                                                            :in-default-schema? (or (nil? schema) (= schema default-schema))})
                                m)))
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
  (t2/update! :model/WorkspaceTransform
              {:workspace_id workspace-id, :ref_id ref-id}
              {:analysis_version [:+ :analysis_version 1]}))

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
      (sync-grant-accesses! workspace))
    (boolean (seq stale-transforms))))

(defn analyze-transform-if-stale!
  "Analyze a single transform if its workspace_output doesn't exist for current analysis_version.
   Used before running a transform to ensure grants are up-to-date."
  [{ws-id :id :as workspace} {:keys [ref_id analysis_version] :as transform}]
  (when-not (ws.deps/transform-output-exists-for-version? ws-id ref_id analysis_version)
    (analyze-transform! workspace transform)
    (sync-grant-accesses! workspace)))

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
                                 ;; TODO (Chris 2026-01-26) 2N + 1 is really not great here...
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

(defn get-or-calculate-graph!
  "Return the dependency graph for a workspace.
   Uses cached graph if version matches, otherwise recalculates it.
   Thread-safe via epochal versioning.
   Also syncs workspace_output_external and workspace_input_external tables when recalculating."
  [{ws-id :id, graph-version :graph_version :as workspace}]
  (or (fully-persisted-graph ws-id graph-version)
      (calculate-and-persist-graph! workspace graph-version)))

(defn- transforms-to-execute
  "Given a workspace and an optional filter, return the global and workspace definitions to run, in the correct order."
  [{ws-id :id :as workspace} & {:keys [stale-only?]}]
  ;; 1. Depending on what we end up storing in this field, we might not be considering stale ancestors.
  ;; 2. For now, we never set this field to false, so we'll always run everything, even with the flag.
  ;; Why is there all this weird code then? To avoid unused references.
  (let [stale-clause (if stale-only? {:where [:= :stale true]} {})
        entities     (:entities (get-or-calculate-graph! workspace))
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
