(ns metabase.remote-sync.core
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.branching]
   [potemkin :as p]
   [toucan2.core :as t2]))

(comment metabase.remote-sync.branching/keep-me)

(p/import-vars
 [metabase.remote-sync.branching
  clone-for-branch!
  clone-row!])

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

;;; ------------------------------------------ Content branching ------------------------------------------
;;;
;;; Per-user checkout of real git branches. A user checks out a branch by name
;;; (`core_user.branch`, set via `POST /api/ee/remote-sync/checkout`). While
;;; checked out, the main API endpoints and the QP see branch-local copies of
;;; content entities instead of the rows on the main sync branch — transparently,
;;; under the main ids:
;;;
;;;   - [[effective-entity-id]] — called at the top of read/execute endpoints;
;;;     resolves a main id to the branch copy's id when one exists.
;;;   - [[ensure-branch-copy!]] — called at the top of every PUT endpoint;
;;;     copy-on-write: clones the entity on first write to the branch and
;;;     returns the id the endpoint should operate on.
;;;   - [[present-entity]] — projects a branch copy back under the main id in
;;;     API responses, so clients keep a stable view of the graph.
;;;
;;; Branchable entities are the ones serialized by remote sync: cards,
;;; dashboards, documents, measures, and segments (tables/fields out of scope;
;;; collections are a follow-up). Query-time references (`:source-card`,
;;; measures, segments) are remapped by the EE QP preprocess hook via the
;;; metadata provider, so endpoints only rewrite their route ids.

(defenterprise current-branch
  "Name of the git branch the current user has checked out, or nil for the main
   sync branch. OSS: always nil."
  metabase-enterprise.remote-sync.branching
  []
  nil)

(defenterprise effective-entity-id
  "Resolve `id` of `entity-type` (`:card`, `:dashboard`, `:document`, `:measure`,
   `:segment`) to the id that should actually be used for the current user: the
   branch copy's id when the user is on a branch and a copy exists, `id` itself
   otherwise. OSS: identity."
  metabase-enterprise.remote-sync.branching
  [_entity-type id]
  id)

(defenterprise ensure-branch-copy!
  "Copy-on-write hook for PUT endpoints. When the current user has a branch
   checked out, returns the id of the entity's branch copy, creating the copy
   (and its remapping row) on first call. On the main branch returns `id`
   unchanged, so callers can use this unconditionally at the top of every PUT."
  metabase-enterprise.remote-sync.branching
  [_entity-type id]
  id)

(defenterprise add-branch-remapping!
  "Record that `(entity-type, source-id)` maps to `target-id` on the current
   user's checked-out branch. POST endpoints call this with
   `source-id = target-id` after creating an entity, marking it branch-owned so
   it only surfaces on that branch. No-op on main and OSS."
  metabase-enterprise.remote-sync.branching
  [_entity-type _source-id _target-id]
  nil)

(defenterprise delete-branch-remapping!
  "DELETE hook: when the current user has a branch checked out, remove the
   branch's remapping row for `(entity-type, id)` — call it after deleting the
   (remapped) entity row so no dangling mapping is left behind. No-op on main
   and OSS."
  metabase-enterprise.remote-sync.branching
  [_entity-type _id]
  nil)

(defn present-entity
  "Present a (possibly remapped) `entity` under `source-id`, the id the client
   asked for. On main this is identity."
  [entity source-id]
  (cond-> entity
    (and (map? entity) (:id entity))
    (assoc :id source-id)))
