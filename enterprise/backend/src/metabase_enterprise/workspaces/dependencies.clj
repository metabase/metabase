(ns metabase-enterprise.workspaces.dependencies
  "Workspace-local dependency tracking.

   Unlike the global `dependency` table which links to `table_id` (requiring the table to exist),
   workspace dependencies use three tables that support logical references:

   - `workspace_input`  - external tables transforms consume (may not exist yet)
   - `workspace_output` - tables transforms produce
   - `workspace_dependency` - edges: transform → input (external) or transform → output (internal)

   ## Example: Internal Dependency (Transform B depends on Transform A's output)

   Transform A produces `analytics.orders_summary`:
   ```
   {:ref_id \"happy-dolphin-a1b2\"
    :target {:database 1 :schema \"analytics\" :name \"orders_summary\"}}
   ```

   Transform B reads from `analytics.orders_summary`:
   ```
   {:ref_id \"brave-lion-g7h8\"
    :source {:type \"query\" :query <SELECT * FROM analytics.orders_summary>}
    :target {:database 1 :schema \"analytics\" :name \"orders_report\"}}
   ```

   After processing both transforms:

   workspace_output:
   | id  | ref_id             | schema    | table          |
   |-----|--------------------|-----------|----------------|
   | 101 | happy-dolphin-a1b2 | analytics | orders_summary |
   | 104 | brave-lion-g7h8    | analytics | orders_report  |

   workspace_dependency:
   | from_entity_type | from_entity_id     | to_entity_type | to_entity_id | meaning                 |
   |------------------|--------------------| ---------------|--------------|-------------------------|
   | transform        | brave-lion-g7h8    | output         | 101          | B depends on A's output |

   Transform B's dependency points to `output:101` (Transform A's output), NOT to a new `input`.
   This is because `analytics.orders_summary` matches an existing `workspace_output` record.

   If Transform A also depended on an external table ORDERS, we'd also have:

   workspace_input:
   | id  | schema | table  | table_id |
   |-----|--------|--------|----------|
   | 201 | PUBLIC | ORDERS | 42       |

   workspace_dependency:
   | from_entity_type | from_entity_id     | to_entity_type | to_entity_id | meaning                      |
   |------------------|--------------------| ---------------|--------------|------------------------------|
   | transform        | happy-dolphin-a1b2 | input          | 201          | A depends on external ORDERS |
   | transform        | brave-lion-g7h8    | output         | 101          | B depends on A's output      |"
  (:require
   ;; TODO (chris 2025/12/17) I solemnly declare that we will clean up this coupling nightmare for table normalization
   #_{:clj-kondo/ignore [:metabase/modules]}
   [clojure.set :as set]
   [metabase-enterprise.workspaces.models.workspace-dependency]
   [metabase-enterprise.workspaces.models.workspace-input]
   [metabase-enterprise.workspaces.models.workspace-output]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.app-db.core :as app-db]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :as perf]
   [toucan2.core :as t2]))

;;; ---------------------------------------- Schemas ----------------------------------------

(mr/def ::table-ref
  "A logical reference to a table by schema and name. Includes table_id if the table exists."
  [:map
   [:db_id :int]
   [:schema [:maybe :string]]
   [:table :string]
   [:table_id {:optional true} [:maybe :int]]])

(mr/def ::output-ref
  "A reference to an output table (transform target)."
  [:map
   [:db_id :int]
   [:schema [:maybe :string]]
   [:table :string]])

(mr/def ::analysis
  "The result of analyzing an entity's dependencies."
  [:map
   [:output ::output-ref]
   [:inputs [:sequential ::table-ref]]])

;;; ---------------------------------------- Batch table lookups ----------------------------------------

(defn- batch-table-refs-from-ids
  "Look up table metadata for multiple table IDs in a single query.
   Returns a map of table-id -> {:db_id :schema :table :table_id}."
  [table-ids]
  (when (seq table-ids)
    (t2/select-fn->fn :id
                      (fn [{:keys [id db_id schema name]}]
                        {:db_id    db_id
                         :schema   schema
                         :table    name
                         :table_id id})
                      [:model/Table :id :db_id :schema :name]
                      :id [:in table-ids])))

(defn- batch-lookup-table-ids
  "Look up table_ids for multiple logical table references in a single query.
   Uses the same matching logic as find-table-or-transform: if parsed schema is nil,
   it matches against the driver's default schema.
   Returns a map of [db_id search-schema table] -> table_id where search-schema
   is the schema used for lookup (defaulted if nil)."
  [driver db-id table-refs]
  (when (seq table-refs)
    (let [default-schema  (driver.sql/default-schema driver)
          ;; Include default-schema in filter so nil refs can match that too
          nil-schema? (some (comp nil? :schema) table-refs)
          schemas-to-query (into #{} (map #(or (:schema %) default-schema)) table-refs)
          db-table-lookup (t2/select-fn->fn (juxt :schema :name) :id
                                            [:model/Table :id :schema :name]
                                            :db_id db-id
                                            :name [:in (map :table table-refs)]
                                            {:where (if nil-schema?
                                                      [:or [:= :schema nil] [:in :schema schemas-to-query]]
                                                      [:in :schema schemas-to-query])})]
      (into {}
            (keep (fn [{:keys [schema table]}]
                    (let [table-id (or (get db-table-lookup [schema table])
                                       (when (nil? schema)
                                         (get db-table-lookup [default-schema table])))]
                      (when table-id
                        [[db-id schema table] table-id]))))
            table-refs))))

(defn- output-from-target
  "Extract output table info from a transform's :target field."
  [{:keys [database schema name] :as _target}]
  {:db_id  database
   :schema schema
   :table  name})

;;; ---------------------------------------- Input extraction ----------------------------------------

(defn- inputs-from-mbql-query
  "Extract table refs from an MBQL query. Tables are looked up by ID in batch."
  [query]
  (let [table-ids   (-> #{}
                        (into (lib/all-source-table-ids query))
                        (into (lib/all-implicitly-joined-table-ids query)))
        table-refs  (batch-table-refs-from-ids table-ids)]
    (u/keepv table-refs table-ids)))

(defn- inputs-from-native-query
  "Extract table refs from a native query. Uses driver/native-query-table-refs to get
   schema+table directly, then batch looks up table_ids for tables that exist.
   Uses the same default schema logic as find-table-or-transform."
  [query db-id]
  (let [driver         (:engine (lib.metadata/database query))
        parsed-refs    (driver/native-query-table-refs driver query)
        ;; Batch lookup existing table IDs (handles default schema logic)
        table-id-map   (batch-lookup-table-ids driver db-id parsed-refs)]
    (perf/for [{:keys [schema table]} parsed-refs
               :let [table-id (get table-id-map [db-id schema table])]]
      (cond-> {:db_id  db-id
               :schema schema
               :table  table}
        table-id (assoc :table_id table-id)))))

(defn- inputs-from-query
  "Extract table refs from a query (MBQL or native)."
  [query db-id]
  (if (lib/native-only-query? query)
    (inputs-from-native-query query db-id)
    (inputs-from-mbql-query query)))

(defn- inputs-from-python-transform
  "Extract table refs from a python transform's source-tables.
   Python transforms require tables to exist (they map name -> table_id). Batch lookup."
  [source-tables]
  (let [table-ids  (set (vals source-tables))
        table-refs (batch-table-refs-from-ids table-ids)]
    (u/keepv table-refs (vals source-tables))))

(mu/defn analyze-entity :- ::analysis
  "Analyze a workspace entity to find its dependencies.

   Arguments:
   - entity-type: keyword, must be :transform (asserted)
   - entity: the workspace transform map with :source and :target

   Returns:
   {:output {:db_id int :schema string :table string}
    :inputs [{:db_id int :schema string :table string} ...]}"
  [entity-type :- :keyword
   entity      :- :map]
  (ws.u/assert-transform! entity-type)
  (let [{{:keys [query source-tables], source-type :type} :source
         target :target} entity
        db-id (:database target)
        inputs (cond
                 (= (keyword source-type) :query)
                 (inputs-from-query query db-id)

                 (= (keyword source-type) :python)
                 (inputs-from-python-transform source-tables)

                 :else
                 (do (log/warnf "Don't know how to analyze deps of transform with source type '%s'" source-type)
                     []))]
    {:output (output-from-target target)
     :inputs inputs}))

;;; ---------------------------------------- Write helpers ----------------------------------------

(defn- upsert-workspace-output!
  "Upsert a workspace_output record for the transform's target table.
   Stores both global (original) and isolated (workspace-specific) table identifiers.
   Returns the workspace_output id."
  [workspace-id ref-id isolated-schema {:keys [db_id schema table]} normalize-sql]
  (app-db/update-or-insert! :model/WorkspaceOutput
                            {:workspace_id workspace-id
                             :ref_id       ref-id}
                            (fn [existing]
                              (let [isolated-table (ws.u/isolated-table-name schema table)
                                    qry-table-id   (fn [schema table]
                                                     (t2/select-one-fn :id [:model/Table :id]
                                                                       :db_id db_id
                                                                       :schema (normalize-sql schema)
                                                                       :name (normalize-sql table)))
                                    id-if-match    (fn [schema-key schema table-key table id-key]
                                                     (when (and (= schema (get existing schema-key))
                                                                (= table (get existing table-key)))
                                                       (get existing id-key)))
                                    id-or-fallback (fn [schema-key schema table-key table id-key]
                                                     (or (id-if-match schema-key schema table-key table id-key)
                                                         (qry-table-id schema table)))]
                                {:db_id             db_id
                                 :global_schema     schema
                                 :global_table      table
                                 :global_table_id   (id-or-fallback
                                                     :global_schema schema
                                                     :global_table table
                                                     :global_table_id)
                                 :isolated_schema   isolated-schema
                                 :isolated_table    isolated-table
                                 :isolated_table_id (id-or-fallback
                                                     :isolated_schema isolated-schema
                                                     :isolated_table isolated-table
                                                     :isolated_table_id)}))))

(defn- build-output-lookup
  "Build a lookup map for workspace outputs: [db_id global_schema global_table] -> output_id.
   Single query to fetch all outputs for the workspace."
  [workspace-id]
  (t2/select-fn->fn (juxt :db_id :global_schema :global_table) :id
                    :model/WorkspaceOutput
                    :workspace_id workspace-id))

(defn- build-input-lookup
  "Build a lookup map for workspace inputs: [db_id schema table] -> {:id :table_id}.
   Single query to fetch all inputs for the workspace."
  [workspace-id]
  (t2/select-fn->fn (juxt :db_id :schema :table)
                    #(select-keys % [:id :table_id])
                    [:model/WorkspaceInput :id :db_id :schema :table :table_id]
                    :workspace_id workspace-id))

(defn- ensure-workspace-inputs!
  "Ensure all external inputs exist in workspace_input table.
   Uses batch lookup to avoid N+1. Returns map of [db_id schema table] -> input_id."
  [workspace-id inputs existing-input-lookup]
  (let [{existing true new-inputs false}
        (group-by (fn [{:keys [db_id schema table]}]
                    (contains? existing-input-lookup [db_id schema table]))
                  inputs)

        ;; TODO: This N+1 section could be optimized into one batch update using HoneySQL
        _ (doseq [{:keys [db_id schema table table_id]} existing]
            (let [existing-record (get existing-input-lookup [db_id schema table])]
              (when (and existing-record
                         (not= (:table_id existing-record) table_id))
                (t2/update! :model/WorkspaceInput (:id existing-record) {:table_id table_id}))))

        new-input-records (when (seq new-inputs)
                            (t2/insert-returning-instances!
                             :model/WorkspaceInput
                             (for [{:keys [db_id schema table table_id]} new-inputs]
                               {:workspace_id workspace-id
                                :db_id        db_id
                                :schema       schema
                                :table        table
                                :table_id     table_id})))

        new-input-lookup (into {} (map (fn [{:keys [id db_id schema table]}]
                                         [[db_id schema table] id])
                                       new-input-records))]
    (merge (into {} (map (fn [[k v]] [k (:id v)]) existing-input-lookup))
           new-input-lookup)))

(defn- create-dependency-edges!
  "Batch create workspace_dependency edges."
  [workspace-id ref-id dep-specs]
  (when (seq dep-specs)
    (t2/insert! :model/WorkspaceDependency
                (for [{:keys [to_entity_type to_entity_id]} dep-specs]
                  {:workspace_id     workspace-id
                   :from_entity_type :transform
                   :from_entity_id   ref-id
                   :to_entity_type   to_entity_type
                   :to_entity_id     to_entity_id}))))

(defn- delete-stale-edges!
  "Delete dependency edges that are no longer present.
   Uses single delete with OR conditions for batch deletion."
  [workspace-id ref-id stale-edges]
  (when (seq stale-edges)
    (doseq [{:keys [to_entity_type to_entity_id]} stale-edges]
      ;; TODO: Could optimize further with raw SQL DELETE ... WHERE (type, id) IN (...)
      (t2/delete! :model/WorkspaceDependency
                  :workspace_id workspace-id
                  :from_entity_type :transform
                  :from_entity_id ref-id
                  :to_entity_type to_entity_type
                  :to_entity_id to_entity_id))))

(defn- current-edge-specs
  "Get the current dependency edge specs for a transform."
  [workspace-id ref-id]
  (into #{}
        (map #(select-keys % [:to_entity_type :to_entity_id]))
        (t2/select [:model/WorkspaceDependency :to_entity_type :to_entity_id]
                   :workspace_id workspace-id
                   :from_entity_type :transform
                   :from_entity_id ref-id)))

(mu/defn write-dependencies! :- :nil
  "Persist dependency analysis for a workspace entity.

   Arguments:
   - workspace-id: int
   - isolated-schema: string, the workspace's isolated schema name
   - entity-type: keyword, must be :transform
   - ref-id: string, the workspace_transform.ref_id
   - analysis: result from analyze-entity

   Side effects:
   - Upserts workspace_output for this transform (with both global and isolated identifiers)
   - Upserts workspace_input for each external table dependency
   - Creates workspace_dependency edges
   - Deletes stale edges"
  [workspace-id    :- :int
   isolated-schema :- :string
   entity-type     :- :keyword
   ref-id          :- :string
   {:keys [output inputs]} :- ::analysis]
  (ws.u/assert-transform! entity-type)
  (t2/with-transaction [_conn]
    (let [output-lookup         (build-output-lookup workspace-id)
          existing-input-lookup (build-input-lookup workspace-id)
          current-edges         (current-edge-specs workspace-id ref-id)
          driver                (t2/select-one-fn :engine [:model/Database :engine]
                                                  :id [:in {:select [:database_id]
                                                            :from   [:workspace]
                                                            :where  [:= :id workspace-id]}])
          normalize             (partial sql.normalize/normalize-name driver)]
      (upsert-workspace-output! workspace-id ref-id isolated-schema output normalize)
      (let [{internal-inputs true external-inputs false} (group-by (fn [{:keys [db_id schema table]}]
                                                                     (contains? output-lookup [db_id schema table]))
                                                                   inputs)
            input-id-lookup (ensure-workspace-inputs! workspace-id external-inputs existing-input-lookup)
            new-dep-specs (concat
                           (for [{:keys [db_id schema table]} internal-inputs]
                             {:to_entity_type :output
                              :to_entity_id   (get output-lookup [db_id schema table])})
                           (for [{:keys [db_id schema table]} external-inputs]
                             {:to_entity_type :input
                              :to_entity_id   (get input-id-lookup [db_id schema table])}))
            new-dep-specs-set (set new-dep-specs)
            edges-to-create (set/difference new-dep-specs-set current-edges)
            edges-to-delete (set/difference current-edges new-dep-specs-set)]
        (create-dependency-edges! workspace-id ref-id edges-to-create)
        (delete-stale-edges! workspace-id ref-id edges-to-delete)))))
