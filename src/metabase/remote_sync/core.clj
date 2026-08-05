(ns metabase.remote-sync.core
  (:require
   [metabase.api.common :as api]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defn worktree-accessible?
  "Whether the current user may see or edit `instance`: content checked out into a remote-sync worktree is
  admin-only, always. Main-app content (`:worktree_id` `nil`) is not restricted here. AND this into a
  worktree-scoped model's `can-read?` / `can-write?` / `can-create?`."
  [instance]
  (or (nil? (:worktree_id instance))
      api/*is-superuser?*))

(defn check-worktree-exists!
  "Returns `worktree-id`, 404ing when it names no remote-sync worktree. The FK would reject a bogus id anyway,
  but as a 500 rather than the 404 the remote-sync endpoints give for the same input.

  Queries the table rather than `:model/Worktree`: the model is enterprise-only, while the table and
  its foreign keys exist on both editions."
  [worktree-id]
  (when worktree-id
    (api/check-404 (seq (t2/query {:select [[[:inline 1] :one]]
                                   :from   [:worktree]
                                   :where  [:= :id worktree-id]}))))
  worktree-id)

(defn check-same-worktree
  "Guard throwing a 400 when a row's `worktree_id` and its container's disagree -- content never moves into, out
  of, or between worktrees. `container-worktree-id` is the worktree of whatever contains the row (its collection,
  its transform).

  Call this only when the row actually has a container: content at the root -- a null `collection_id`, a
  collection at `/` -- has nothing to compare against. Whether a root is a legal place for the row at all is a
  separate question, and one only its own model can answer; see
  [[metabase.collections.models.collection/check-same-worktree]]. Returns nil; call for side effect."
  [instance container-worktree-id]
  (when (not= (:worktree_id instance) container-worktree-id)
    (throw (ex-info (tru "Cannot move content into or out of a remote sync worktree.")
                    {:status-code        400
                     :worktree-id        (:worktree_id instance)
                     :target-worktree-id container-worktree-id})))
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
