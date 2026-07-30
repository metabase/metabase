(ns metabase.remote-sync.core
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defn worktree-id-of
  "The `worktree_id` of the `parent-model` row with `parent-id`, or `nil` when there is no parent."
  [parent-model parent-id]
  (when parent-id
    (t2/select-one-fn :worktree_id parent-model :id parent-id)))

(defn check-worktree-create-allowed
  "Returns `instance`, having checked that the current user may create it: content in a worktree is admin-only. A
  pull, which materializes a worktree without a user, is exempt."
  [instance]
  (when (and (:worktree_id instance) (not mi/*deserializing?*))
    (api/check-superuser))
  instance)

(defn inherit-worktree-id
  "`before-insert` helper stamping `instance`'s `:worktree_id` from the parent that `parent-key` (e.g.
  `:collection_id`) points at, so new content lands in the same worktree as the parent it is created under. A row
  with no parent -- a worktree's root content -- keeps the `:worktree_id` it was given.

  Creating content in a worktree is admin-only, whether the worktree was inherited or passed in; a pull, which runs
  without a user, is exempt."
  [instance parent-model parent-key]
  (check-worktree-create-allowed
   (if-let [parent-id (get instance parent-key)]
     (assoc instance :worktree_id (worktree-id-of parent-model parent-id))
     instance)))

(defn check-parent-same-worktree
  "`before-update` guard throwing a 400 when `parent-key` (e.g. `:collection_id`) changes to a parent in a different
  worktree than this row's -- content cannot move into, out of, or between worktrees. `parent-model` is the parent's
  model. Returns nil; call for side effect."
  [instance parent-model parent-key]
  (when (contains? (t2/changes instance) parent-key)
    (let [current (:worktree_id (t2/original instance))
          target  (worktree-id-of parent-model (get instance parent-key))]
      (when (not= current target)
        (throw (ex-info (tru "Cannot move content into or out of a remote sync worktree.")
                        {:status-code        400
                         :worktree-id        current
                         :target-worktree-id target})))))
  nil)

(defn check-worktree-id-unchanged
  "`before-update` guard rejecting a direct write to `worktree_id`: membership is derived from the parent, never
  edited. Returns nil; call for side effect."
  [instance]
  (when (contains? (t2/changes instance) :worktree_id)
    (throw (ex-info (tru "A worktree_id cannot be changed.") {:status-code 400})))
  nil)

(defn remove-worktree-id-helper
  "`after-select` helper dropping the generated `worktree_id_helper` column (it backs per-worktree entity_id
  uniqueness) so it can never make it back into an INSERT or UPDATE."
  [instance]
  (dissoc instance :worktree_id_helper))

(defn worktree-accessible?
  "Whether `instance` is accessible to the current user: worktree content is admin-only, main-app content
  (`:worktree_id` `nil`) is not restricted here. AND this into a worktree-scoped model's `can-read?` /
  `can-write?` / `can-create?`."
  [instance]
  (or (nil? (:worktree_id instance))
      api/*is-superuser?*))

(defn exclude-worktrees-clause
  "HoneySQL predicate matching only main-app rows (`worktree_id IS NULL`). Listings take it unless they were asked
  to include worktree content, so browsing the app never mixes in a worktree's copy of everything. `column`
  defaults to `:worktree_id`; pass a qualified column when the query joins other tables."
  ([] (exclude-worktrees-clause :worktree_id))
  ([column]
   [:= column nil]))

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
