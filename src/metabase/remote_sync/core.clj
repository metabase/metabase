(ns metabase.remote-sync.core
  (:require
   [metabase.api.common :as api]
   [metabase.premium-features.core :refer [defenterprise]]
   [toucan2.core :as t2]))

(defenterprise worktree-accessible?
  "Whether the current user may see or edit `instance`: content checked out into a remote-sync worktree is
  admin-only, always. Main-app content (`:worktree_id` `nil`) is not restricted here. AND this into a
  worktree-scoped model's `can-read?` / `can-write?` / `can-create?`.

  Always true on OSS: worktrees are an enterprise feature, so there are none to hide."
  metabase-enterprise.remote-sync.core
  [_instance]
  true)

(defenterprise check-worktree-exists!
  "404s when `worktree-id` names no remote-sync worktree. Returns nil; call for side effect.

  Worktrees are an enterprise feature, so on OSS any non-nil id names one that cannot exist."
  metabase-enterprise.remote-sync.core
  [worktree-id]
  (api/check-404 (nil? worktree-id))
  nil)

(defenterprise check-same-worktree
  "Guard throwing a 400 when a row's `worktree_id` and its container's disagree -- content never moves into, out
  of, or between worktrees. `container-worktree-id` is the worktree of whatever contains the row (its collection,
  its transform).

  Call this only when the row actually has a container: content at the root -- a null `collection_id`, a
  collection at `/` -- has nothing to compare against. Whether a root is a legal place for the row at all is a
  separate question, and one only its own model can answer; see
  [[metabase.collections.models.collection/check-same-worktree]].

  On OSS there are no worktrees, so nothing can disagree. Returns nil; call for side effect."
  metabase-enterprise.remote-sync.core
  [_instance _container-worktree-id]
  nil)

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

(defenterprise transform-editable?
  "Whether `transform` can be edited.

  Returns false if remote-sync is enabled and remote-sync-type is :read-only. A transform checked out into a
  worktree is exempt: a worktree tracks its own branch, so the main app's setting says nothing about it.
  Always true on OSS."
  metabase-enterprise.remote-sync.core
  [_transform]
  true)

(defenterprise snippet-editable?
  "Whether `snippet` can be edited.

  Returns false when the Library is remote-synced and remote-sync-type is :read-only. A snippet checked out into
  a worktree is exempt: a worktree tracks its own branch, so the main app's setting says nothing about it.
  Always true on OSS."
  metabase-enterprise.remote-sync.core
  [_snippet]
  true)

(defenterprise batch-snippet-editable?
  "Batch version of [[snippet-editable?]], for hydrating `:can_write` over a list without a query per snippet.
  Returns a map of snippet id -> editable? boolean.

  Always true on OSS."
  metabase-enterprise.remote-sync.core
  [snippets]
  (into {} (map (fn [snippet] [(:id snippet) true])) snippets))

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
