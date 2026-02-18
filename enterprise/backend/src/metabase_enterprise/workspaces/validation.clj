(ns metabase-enterprise.workspaces.validation
  "Validation of workspace changes against downstream dependencies.

   ASSUMPTION: All transforms in the workspace have been run, and their outputs are not stale.
   This validation checks the *current* isolated table schema against external transform requirements.

   ## Problem Types

   See `metabase-enterprise.workspaces.types/problem-types` for the full list of problem types
   with their descriptions, severity levels, and merge-blocking behavior.

   ## Currently Implemented

   | Category            | Problem       | Description                                                    |
   |---------------------|---------------|----------------------------------------------------------------|
   | unused              | not-run       | Output hasn't been created, nothing depends on it              |
   | internal-downstream | not-run       | Output hasn't been created, other workspace transforms need it |
   | external-downstream | not-run       | Output hasn't been created, external transforms need it        |
   | external-downstream | removed-field | Field was removed that external transforms reference           |"
  (:require
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
  (let [replacement-field-names (into #{} (map :name) replacement-fields)
        ;; TODO (Chris 2026-02-02) -- better to do 1 query up-front for *all* the tables we will validate.
        table-field-id?         (t2/select-fn-set :id [:model/Field :id] :table_id target-table-id)]
    (reify
      lib.metadata.protocols/MetadataProvider
      (database [_this]
        (lib.metadata.protocols/database base-provider))
      (metadatas [_this metadata-spec]
       ;; Yes, for some reason :id is actually a set of ids
        (let [{spec-type :lib/type spec-field-ids :id} metadata-spec]
          (if (and (= :metadata/column spec-type) (some table-field-id? spec-field-ids))
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

(defn- workspace-outputs
  "Get all workspace outputs with their global and isolated table info.
   Includes both workspace transform outputs and enclosed external transform outputs."
  [workspace-id]
  ;; TODO (Chris 2026-02-02) -- rather fetch all this as an input to graph analysis, and save it in [[graph]].
  (let [ws-outputs  (t2/select [:model/WorkspaceOutput
                                :id :ref_id :db_id
                                :global_schema :global_table :global_table_id
                                :isolated_schema :isolated_table :isolated_table_id]
                               :workspace_id workspace-id)
        ;; External outputs use transform_id (int) instead of ref_id (string)
        ;; Map transform_id to ref_id for compatibility with the rest of the validation code
        ext-outputs (map #(assoc % :ref_id (:transform_id %) :external? true)
                         (t2/select [:model/WorkspaceOutputExternal
                                     :id :transform_id :db_id
                                     :global_schema :global_table :global_table_id
                                     :isolated_schema :isolated_table :isolated_table_id]
                                    :workspace_id workspace-id))]
    (concat ws-outputs ext-outputs)))

(defn- ids-for-type [entities desired-node-type]
  (for [{:keys [node-type id]} entities, :when (= node-type desired-node-type)] id))

(defn- checked-out-transform-ids
  "Get the global IDs of transforms that are checked out into this workspace.
   Extracts workspace-transform ref_ids from the graph and looks up their global_ids."
  [{:keys [entities] :as _graph}]
  (if-let [ref-ids (seq (ids-for-type entities :workspace-transform))]
    ;; TODO (Chris 2026-02-02) -- rather fetch this as an input to graph analysis, and save it in [[graph]].
    (t2/select-fn-set :global_id
                      [:model/WorkspaceTransform :global_id]
                      :ref_id [:in ref-ids]
                      {:where [:not= :global_id nil]})
    #{}))

(defn- enclosed-transform-ids
  "Get the IDs of external transforms that are enclosed by the workspace graph.
   These transforms run within the workspace, so they don't need further static validation."
  [{:keys [entities] :as _graph}]
  (ids-for-type entities :external-transform))

(def ^:private table? #{:table})

(defn- internal-dependents
  "Build a map of non-table ids to the non-table ids that directly depend on it (internal to workspace).
   This is essentially an inversion of the dependencies map, with some filtering."
  [{:keys [dependencies] :as _graph}]
  ;; :dependencies is {child #{parents...}}, we need to invert to {parent #{children...}}
  (reduce (fn [acc [{child-type :node-type, child-id :id} parents]]
            (if (table? child-type)
              acc
              (reduce (fn [acc {parent-type :node-type, parent-id :id}]
                        (if (table? parent-type)
                          acc
                          (update acc parent-id (fnil conj #{}) child-id)))
                      acc
                      parents)))
          {}
          dependencies))

(defn- external-transform-dependents
  "Get external transforms that depend on a given table (by global_table_id).
   Excludes transforms that are checked out or enclosed in the workspace."
  [global-table-id checked-out-ids enclosed-ids]
  (when global-table-id
    (let [dependent-transform-ids (t2/select-fn-set :from_entity_id
                                                    [:model/Dependency :from_entity_id]
                                                    :to_entity_type :table
                                                    :to_entity_id global-table-id
                                                    :from_entity_type :transform)
          ;; Remove checked out and enclosed transforms
          external-ids            (-> dependent-transform-ids
                                      (disj nil)
                                      (as-> ids (apply disj ids checked-out-ids))
                                      (as-> ids (apply disj ids enclosed-ids)))]
      (when (seq external-ids)
        (t2/select [:model/Transform :id :name :source] :id [:in external-ids])))))

;;;; ---------------------------------------- Validation Logic ----------------------------------------

(defn- validate-transform-against-fields
  "Check if a transform would break given a modified set of fields.
   Returns bad refs if the transform's query references fields that don't exist in replacement-fields,
   or nil if there are no bad refs."
  [transform global-table-id replacement-fields]
  (let [db-id (get-in transform [:source :query :database])]
    (when db-id
      (let [base-provider     (lib-be/application-database-metadata-provider db-id)
            override-provider (make-field-override-provider base-provider global-table-id replacement-fields)
            query             (lib/query override-provider (get-in transform [:source :query]))]
        (not-empty (lib/find-bad-refs query))))))

(defn- get-table-fields
  "Get all active fields for a table by ID."
  [table-id]
  (when table-id
    (t2/select [:model/Field :id :name :base_type :semantic_type]
               :table_id table-id
               :active true)))

(defn- make-problem
  "Construct a problem map with type metadata from ws.t/problem-types.
   Splits the namespaced problem-type into :category and :problem keys."
  [problem-type data]
  (let [{:keys [severity block-merge description]} (get ws.t/problem-types problem-type)]
    {:category    (keyword (namespace problem-type))
     :problem     (keyword (name problem-type))
     :severity    severity
     :block_merge block-merge
     :description description
     :data        data}))

(defn- problems-for-output
  "Find problems related to a single workspace output.
   Returns a sequence of problem maps."
  [output checked-out-ids enclosed-ids internal-dependents-map]
  (let [{:keys [ref_id db_id global_schema global_table global_table_id
                isolated_table_id external?]} output
        ;; For external outputs, ref_id is actually the transform_id (an int)
        transform-type           (if external? :external-transform :workspace-transform)
        external-transforms      (external-transform-dependents global_table_id checked-out-ids enclosed-ids)
        has-external-dependents? (seq external-transforms)
        internal-dependents      (get internal-dependents-map ref_id)
        has-internal-dependents? (seq internal-dependents)
        table-coord              {:db_id db_id :schema global_schema :table global_table}]

    (cond
      ;; Case 1: Isolated table doesn't exist yet
      (nil? isolated_table_id)
      (cond
        ;; External transforms depend on this output that doesn't exist
        has-external-dependents?
        [(make-problem :external-downstream/not-run
                       {:output     table-coord
                        :transform  {:type transform-type
                                     :id   ref_id}
                        :dependents (mapv (fn [{:keys [id name]}]
                                            {:type :external-transform
                                             :id   id
                                             :name name})
                                          external-transforms)})]
        ;; Internal workspace transforms depend on this output that doesn't exist
        has-internal-dependents?
        [(make-problem :internal-downstream/not-run
                       {:output     table-coord
                        :transform  {:type transform-type
                                     :id   ref_id}
                        :dependents (mapv (fn [dep-ref-id]
                                            {:type :workspace-transform
                                             :id   dep-ref-id})
                                          internal-dependents)})]
        ;; No dependents - just informational
        :else
        [(make-problem :unused/not-run
                       {:output    table-coord
                        :transform {:type transform-type
                                    :id   ref_id}})])

      ;; Case 2: Isolated table exists - check for field breakages
      has-external-dependents?
      (let [isolated-fields (get-table-fields isolated_table_id)]
        (into []
              (mapcat (fn [transform]
                        (when-let [bad-refs (validate-transform-against-fields
                                             transform global_table_id isolated-fields)]
                          [(make-problem :external-downstream/removed-field
                                         {:output    table-coord
                                          :transform {:type :external-transform
                                                      :id   (:id transform)
                                                      :name (:name transform)}
                                          :bad-refs  bad-refs})])))
              external-transforms))

      ;; Case 3: No problems
      :else [])))

;;;; ---------------------------------------- Public API ----------------------------------------

(defn find-downstream-problems
  "Find problems that would affect transforms outside the workspace after merge.

   Takes the workspace graph (from `ws.dag/path-induced-subgraph`) as an argument.

   Returns a sequence of problem maps, each with:
   - :category    - the problem category (e.g. :unused, :internal-downstream, :external-downstream)
   - :problem     - the specific problem (e.g. :not-run, :removed-field)
   - :severity    - :error, :warning, or :info
   - :block-merge - whether this problem should prevent merging
   - :data        - further data, depending on type

   Currently implemented problem types (category + problem):
   -              :unused/not-run       - output table hasn't been created (informational, no dependents)
   - :internal-downstream/not-run       - output table hasn't been created, other workspace transforms need it
   - :external-downstream/not-run       - output table hasn't been created, but external transforms depend on it
   - :external-downstream/removed-field - a field was removed that external transforms need"
  [workspace-id graph]
  (let [outputs         (workspace-outputs workspace-id)
        checked-out-ids (checked-out-transform-ids graph)
        enclosed-ids    (enclosed-transform-ids graph)
        dependents      (internal-dependents graph)]
    (into []
          (mapcat #(problems-for-output % checked-out-ids enclosed-ids dependents))
          outputs)))
