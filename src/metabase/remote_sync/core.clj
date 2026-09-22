(ns metabase.remote-sync.core
  (:require
   [metabase.api.common :as api]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.db :as remote-sync.db]))

(def ^:dynamic *worktree-id*
  "The remote-sync worktree the request works in, or nil for the main app. Never inferred from who is asking: every
  endpoint that can work inside a worktree declares where its id comes from in its `:worktree` metadata -- a
  parameter it takes, or the entity it is about -- and `metabase.api.macros` binds this from that declaration for
  the duration of the request."
  nil)

(defn current-worktree-id
  "The remote-sync worktree the request works in; nil is the main app."
  []
  *worktree-id*)

(defenterprise check-worktree-exists!
  "404s when `worktree-id` names no remote-sync worktree. Returns nil; call for side effect.

  Worktrees are an enterprise feature, so on OSS any non-nil id names one that cannot exist."
  metabase-enterprise.remote-sync.core
  [worktree-id]
  (api/check-404 (nil? worktree-id))
  nil)

(defn check-worktree-access!
  "Refuse a request that asks for a worktree's content unless the worktree exists and the caller is an admin.
  Reading or writing a branch means touching a working copy of another world, which only admins may do; a nil
  `worktree-id` asks for the main app and is always allowed. Returns nil; call for side effect."
  [worktree-id]
  (when worktree-id
    (api/check-superuser)
    (check-worktree-exists! worktree-id))
  nil)

(defn do-with-worktree
  "Run `thunk` with [[*worktree-id*]] bound to `worktree-id`. Impl for the `:worktree` endpoint declaration; call it
  directly only from code that owns a worktree outright, such as a pull or a push."
  [worktree-id thunk]
  (binding [*worktree-id* worktree-id]
    (thunk)))

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
                                   (remote-sync.db/remote-synced-collection-ids collection-ids))]
      (into {}
            (map (fn [inst]
                   [(:id inst)
                    (boolean (contains? remote-synced-coll-ids (:collection_id inst)))]))
            instances))))
