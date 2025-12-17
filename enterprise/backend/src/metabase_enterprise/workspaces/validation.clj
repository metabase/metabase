(ns metabase-enterprise.workspaces.validation
  "Validation of workspace changes against downstream dependencies.

   ASSUMPTION: All transforms in the workspace have been run, and their outputs are not stale.
   This validation checks the *current* isolated table schema against external transform requirements.

   ## Problem Types

   See `metabase-enterprise.workspaces.types/problem-types` for the full list of problem types
   with their descriptions, severity levels, and merge-blocking behavior.

   ## Currently Implemented

   | Type                                | Description                                              |
   |-------------------------------------|----------------------------------------------------------|
   | unused-not-run                      | Output hasn't been created, nothing depends on it        |
   | external-downstream-not-run         | Output hasn't been created, external transforms need it  |
   | external-downstream-removed-field   | Field was removed that external transforms reference     |"
  (:require
   [metabase-enterprise.workspaces.dag :as ws.dag]
   [metabase-enterprise.workspaces.types :as ws.t]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;;; ---------------------------------------- Metadata Provider Override ----------------------------------------

(defn- make-field-override-provider
  "Create a metadata provider that overrides a table's fields with a different set of fields.
   Used to simulate what external transforms would see after a merge.

   - `base-provider`: the underlying metadata provider
   - `target-table-id`: the global table ID whose fields we're overriding
   - `replacement-fields`: the fields from the isolated table (what fields will exist after merge)"
  [base-provider target-table-id replacement-fields]
  (let [replacement-field-names (into #{} (map :name) replacement-fields)]
    (reify
      lib.metadata.protocols/MetadataProvider
      (database [_this]
        (lib.metadata.protocols/database base-provider))
      (metadatas [_this metadata-spec]
        (let [{spec-type :lib/type spec-table-id :table-id} metadata-spec]
          (if (and (= spec-type :metadata/column)
                   (= spec-table-id target-table-id))
            ;; Return replacement fields with :active based on whether they exist
            (let [original-fields (lib.metadata.protocols/metadatas base-provider metadata-spec)]
              (map (fn [field]
                     (if (contains? replacement-field-names (:name field))
                       field
                       (assoc field :active false)))
                   original-fields))
            ;; Delegate everything else
            (lib.metadata.protocols/metadatas base-provider metadata-spec))))
      (setting [_this setting-key]
        (lib.metadata.protocols/setting base-provider setting-key))

      lib.metadata.protocols/CachedMetadataProvider
      (cached-metadatas [_this metadata-type metadata-ids]
        (lib.metadata.protocols/cached-metadatas base-provider metadata-type metadata-ids))
      (store-metadata! [_this a-metadata]
        (lib.metadata.protocols/store-metadata! base-provider a-metadata))
      (cached-value [_this k not-found]
        (lib.metadata.protocols/cached-value base-provider k not-found))
      (cache-value! [_this k v]
        (lib.metadata.protocols/cache-value! base-provider k v))
      (has-cache? [_this]
        (lib.metadata.protocols/has-cache? base-provider))
      (clear-cache! [_this]
        (lib.metadata.protocols/clear-cache! base-provider)))))

;;;; ---------------------------------------- External Transform Discovery ----------------------------------------

(defn- get-workspace-outputs
  "Get all workspace outputs with their global and isolated table info."
  [workspace-id]
  (t2/select [:model/WorkspaceOutput
              :id :ref_id :db_id
              :global_schema :global_table :global_table_id
              :isolated_schema :isolated_table :isolated_table_id]
             :workspace_id workspace-id))

(defn- get-checked-out-transform-ids
  "Get the global IDs of transforms that are checked out into this workspace."
  [workspace-id]
  (into #{} (t2/select-fn-set :global_id
                              [:model/WorkspaceTransform :global_id]
                              :workspace_id workspace-id
                              {:where [:not= :global_id nil]})))

(defn- get-enclosed-transform-ids
  "Get the IDs of external transforms that are enclosed by the workspace graph.
   These transforms run within the workspace, so they don't need validation."
  [workspace-id]
  (let [changeset (t2/select-fn-vec (fn [{:keys [ref_id]}]
                                      {:entity-type :transform, :id ref_id})
                                    [:model/WorkspaceTransform :ref_id]
                                    :workspace_id workspace-id)
        {:keys [entities]} (ws.dag/path-induced-subgraph workspace-id changeset)]
    ;; Extract IDs of external transforms from the graph
    (into #{} (keep (fn [{:keys [node-type id]}]
                      (when (= node-type :external-transform)
                        id)))
          entities)))

(defn- get-external-transform-dependents
  "Get external transforms that depend on a given table (by global_table_id).
   Excludes transforms that are checked out or enclosed in the workspace."
  [global-table-id checked-out-ids enclosed-ids]
  (when global-table-id
    (let [dependent-transform-ids
          (t2/select-fn-set :from_entity_id
                            [:model/Dependency :from_entity_id]
                            :to_entity_type :table
                            :to_entity_id global-table-id
                            :from_entity_type :transform)
          ;; Filter out checked out and enclosed transforms
          external-ids (-> dependent-transform-ids
                           (disj nil)
                           (as-> ids (apply disj ids checked-out-ids))
                           (as-> ids (apply disj ids enclosed-ids)))]
      (when (seq external-ids)
        (t2/select [:model/Transform :id :name :source] :id [:in external-ids])))))

;;;; ---------------------------------------- Validation Logic ----------------------------------------

(defn- validate-transform-against-fields
  "Check if a transform would break given a modified set of fields.
   Returns bad refs if the transform's query references fields that don't exist in replacement-fields."
  [transform global-table-id replacement-fields]
  (let [db-id (get-in transform [:source :query :database])]
    (when db-id
      (let [base-provider (lib-be/application-database-metadata-provider db-id)
            override-provider (make-field-override-provider base-provider global-table-id replacement-fields)
            query (lib/query override-provider (get-in transform [:source :query]))]
        (lib/find-bad-refs query)))))

(defn- get-table-fields
  "Get all active fields for a table by ID."
  [table-id]
  (when table-id
    (t2/select [:model/Field :id :name :base_type :semantic_type]
               :table_id table-id
               :active true)))

(defn- make-problem
  "Construct a problem map with type metadata from ws.t/problem-types."
  [problem-type data]
  (let [{:keys [severity blocks-merge?]} (get ws.t/problem-types problem-type)]
    {:type          problem-type
     :severity      severity
     :blocks-merge? blocks-merge?
     :data          data}))

(defn- find-problems-for-output
  "Find problems related to a single workspace output.
   Returns a sequence of problem maps."
  [output checked-out-ids enclosed-ids]
  (let [{:keys [ref_id db_id global_schema global_table global_table_id
                isolated_table_id]} output
        external-transforms (get-external-transform-dependents global_table_id checked-out-ids enclosed-ids)
        has-external-dependents? (seq external-transforms)
        table-coord {:db_id db_id :schema global_schema :table global_table}]

    (cond
      ;; Case 1: Isolated table doesn't exist yet
      (nil? isolated_table_id)
      (if has-external-dependents?
        ;; External transforms depend on this output that doesn't exist
        [(make-problem :external-downstream-not-run
                       {:output table-coord
                        :transform {:type :workspace-transform
                                    :id ref_id}
                        :dependents (mapv (fn [{:keys [id name]}]
                                            {:type :global-transform
                                             :id id
                                             :name name})
                                          external-transforms)})]
        ;; No external dependents - just informational
        [(make-problem :unused-not-run
                       {:output table-coord
                        :transform {:type :workspace-transform
                                    :id ref_id}})])

      ;; Case 2: Isolated table exists - check for field breakages
      has-external-dependents?
      (let [isolated-fields (get-table-fields isolated_table_id)]
        (into []
              (mapcat (fn [transform]
                        (when-let [bad-refs (validate-transform-against-fields
                                             transform global_table_id isolated-fields)]
                          [(make-problem :external-downstream-removed-field
                                         {:output table-coord
                                          :transform {:type :global-transform
                                                      :id (:id transform)
                                                      :name (:name transform)}
                                          :bad-refs bad-refs})])))
              external-transforms))

      ;; Case 3: No problems
      :else [])))

;;;; ---------------------------------------- Public API ----------------------------------------

(defn find-downstream-problems
  "Find problems that would affect transforms outside the workspace after merge.

   Returns a sequence of problem maps, each with:
   - :type - the problem type keyword (see ws.t/problem-types)
   - :severity - :error, :warning, or :info
   - :blocks-merge? - whether this problem should prevent merging
   - :data - polymorphic data depending on type

   Currently implemented problem types:
   - :external-downstream-not-run - output table hasn't been created, but external transforms depend on it
   - :external-downstream-removed-field - a field was removed that external transforms need
   - :unused-not-run - output table hasn't been created (informational, no dependents)"
  [workspace-id]
  (let [outputs (get-workspace-outputs workspace-id)
        checked-out-ids (get-checked-out-transform-ids workspace-id)
        enclosed-ids (get-enclosed-transform-ids workspace-id)]
    (into []
          (mapcat #(find-problems-for-output % checked-out-ids enclosed-ids))
          outputs)))
