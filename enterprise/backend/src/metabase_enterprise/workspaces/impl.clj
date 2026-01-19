(ns metabase-enterprise.workspaces.impl
  "Glue code connecting workspace subsystems (dependencies, isolation)."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.workspaces.dag :as ws.dag]
   [metabase-enterprise.workspaces.dependencies :as ws.deps]
   [metabase-enterprise.workspaces.execute :as ws.execute]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.app-db.core :as app-db]
   [metabase.driver.sql :as driver.sql]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- query-ungranted-external-inputs
  "Query for external inputs in a workspace that haven't been granted access yet.
   External inputs are tables that are not shadowed by any output.
   Returns seq of WorkspaceInput records where access_granted is false."
  [workspace-id]
  ;; NOTE: Could optimize with table_id join if workspace_output gets that column,
  ;; but not worth it given the small number of rows per workspace.
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

(defn- workspace-transform-ids
  "Extract ref-ids from nodes that are workspace transforms."
  [nodes]
  (into [] (comp (filter #(= :workspace-transform (:node-type %)))
                 (map :id))
        nodes))

(defn- any-transitive-ancestor-stale?
  "Check if any transitive workspace transform ancestor is stale.
   Returns true if any workspace transform ancestor has definition_stale or input_data_stale set.
   Note: External transform staleness is out of scope - only workspace transforms are checked."
  [ws-id ref-id]
  (when-let [deps-map (:dependencies (:graph (t2/select-one :model/WorkspaceGraph :workspace_id ws-id)))]
    (let [upstream    (ws.dag/bfs-reachable deps-map {:node-type :workspace-transform :id ref-id})
          upstream-ids (workspace-transform-ids upstream)]
      (and (seq upstream-ids)
           (t2/exists? :model/WorkspaceTransform
                       :workspace_id ws-id
                       :ref_id [:in upstream-ids]
                       {:where [:or
                                [:= :definition_stale true]
                                [:= :input_data_stale true]]})))))

(defn- mark-transitive-downstream-stale!
  "Mark all transitive downstream workspace transforms as input_data_stale.
   Traverses the dependency graph downward from the given transform."
  [ws-id ref-id]
  (when-let [deps-map (:dependencies (:graph (t2/select-one :model/WorkspaceGraph :workspace_id ws-id)))]
    (let [forward-edges   (ws.dag/reverse-graph deps-map)
          downstream      (ws.dag/bfs-reachable forward-edges {:node-type :workspace-transform :id ref-id})
          downstream-ids  (workspace-transform-ids downstream)]
      (when (seq downstream-ids)
        (t2/update! :model/WorkspaceTransform
                    {:workspace_id ws-id
                     :ref_id [:in downstream-ids]}
                    {:input_data_stale true})))))

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
       (let [succeeded?        (= :succeeded (:status result))
             ancestor-stale?   (boolean (and succeeded?
                                             (any-transitive-ancestor-stale? (:id workspace) ref-id)))]
         ;; Update staleness flags
         (t2/update! :model/WorkspaceTransform {:ref_id ref-id :workspace_id (:id workspace)}
                     (cond-> {:last_run_at      (:end_time result)
                              :last_run_status  (some-> (:status result) name)
                              :last_run_message (:message result)}
                       ;; On success, always clear definition_stale
                       succeeded? (assoc :definition_stale false)
                       ;; Set input_data_stale based on whether ancestors are stale
                       succeeded? (assoc :input_data_stale ancestor-stale?)))
         ;; Mark transitive downstream as stale (their input just changed)
         (when succeeded?
           (mark-transitive-downstream-stale! (:id workspace) ref-id))))
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

;;;; ---------------------------------------- Lazy Graph Calculation ----------------------------------------

(defn- calculate-graph!
  "Calculate the dependency graph for a workspace.
   Returns the graph without caching - caller is responsible for caching."
  [ws-id]
  (ws.dag/path-induced-subgraph ws-id (t2/select-fn-vec (fn [{:keys [ref_id]}] {:entity-type :transform :id ref_id})
                                                        [:model/WorkspaceTransform :ref_id]
                                                        :workspace_id ws-id)))

(defn analyze-transform-if-stale!
  "Re-analyze dependencies for a given transform, if necessary. Marks it as not stale after analysis."
  [{ws-id :id, isolated-schema :schema :as workspace} transform]
  (when (:analysis_stale transform)
    (let [analysis (ws.deps/analyze-entity :transform transform)]
      (ws.deps/write-dependencies! ws-id isolated-schema :transform (:ref_id transform) analysis))
    (t2/update! :model/WorkspaceTransform (:ref_id transform) {:analysis_stale false})
    (sync-grant-accesses! workspace)))

(defn analyze-stale-transforms!
  "Re-analyze dependencies for any workspace transforms that are stale.
   Marks them as not stale after analysis. Returns true if any transforms were analyzed."
  [{ws-id :id, isolated-schema :schema :as workspace}]
  (let [stale-transforms (t2/select :model/WorkspaceTransform
                                    :workspace_id ws-id
                                    :analysis_stale true)]
    (doseq [transform stale-transforms]
      (let [analysis (ws.deps/analyze-entity :transform transform)]
        (ws.deps/write-dependencies! ws-id isolated-schema :transform (:ref_id transform) analysis))
      (t2/update! :model/WorkspaceTransform (:ref_id transform) {:analysis_stale false}))
    ;; Grant read access to any new external inputs
    (when (seq stale-transforms)
      (sync-grant-accesses! workspace))
    (boolean (seq stale-transforms))))

(defn- upsert-workspace-graph!
  "Insert or update the cached graph for a workspace."
  [ws-id graph]
  (app-db/update-or-insert! :model/WorkspaceGraph {:workspace_id ws-id} (fn [_] {:workspace_id ws-id, :graph graph})))

(defn- calculate-and-cache-graph!
  "Calculate the graph, cache it, sync external inputs/outputs, and mark workspace as not stale."
  [{ws-id :id, isolated-schema :schema :as workspace}]
  (t2/with-transaction [_conn]
    ;; First, re-analyze any stale transforms
    (analyze-stale-transforms! workspace)
    (let [graph (calculate-graph! ws-id)]
      ;; Persist our work
      (sync-external-outputs! ws-id isolated-schema (:entities graph))
      (sync-external-inputs! ws-id (:entities graph))
      (upsert-workspace-graph! ws-id graph)
      (t2/update! :model/Workspace ws-id {:analysis_stale false})
      graph)))

(defn- hydrate-staleness
  "Hydrate staleness on graph entities by querying current DB state.
   Adds :definition_stale and :input_data_stale to workspace transform entities.
   External transforms are not hydrated (out of scope)."
  [ws-id graph]
  (let [ws-tx-ids        (workspace-transform-ids (:entities graph))
        staleness-map    (when (seq ws-tx-ids)
                           (into {}
                                 (map (fn [t] [(:ref_id t) (select-keys t [:definition_stale :input_data_stale])]))
                                 (t2/select :model/WorkspaceTransform
                                            :workspace_id ws-id
                                            :ref_id [:in ws-tx-ids])))
        updated-entities (mapv (fn [entity]
                                 (if (= :workspace-transform (:node-type entity))
                                   (merge entity (get staleness-map (:id entity)
                                                      {:definition_stale false
                                                       :input_data_stale false}))
                                   entity))
                               (:entities graph))]
    (assoc graph :entities updated-entities)))

(defn get-or-calculate-graph
  "Return the dependency graph for a workspace. Uses cached graph if workspace is not stale,
   otherwise recalculates it. Always hydrates current staleness state from DB.
   Also syncs workspace_output_external and workspace_input_external tables when recalculating."
  [{ws-id :id, analysis-stale :analysis_stale :as workspace}]
  (let [graph (if-not analysis-stale
                ;; Return cached graph from workspace_graph table
                (when-let [cached (t2/select-one :model/WorkspaceGraph :workspace_id ws-id)]
                  (:graph cached))
                ;; Recalculate and cache
                (calculate-and-cache-graph! workspace))]
    (when graph
      (hydrate-staleness ws-id graph))))

(defn mark-workspace-stale!
  "Mark a workspace as needing graph recalculation."
  [workspace-id]
  (t2/update! :model/Workspace workspace-id {:analysis_stale true}))

(defn- transforms-to-execute
  "Given a workspace and an optional filter, return the global and workspace definitions to run, in the correct order."
  [{ws-id :id :as workspace} & {:keys [stale-only?]}]
  (let [entities     (:entities (get-or-calculate-graph workspace))
        ;; Filter entities to only stale if stale-only? is true
        ;; A workspace transform is stale if definition_stale OR input_data_stale is true
        entities     (if stale-only?
                       (filter #(or (:definition_stale %) (:input_data_stale %)) entities)
                       entities)
        type->ids    (u/group-by :node-type :id entities)
        id->tx       (merge
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
