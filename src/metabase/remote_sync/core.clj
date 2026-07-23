(ns metabase.remote-sync.core
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

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

(defn non-worktree-filter-clause
  "HoneySQL clause matching only main-app rows — those not materialized by a remote-sync worktree
  checkout. `column` defaults to `:remote_sync_worktree_id`; pass a qualified column when the query
  joins other tables."
  ([] (non-worktree-filter-clause :remote_sync_worktree_id))
  ([column]
   [:= column nil]))

(defn inherit-worktree-id
  "Derive a row's `:remote_sync_worktree_id` from its parent entity (`parent-key` on the row, a
  `parent-model` id): rows belong to the remote-sync worktree of whatever contains them, and nil — no
  parent, or a main-app parent — is the main app, which is not a worktree. The column is derived, never
  client-supplied. Call from a model's `before-insert`."
  [instance parent-model parent-key]
  (assoc instance :remote_sync_worktree_id
         (when-let [parent-id (get instance parent-key)]
           (t2/select-one-fn :remote_sync_worktree_id parent-model :id parent-id))))

(defn check-same-worktree
  "Throw a 400 when an update would change a row's remote-sync worktree membership: `parent-key`
  changed to a parent whose `:remote_sync_worktree_id` differs from the row's. Content cannot move
  into, out of, or between worktrees except through a pull — a worktree must stay a faithful
  materialization of its branch. Call from a model's `before-update`; returns `instance`."
  [instance parent-model parent-key]
  (when (contains? (t2/changes instance) parent-key)
    (let [current (:remote_sync_worktree_id (t2/original instance))
          target  (when-let [parent-id (get instance parent-key)]
                    (t2/select-one-fn :remote_sync_worktree_id parent-model :id parent-id))]
      (when (not= current target)
        (throw (ex-info (tru "Cannot move content into or out of a remote sync worktree.")
                        {:status-code 400
                         :remote-sync-worktree-id current
                         :target-worktree-id      target})))))
  instance)

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
