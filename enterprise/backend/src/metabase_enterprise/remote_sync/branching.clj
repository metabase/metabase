(ns metabase-enterprise.remote-sync.branching
  "Content branching: per-user checkout of real git branches, with copy-on-write
   shadowing of content entities.

   ## The model

   Remote sync already has branches — real git branches on the configured source
   repo, with the instance tracking one via the `remote-sync-branch` setting (the
   \"main\" branch). This module adds a per-user overlay: a user checks out any
   git branch by name (`core_user.branch`); while checked out, the entities they
   touch get branch-local state keyed by `branch_remapping`, and the main API +
   QP transparently serve that state under the main ids.

   A `branch_remapping` row means, for its branch:

     - `target != source` — the entity is *shadowed*: reads/writes/queries use
       the target copy (created copy-on-write by the first PUT).
     - `target = source`  — the entity was *created on* the branch; it only
       surfaces for users on that branch (listings are a follow-up).

   DELETE works against the remapped id like every other operation — on a branch
   it deletes the branch copy (then [[delete-branch-remapping!]] drops the mapping) or,
   for an unshadowed entity, the main row itself.

   Per-model cloning lives with the models themselves, serdes-style: models
   implement [[metabase.remote-sync.branching/clone-for-branch!]] in their own
   namespaces, and this module dispatches through it.

   The eventual tie-in: exporting a user's branch = serdes-exporting their
   branch view (main + shadows) to the git branch of the same name.

   Tables/fields are out of scope; collections are a follow-up (branch copies
   currently live in the same collection as their source)."
  (:require
   [metabase.api.common :as api]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.branching :as remote-sync.branching]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mr/def ::entity-type [:enum :card :dashboard :document :measure :segment])

(def ^:private entity-type->model
  {:card      :model/Card
   :dashboard :model/Dashboard
   :document  :model/Document
   :measure   :model/Measure
   :segment   :model/Segment})

;;; ------------------------------------------ Branch context ------------------------------------------

(def ^:dynamic *branch*
  "Override for the current branch name, or nil to derive it from the current
   user. Normally the branch context comes from `core_user.branch`
   ([[current-branch]]); bind this to force a context in internal code and tests."
  nil)

(defmacro with-branch
  "Execute `body` in the context of git branch `branch-name`, regardless of the
   current user's checked-out branch."
  [branch-name & body]
  `(binding [*branch* ~branch-name]
     ~@body))

(defenterprise current-branch
  "EE impl: the branch the current request runs on — the [[*branch*]] binding
   when set, otherwise the current user's `:branch` (carried on
   `api/*current-user*`, which the session middleware binds for every request;
   `admin-or-self-visible-columns` includes the column so no extra query runs).
   Nil when there is no current user or the user is on the main sync branch."
  :feature :remote-sync
  []
  (or *branch*
      (:branch @api/*current-user*)))

;;; ------------------------------------------ Remapping CRUD ------------------------------------------

(defn- remapping-row
  "The `branch_remapping` row for `(branch, entity-type, source-id)`, or nil."
  [branch entity-type source-id]
  (t2/select-one :model/BranchRemapping
                 :branch branch
                 :entity_type entity-type
                 :source_entity_id source-id))

(mu/defn remappings-for-branch :- [:map-of ::entity-type [:map-of :int :int]]
  "All remappings for a branch as `{entity-type {source-id target-id}}`.
   PoC: fetched per call; cache per-request/per-query-run before shipping."
  [branch :- :string]
  (reduce (fn [acc {:keys [entity_type source_entity_id target_entity_id]}]
            (assoc-in acc [entity_type source_entity_id] target_entity_id))
          {}
          (t2/select :model/BranchRemapping :branch branch)))

(mu/defn record-remapping!
  "Record that `(entity-type, source-id)` maps to `target-id` on `branch`.
   For entities created on the branch pass `source-id = target-id`."
  [branch       :- :string
   entity-type  :- ::entity-type
   source-id    :- :int
   target-id    :- :int]
  (t2/insert! :model/BranchRemapping
              {:branch           branch
               :entity_type      entity-type
               :source_entity_id source-id
               :target_entity_id target-id}))

;;; ------------------------------------------ Hook impls ------------------------------------------

(defenterprise effective-entity-id
  "EE impl: when the current user has a branch checked out and `(entity-type, id)`
   has a branch copy, return the copy's id; otherwise `id`."
  :feature :remote-sync
  [entity-type id]
  (if-let [branch (current-branch)]
    (or (:target_entity_id (remapping-row branch entity-type id)) id)
    id))

(defenterprise ensure-branch-copy!
  "EE impl of the PUT copy-on-write hook. When the current user has a branch
   checked out: return the existing copy's id, or clone the entity via the
   per-model [[remote-sync.branching/clone-for-branch!]] (recording the
   remapping) and return the clone's id. On main: identity."
  :feature :remote-sync
  [entity-type id]
  (if-let [branch (current-branch)]
    (or (:target_entity_id (remapping-row branch entity-type id))
        (let [clone-id (remote-sync.branching/clone-for-branch! (entity-type->model entity-type) id)]
          (record-remapping! branch entity-type id clone-id)
          clone-id))
    id))

(defenterprise add-branch-remapping!
  "EE impl: record that `(entity-type, source-id)` maps to `target-id` on the
   current user's checked-out branch. POST endpoints call this with
   `source-id = target-id` after creating an entity, marking it branch-owned.
   No-op on main."
  :feature :remote-sync
  [entity-type source-id target-id]
  (when-let [branch (current-branch)]
    (record-remapping! branch entity-type source-id target-id))
  nil)

(defenterprise delete-branch-remapping!
  "EE impl of the DELETE hook. When the current user has a branch checked out,
   remove the branch's remapping row for `(entity-type, id)` — called after the
   endpoint deletes the (remapped) entity row, so no dangling mapping is left
   behind. No-op on main."
  :feature :remote-sync
  [entity-type id]
  (when-let [branch (current-branch)]
    (t2/delete! :model/BranchRemapping
                :branch branch
                :entity_type entity-type
                :source_entity_id id))
  nil)

;;; -------------------------------------- Metadata-provider overlay --------------------------------------
;;;
;;; The single seam through which the QP sees the branch. Installed by
;;; [[metabase-enterprise.remote-sync.query-processor]] at the very top of
;;; preprocess (before `resolve-source-cards`), so every downstream read of a
;;; card/measure/segment goes through the overlay.

(defn- swap-entity
  "Serve `(:id entity)` from its branch copy: fetch the copy's metadata of the
   same type from `parent-mp` and present it under the main id. Falls back to the
   original entity when the copy row is gone."
  [parent-mp id->target {metadata-type :lib/type, :keys [id], :as entity}]
  (if-let [target-id (get id->target id)]
    (if (= target-id id)
      entity ; created on-branch; the entity IS the branch copy
      (if-let [target (first (lib.metadata.protocols/metadatas parent-mp {:lib/type metadata-type, :id #{target-id}}))]
        (assoc target :id id)
        entity))
    entity))

(defn remapping-metadata-provider
  "Wrap `parent-mp` so all card/measure/segment reads are shadowed by the
   remappings of `branch`. Reads with no active remapping pass through untouched,
   so this is safe to install unconditionally once a branch context is
   established."
  [branch parent-mp]
  (let [remappings (remappings-for-branch branch)
        transform  (fn [{metadata-type :lib/type} results]
                     (case metadata-type
                       :metadata/card    (mapv #(swap-entity parent-mp (:card remappings) %) results)
                       :metadata/measure (mapv #(swap-entity parent-mp (:measure remappings) %) results)
                       :metadata/segment (mapv #(swap-entity parent-mp (:segment remappings) %) results)
                       results))]
    (lib.metadata/transforming-metadata-provider transform parent-mp)))
