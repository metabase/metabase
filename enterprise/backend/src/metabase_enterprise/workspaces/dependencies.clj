(ns metabase-enterprise.workspaces.dependencies
  "Workspace-local dependency tracking.

   Unlike the global `dependency` table which links to `table_id` (requiring the table to exist),
   workspace dependencies use two tables that support logical references:

   - `workspace_input`  - external tables transforms consume (may not exist yet)
   - `workspace_input_transform` - join table linking inputs to transforms (ref_id + transform_version)
   - `workspace_output` - tables transforms produce

   ## Example: Internal Dependency (Transform B depends on Transform A's output)

   Transform A produces `analytics.orders_summary`:
   ```
   {:ref_id \"happy-dolphin-a1b2\"
    :target {:database 1 :schema \"analytics\" :name \"orders_summary\"}}
   ```

   Transform B reads from `analytics.orders_summary`:
   ```
   {:ref_id \"brave-lion-g7h8\"
    :source {:type \"query\" :query \"SELECT * FROM analytics.orders_summary\"}
    :target {:database 1 :schema \"analytics\" :name \"orders_report\"}}
   ```

   After processing both transforms:

   workspace_output:
   | id  | ref_id             | schema    | table          |
   |-----|--------------------|-----------|----------------|
   | 101 | happy-dolphin-a1b2 | analytics | orders_summary |
   | 104 | brave-lion-g7h8    | analytics | orders_report  |

   Transform B depends on Transform A's output - this is detected by matching table coordinates
   against workspace_output records during DAG traversal (no explicit edge storage needed).

   If Transform A also depended on an external table ORDERS:

   workspace_input:
   | id  | schema | table  | table_id |
   |-----|--------|--------|----------|
   | 201 | PUBLIC | ORDERS | 42       |

   workspace_input_transform:
   | workspace_input_id | ref_id             | transform_version |
   |--------------------|--------------------|-------------------|
   | 201                | happy-dolphin-a1b2 | 1                 |

   The join table links inputs to transforms, allowing multiple transforms to share a single input row."
  (:require
   [metabase-enterprise.workspaces.models.workspace-input]
   [metabase-enterprise.workspaces.models.workspace-input-transform]
   [metabase-enterprise.workspaces.models.workspace-output]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.app-db.core :as app-db]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   ;; TODO (Chris 2025-12-17) -- I solemnly declare that we will clean up this coupling nightmare for table normalization
   ^{:clj-kondo/ignore [:metabase/modules]}
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

(defn- insert-workspace-output!
  "Insert a workspace_output record for the transform's target table with the given transform_version.
   Stores both global (original) and isolated (workspace-specific) table identifiers.
   With epochal versioning, we always insert new rows - cleanup of old versions happens separately.
   Silently ignores constraint violations from concurrent inserts."
  [workspace-id ref-id isolated-schema {:keys [db_id schema table]} normalize-sql transform-version]
  (let [isolated-table    (ws.u/isolated-table-name schema table)
        qry-table-id      (fn [s t]
                            (or (t2/select-one-fn :id [:model/Table :id]
                                                  :db_id db_id
                                                  :schema (normalize-sql s)
                                                  :name (normalize-sql t))
                                ;; Turns out transforms don't normalize the metadata they create
                                ;; TODO (Chris 2026-01-26) -- This is getting really tangled and expensive, revisit
                                (t2/select-one-fn :id [:model/Table :id]
                                                  :db_id db_id
                                                  :schema s
                                                  :name t)))
        global-table-id   (qry-table-id schema table)
        isolated-table-id (qry-table-id isolated-schema isolated-table)]
    (ws.u/ignore-constraint-violation
     (t2/insert! :model/WorkspaceOutput
                 {:workspace_id      workspace-id
                  :ref_id            ref-id
                  :transform_version transform-version
                  :db_id             db_id
                  :global_schema     schema
                  :global_table      table
                  :global_table_id   global-table-id
                  :isolated_schema   isolated-schema
                  :isolated_table    isolated-table
                  :isolated_table_id isolated-table-id}))))

(defn- normalize-input-schema
  "Normalize an input's schema: replace nil with the driver's default schema.
   This ensures consistent comparison with output schemas which are always explicit."
  [default-schema input]
  (update input :schema #(or % default-schema)))

(defn- upsert-workspace-input!
  "Ensure a workspace_input row exists for the given table coordinate.
   Returns the workspace_input id (existing or newly created)."
  [workspace-id {:keys [db_id schema table table_id]}]
  (app-db/update-or-insert!
   :model/WorkspaceInput
   {:workspace_id workspace-id
    :db_id        db_id
    :schema       schema
    :table        table}
   (fn [existing]
     (cond-> {:workspace_id workspace-id
              :db_id        db_id
              :schema       schema
              :table        table
              :table_id     (:table_id existing)}
       table_id (assoc :table_id table_id)))))

(defn- insert-workspace-inputs!
  "Insert a single workspace_input record per table, with a join entry per transform that uses that table."
  [workspace-id ref-id inputs transform-version]
  (when (seq inputs)
    ;; N+1 query here: we query once per input to handle race conditions. Native SQL upserts would be faster
    ;; but we don't have a driver-independent helper for that.
    (let [input-ids (mapv (partial upsert-workspace-input! workspace-id) inputs)]
      (ws.u/ignore-constraint-violation
       (t2/insert! :model/WorkspaceInputTransform
                   (for [input-id input-ids]
                     {:workspace_input_id input-id
                      :workspace_id       workspace-id
                      :ref_id             ref-id
                      :transform_version  transform-version})))))
  nil)

(defn transform-output-exists-for-version?
  "Check if workspace_output exists for a transform at the given version or later."
  [ws-id ref-id transform-version]
  (t2/exists? :model/WorkspaceOutput
              :workspace_id ws-id
              :ref_id ref-id
              :transform_version [:>= transform-version]))

(mu/defn write-entity-analysis! :- :nil
  "Persist dependency analysis for a workspace entity.

   Arguments:
   - workspace-id: int
   - isolated-schema: string, the workspace's isolated schema name
   - entity-type: keyword, must be :transform
   - ref-id: string, the workspace_transform.ref_id
   - analysis: result from analyze-entity
   - transform-version: long, the analysis_version to write (for epochal versioning)

   Side effects:
   - Inserts workspace_output for this transform (with both global and isolated identifiers)
   - Inserts workspace_input records for this transform's external dependencies
   - Old version cleanup happens separately in impl.clj"
  [workspace-id      :- :int
   isolated-schema   :- :string
   entity-type       :- :keyword
   ref-id            :- :string
   {:keys [output inputs]} :- ::analysis
   transform-version :- :int]
  (ws.u/assert-transform! entity-type)
  (t2/with-transaction [_conn]
    (when-not (transform-output-exists-for-version? workspace-id ref-id transform-version)
      (let [driver            (t2/select-one-fn :engine [:model/Database :engine]
                                                :id [:in {:select [:database_id]
                                                          :from   [:workspace]
                                                          :where  [:= :id workspace-id]}])
            normalize         (partial sql.normalize/normalize-name driver)
            default-schema    (driver.sql/default-schema driver)
            ;; Normalize external inputs so schemas are consistent
            normalized-inputs (map (partial normalize-input-schema default-schema) inputs)]
        ;; Insert inputs first, then output - output row acts as "commit marker" for version check
        (insert-workspace-inputs! workspace-id ref-id normalized-inputs transform-version)
        (insert-workspace-output! workspace-id ref-id isolated-schema output normalize transform-version)
        nil))))
