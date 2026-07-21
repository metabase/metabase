(ns metabase.remote-sync.core
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [toucan2.core :as t2]))

(defenterprise current-branch
  "The git branch context for the current request/operation: the explicit sync
   binding when set, otherwise the current user's checked-out branch, otherwise
   the instance's global sync branch. Nil when remote sync is not in play.
   OSS: always nil."
  metabase-enterprise.remote-sync.branching
  []
  nil)

(defn stamp-branch
  "before-insert helper for content models: when the row has no explicit
   `:branch`, targets a remote-synced collection, and the request runs in a
   branch context, stamp the current branch on it — so content created at
   runtime lands on the creator's branch (or the main sync branch) without
   waiting for the next sync. No-op otherwise."
  [{:keys [collection_id] :as row}]
  (if-let [b (and (nil? (:branch row))
                  (or collection_id (:is_remote_synced row))
                  (current-branch))]
    (if (or (:is_remote_synced row)
            (t2/exists? :model/Collection :id collection_id :is_remote_synced true))
      (assoc row :branch b)
      row)
    row))

(defn stamp-branch-on-move
  "before-update helper for content models: when the row moves between
   collections, recompute `:branch` from the target collection — the current
   branch when it is remote-synced, NULL otherwise. An explicit `:branch` in
   the update wins. No-op when `:collection_id` is not changing."
  [instance]
  (let [changes (t2/changes instance)]
    (if (and (contains? changes :collection_id)
             (not (contains? changes :branch)))
      (assoc instance :branch
             (when-let [b (current-branch)]
               (when (and (:collection_id changes)
                          (t2/exists? :model/Collection
                                      :id (:collection_id changes)
                                      :is_remote_synced true))
                 b)))
      instance)))

(def branched-content-hook
  "t2 hook keyword for content models with a git-sync `branch` column. Deriving a
   model from this stamps `:branch` from the target collection on insert and
   re-stamps it when a row moves between collections."
  :hook/branched-content)

(t2/define-before-insert :hook/branched-content
  [row]
  (stamp-branch row))

(t2/define-before-update :hook/branched-content
  [row]
  (stamp-branch-on-move row))

(defn branch-filter-clause
  "HoneySQL WHERE clause restricting branchable content to the current branch:
   rows with a NULL `branch` (not under git sync) are always visible; branch rows
   only on their own branch. Returns nil — no filtering — when there is no branch
   context. Use in every query that fetches branchable entities."
  ([] (branch-filter-clause :branch))
  ([branch-col]
   (when-let [b (current-branch)]
     [:or [:= branch-col nil] [:= branch-col b]])))

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
