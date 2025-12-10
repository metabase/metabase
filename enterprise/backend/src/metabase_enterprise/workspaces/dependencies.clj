(ns metabase-enterprise.workspaces.dependencies
  "Workspace-local dependency tracking.

   Unlike the global dependency table which links to table_id (requiring the table to exist and be synced),
   workspace dependencies link to workspace_input which stores logical table references that don't require
   the table to exist yet."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.workspaces.models.workspace-dependency]
   [metabase-enterprise.workspaces.models.workspace-input]
   [metabase-enterprise.workspaces.models.workspace-output]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

;;; ---------------------------------------- Schemas ----------------------------------------

(mr/def ::table-ref
  "A logical reference to a table by schema and name. Includes table_id if the table exists."
  [:map
   [:database_id :int]
   [:schema [:maybe :string]]
   [:table :string]
   [:table_id {:optional true} [:maybe :int]]])

(mr/def ::output-ref
  "A reference to an output table (transform target)."
  [:map
   [:database_id :int]
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
   Returns a map of table-id -> {:database_id :schema :table :table_id}."
  [table-ids]
  (when (seq table-ids)
    (->> (t2/select [:model/Table :id :db_id :schema :name] :id [:in table-ids])
         (into {} (map (fn [{:keys [id db_id schema name]}]
                         [id {:database_id db_id
                              :schema      schema
                              :table       name
                              :table_id    id}]))))))

(defn- batch-lookup-table-ids
  "Look up table_ids for multiple logical table references in a single query.
   Uses the same matching logic as find-table-or-transform: if parsed schema is nil,
   it matches against the driver's default schema.
   Returns a map of [database_id search-schema table] -> table_id where search-schema
   is the schema used for lookup (defaulted if nil)."
  [driver database-id table-refs]
  (when (seq table-refs)
    (let [default-schema (driver.sql/default-schema driver)
          tables         (t2/select [:model/Table :id :schema :name]
                                    :db_id database-id
                                    :name [:in (map :table table-refs)])
          db-table-lookup (into {} (map (fn [{:keys [id schema name]}]
                                          [[schema name] id]))
                                tables)]
      (into {}
            (keep (fn [{:keys [schema table]}]
                    (let [search-schema (or schema default-schema)
                          table-id      (get db-table-lookup [search-schema table])]
                      (when table-id
                        [[database-id schema table] table-id]))))
            table-refs))))

(defn- output-from-target
  "Extract output table info from a transform's :target field."
  [{:keys [database schema name] :as _target}]
  {:database_id database
   :schema      schema
   :table       name})

;;; ---------------------------------------- Input extraction ----------------------------------------

(defn- inputs-from-mbql-query
  "Extract table refs from an MBQL query. Tables are looked up by ID in batch."
  [query]
  (let [table-ids   (-> #{}
                        (into (lib/all-source-table-ids query))
                        (into (lib/all-implicitly-joined-table-ids query)))
        table-refs  (batch-table-refs-from-ids table-ids)]
    (vec (keep table-refs table-ids))))

(defn- inputs-from-native-query
  "Extract table refs from a native query. Uses driver/native-query-table-refs to get
   schema+table directly, then batch looks up table_ids for tables that exist.
   Uses the same default schema logic as find-table-or-transform."
  [query database-id]
  (let [driver         (:engine (lib.metadata/database query))
        parsed-refs    (driver/native-query-table-refs driver query)
        ;; Batch lookup existing table IDs (handles default schema logic)
        table-id-map   (batch-lookup-table-ids driver database-id parsed-refs)]
    (vec (for [{:keys [schema table]} parsed-refs
               :let [table-id (get table-id-map [database-id schema table])]]
           (cond-> {:database_id database-id
                    :schema      schema
                    :table       table}
             table-id (assoc :table_id table-id))))))

(defn- inputs-from-query
  "Extract table refs from a query (MBQL or native)."
  [query database-id]
  (if (lib/native-only-query? query)
    (inputs-from-native-query query database-id)
    (inputs-from-mbql-query query)))

(defn- inputs-from-python-transform
  "Extract table refs from a python transform's source-tables.
   Python transforms require tables to exist (they map name -> table_id). Batch lookup."
  [source-tables]
  (let [table-ids  (set (vals source-tables))
        table-refs (batch-table-refs-from-ids table-ids)]
    (vec (keep table-refs (vals source-tables)))))

(mu/defn analyze-entity :- ::analysis
  "Analyze a workspace entity to find its dependencies.

   Arguments:
   - entity-type: keyword, must be :transform (asserted)
   - entity: the workspace transform map with :source and :target

   Returns:
   {:output {:database_id int :schema string :table string}
    :inputs [{:database_id int :schema string :table string} ...]}"
  [entity-type :- :keyword
   entity      :- :map]
  (ws.u/assert-transform! entity-type)
  (let [{{:keys [query source-tables], source-type :type} :source
         target :target} entity
        database-id (:database target)
        inputs (cond
                 (= (keyword source-type) :query)
                 (inputs-from-query query database-id)

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
   Returns the workspace_output id."
  [workspace-id ref-id {:keys [database_id schema table]} existing-output]
  (if existing-output
    (do
      (t2/update! :model/WorkspaceOutput (:id existing-output)
                  {:database_id database_id
                   :schema      schema
                   :table       table})
      (:id existing-output))
    (:id (t2/insert-returning-instance! :model/WorkspaceOutput
                                        {:workspace_id workspace-id
                                         :ref_id       ref-id
                                         :database_id  database_id
                                         :schema       schema
                                         :table        table}))))

(defn- build-output-lookup
  "Build a lookup map for workspace outputs: [database_id schema table] -> output_id.
   Single query to fetch all outputs for the workspace."
  [workspace-id]
  (->> (t2/select [:model/WorkspaceOutput :id :database_id :schema :table]
                  :workspace_id workspace-id)
       (into {} (map (fn [{:keys [id database_id schema table]}]
                       [[database_id schema table] id])))))

(defn- build-input-lookup
  "Build a lookup map for workspace inputs: [database_id schema table] -> {:id :table_id}.
   Single query to fetch all inputs for the workspace."
  [workspace-id]
  (->> (t2/select [:model/WorkspaceInput :id :database_id :schema :table :table_id]
                  :workspace_id workspace-id)
       (into {} (map (fn [{:keys [id database_id schema table table_id]}]
                       [[database_id schema table] {:id id :table_id table_id}])))))

(defn- ensure-workspace-inputs!
  "Ensure all external inputs exist in workspace_input table.
   Uses batch lookup to avoid N+1. Returns map of [db schema table] -> input_id."
  [workspace-id inputs existing-input-lookup]
  (let [{existing true new-inputs false}
        (group-by (fn [{:keys [database_id schema table]}]
                    (contains? existing-input-lookup [database_id schema table]))
                  inputs)

        _ (doseq [{:keys [database_id schema table table_id]} existing]
            (let [existing-record (get existing-input-lookup [database_id schema table])]
              (when (and existing-record
                         (not= (:table_id existing-record) table_id))
                (t2/update! :model/WorkspaceInput (:id existing-record) {:table_id table_id}))))

        new-input-records (when (seq new-inputs)
                            (t2/insert-returning-instances!
                             :model/WorkspaceInput
                             (for [{:keys [database_id schema table table_id]} new-inputs]
                               {:workspace_id workspace-id
                                :database_id  database_id
                                :schema       schema
                                :table        table
                                :table_id     table_id})))

        new-input-lookup (into {} (map (fn [{:keys [id database_id schema table]}]
                                         [[database_id schema table] id])
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
                   :to_entity_id     to_entity_id
                   :created_at       [:now]}))))

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
  (->> (t2/select [:model/WorkspaceDependency :to_entity_type :to_entity_id]
                  :workspace_id workspace-id
                  :from_entity_type :transform
                  :from_entity_id ref-id)
       (map #(select-keys % [:to_entity_type :to_entity_id]))
       set))

(mu/defn write-dependencies! :- :nil
  "Persist dependency analysis for a workspace entity.

   Arguments:
   - workspace-id: int
   - entity-type: keyword, must be :transform
   - ref-id: string, the workspace_transform.ref_id
   - analysis: result from analyze-entity

   Side effects:
   - Upserts workspace_output for this transform
   - Upserts workspace_input for each external table dependency
   - Creates workspace_dependency edges
   - Deletes stale edges"
  [workspace-id :- :int
   entity-type  :- :keyword
   ref-id       :- :string
   {:keys [output inputs]} :- ::analysis]
  (ws.u/assert-transform! entity-type)
  (t2/with-transaction [_conn]
    (let [existing-output       (t2/select-one :model/WorkspaceOutput
                                               :workspace_id workspace-id
                                               :ref_id ref-id)
          output-lookup         (build-output-lookup workspace-id)
          existing-input-lookup (build-input-lookup workspace-id)
          current-edges         (current-edge-specs workspace-id ref-id)]
      (upsert-workspace-output! workspace-id ref-id output existing-output)
      (let [{internal-inputs true external-inputs false} (group-by (fn [{:keys [database_id schema table]}]
                                                                     (contains? output-lookup [database_id schema table]))
                                                                   inputs)
            input-id-lookup (ensure-workspace-inputs! workspace-id external-inputs existing-input-lookup)
            new-dep-specs (concat
                           (for [{:keys [database_id schema table]} internal-inputs]
                             {:to_entity_type :output
                              :to_entity_id   (get output-lookup [database_id schema table])})
                           (for [{:keys [database_id schema table]} external-inputs]
                             {:to_entity_type :input
                              :to_entity_id   (get input-id-lookup [database_id schema table])}))
            new-dep-specs-set (set new-dep-specs)
            edges-to-create (set/difference new-dep-specs-set current-edges)
            edges-to-delete (set/difference current-edges new-dep-specs-set)]
        (create-dependency-edges! workspace-id ref-id edges-to-create)
        (delete-stale-edges! workspace-id ref-id edges-to-delete)))))
