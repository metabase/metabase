(ns metabase.remote-sync.core
  (:require
   [metabase.api.common :as api]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

;;; ------------------------------------------------ Workspace membership ---------------------------------------------

(defn check-parent-same-workspace
  "`before-update` guard throwing a 400 when `parent-key` (e.g. `:collection_id`) changes to a parent in a
  different workspace than this row's — content cannot move into, out of, or between workspaces except through a
  pull. `parent-model` is the parent's model. Returns nil; call for side effect."
  [instance parent-model parent-key]
  (when (contains? (t2/changes instance) parent-key)
    (let [current (:workspace_id (t2/original instance))
          target  (when-let [parent-id (get instance parent-key)]
                    (t2/select-one-fn :workspace_id parent-model :id parent-id))]
      (when (not= current target)
        (throw (ex-info (tru "Cannot move content into or out of a remote sync workspace.")
                        {:status-code        400
                         :workspace-id        current
                         :target-workspace-id target})))))
  nil)

(defn workspace-accessible?
  "Whether `instance` is accessible to the current user under workspace isolation: its `:workspace_id` matches the
  user's active workspace, where nil is the main app. Instances that carry no `:workspace_id` key — rows of models
  that aren't workspace-scoped — are always accessible. AND this into a workspace-scoped model's `can-read?`/
  `can-write?` so main users never see workspace content and workspace users never see main (or other workspaces')
  content."
  [instance]
  (or (not (contains? instance :workspace_id))
      (= (:workspace_id instance) api/*current-workspace-id*)))

(defn workspace-visibility-clause
  "HoneySQL predicate selecting rows visible to the current user: rows whose workspace matches the user's active
  workspace, where nil (no workspace) is the main app. `column` defaults to `:workspace_id`; pass a qualified column
  when the query joins other tables.

  The active workspace id is inlined into the generated SQL rather than passed as a JDBC bind parameter, matching
  the other scalar config values (e.g. trash/archive-operation ids) baked into
  [[metabase.collections.models.collection/visible-collection-query]]. This clause is typically embedded inside a
  `WITH` CTE that's itself referenced from a nested derived-table subquery (see the collection children assembler
  in `metabase.collections-rest.api`); at least one app-db driver (H2) silently drops the bound parameter's value
  in that shape, so the query runs without error but returns zero rows. Inlining sidesteps the issue -- the value
  being inlined is a trusted server-side var, never user input. `nil` (main app) is left unparameterized so Honey
  SQL still emits `IS NULL` rather than the always-false `= NULL`."
  ([] (workspace-visibility-clause :workspace_id))
  ([column]
   (let [workspace-id api/*current-workspace-id*]
     (if (nil? workspace-id)
       [:= column nil]
       [:= column [:inline workspace-id]]))))

(defenterprise collection-editable?
  "Returns if remote-synced collections are editable. Takes a collection to check for eligibility.

  Always true on OSS."
  metabase-enterprise.remote-sync.core
  [_collection]
  true)

(defenterprise table-editable?
  "Returns if a table's metadata can be edited. Takes a table to check.

  Returns false if the table is published, in a remote-synced collection, and remote-sync-type is :read-only.
  Always true on OSS."
  metabase-enterprise.remote-sync.core
  [_table]
  true)

(defenterprise transforms-editable?
  "Returns if transforms can be edited.

  Returns false if remote-sync is enabled and remote-sync-type is :read-only.
  Always true on OSS."
  metabase-enterprise.remote-sync.core
  []
  true)

(defenterprise model-editable?
  "Determines if a model instance is editable based on remote sync configuration.

   Returns false if the instance is eligible for remote sync AND remote-sync-type
   is :read-only. Always returns true on OSS.

   For models with global eligibility (e.g., :setting, :library-synced), the instance
   can be nil or empty map."
  metabase-enterprise.remote-sync.core
  [_model-key _instance]
  true)

(defenterprise batch-model-editable?
  "Batch version of model-editable?. Returns a map of instance-id -> editable? boolean.

   OSS always returns true for all instances."
  metabase-enterprise.remote-sync.core
  [_model-key instances]
  (into {} (map (fn [inst] [(:id inst) true])) instances))

(defenterprise batch-model-eligible?
  "Batch check if model instances are eligible for remote sync based on spec rules.
   Returns a map of instance-id -> eligible? boolean.

   This checks if instances would be synced when remote sync is active, accounting
   for special eligibility types like :library-synced for snippets.

   OSS uses collection-based eligibility: an instance is eligible if it's in a collection
   with is_remote_synced=true. Collections are eligible if they have is_remote_synced=true.
   EE extends this with spec-based eligibility rules for special models like snippets
   (Library-synced) and transforms (setting-based)."
  metabase-enterprise.remote-sync.core
  [model-key instances]
  (if (= model-key :model/Collection)
    ;; For Collections, check their own is_remote_synced flag
    (into {}
          (map (fn [inst]
                 [(:id inst) (boolean (:is_remote_synced inst))]))
          instances)
    ;; For other models, check if they're in a remote-synced collection
    (let [collection-ids (into #{} (keep :collection_id) instances)
          remote-synced-coll-ids (when (seq collection-ids)
                                   (t2/select-pks-set :model/Collection
                                                      :id [:in collection-ids]
                                                      :is_remote_synced true))]
      (into {}
            (map (fn [inst]
                   [(:id inst)
                    (boolean (contains? remote-synced-coll-ids (:collection_id inst)))]))
            instances))))
