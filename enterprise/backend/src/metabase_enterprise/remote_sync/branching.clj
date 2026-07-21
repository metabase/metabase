(ns metabase-enterprise.remote-sync.branching
  "Content branching: per-user checkout of real git branches, with a `branch`
   column on every branchable entity.

   ## The model

   Branchable models (Card, Dashboard, Document, Measure, Segment) carry a
   `branch` column — NULL for content not under git sync, the branch name
   otherwise. Entity identity across branches is the `entity_id`; the numeric id
   is just the branch-local materialization. There is no id remapping and no
   copy-on-write: a branch is a full, self-contained tree.

   - **Checkout** (`POST /api/ee/remote-sync/checkout`) sets `core_user.branch`.
     Checking out a branch with no local rows materializes it as a serdes
     round-trip from the branch the user was on: extract → load with the new
     branch bound. Serdes rewrites every numeric reference (dashcard card_ids,
     `:source-card` ids, document ASTs) through entity_ids, so branch content
     references branch rows natively — no read-time remapping anywhere.

   - **Filtering**: entity queries use
     [[metabase.remote-sync.branching/branch-filter-clause]] /
     [[metabase.remote-sync.branching/check-branch-visible]] keyed off
     [[current-branch]].

   - **Pull / push** always run within a branch: extract is filtered to the
     operation branch's rows ([[exportable-instance?]]), load scopes entity
     resolution to `(entity_id, branch)` and stamps `:branch` on every loaded
     row ([[serdes-load-target]]). Legacy NULL-branch rows are adopted (stamped)
     only by operations on the global sync branch."
  (:require
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.serialization.v2.ingest :as serdes.ingest]
   [metabase.api.common :as api]
   [metabase.models.serialization :as serdes]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private branchable-models
  {"Card"      :model/Card
   "Dashboard" :model/Dashboard
   "Document"  :model/Document
   "Measure"   :model/Measure
   "Segment"   :model/Segment})

;;; ------------------------------------------ Branch context ------------------------------------------

(def ^:dynamic *branch*
  "Explicit branch binding for sync operations (pull/push/materialize). Takes
   precedence over the user's checkout and the global sync branch."
  nil)

(defmacro with-branch
  "Execute `body` with the branch context forced to `branch-name`."
  [branch-name & body]
  `(binding [*branch* ~branch-name]
     ~@body))

(defenterprise current-branch
  "EE impl: the branch context — the [[*branch*]] binding, else the current
   user's `core_user.branch` (carried on `api/*current-user*`), else the global
   `remote-sync-branch` setting when remote sync is enabled."
  :feature :remote-sync
  []
  (or *branch*
      (:branch @api/*current-user*)
      (when (settings/remote-sync-enabled)
        (settings/remote-sync-branch))))

;;; ------------------------------------------ Serdes hooks ------------------------------------------

(defenterprise exportable-instance?
  "EE impl: serialize unbranched rows and rows of the current branch; skip other
   branches' rows."
  :feature :remote-sync
  [instance]
  (let [row-branch (:branch instance)
        b          (current-branch)]
    (or (nil? row-branch)
        (nil? b)
        (= row-branch b))))

(defenterprise serdes-load-target
  "EE impl: for branchable models in a branch context, resolve the load target by
   `(entity_id, branch)` and stamp `:branch` on the ingested map. A legacy
   NULL-branch row is adopted (updated and stamped) only when loading the global
   sync branch — loads of any other branch insert fresh branch rows."
  :feature :remote-sync
  [model-name ingested local]
  (let [b (current-branch)]
    (if-let [model (and b (branchable-models model-name))]
      (let [local' (or (t2/select-one model
                                      :entity_id (:entity_id ingested)
                                      :branch b)
                       (when (and local
                                  (nil? (:branch local))
                                  (= b (settings/remote-sync-branch)))
                         local))]
        [(assoc ingested :branch b) local'])
      [ingested local])))

(defenterprise stamp-loaded-row!
  "EE impl: stamp the freshly loaded row with the operation branch. `:branch` is
   in every branchable model's serdes `:skip` list (it must never serialize), so
   the load pipeline drops it from the ingested map — this post-load stamp is
   what actually persists branch membership."
  :feature :remote-sync
  [model-name instance]
  (when-let [b (current-branch)]
    (when-let [model (branchable-models model-name)]
      (when-let [id (:id instance)]
        (when (not= b (:branch instance))
          (t2/update! model :id id {:branch b})))))
  nil)

;;; ------------------------------------------ Materialization ------------------------------------------

(defn- in-memory-ingestable
  "Wrap already-extracted serialized `entities` as a serdes Ingestable so they can
   be loaded back without going through storage."
  [entities]
  (let [by-path (into {} (map (fn [e] [(serdes/path e) e])) entities)]
    (reify serdes.ingest/Ingestable
      (ingest-list [_] (keys by-path))
      (ingest-one [_ path]
        (get by-path path))
      (ingest-errors [_] nil))))

(defn branch-materialized?
  "True when `branch` already has local rows for any branchable model."
  [branch]
  (boolean (some (fn [model] (t2/exists? model :branch branch))
                 (vals branchable-models))))

(defn materialize-branch!
  "Materialize `to-branch` as a full copy of the git-synced content visible on
   `from-branch` (its rows plus unbranched legacy rows), via a serdes round-trip:
   extract every syncable branchable entity, then load the extraction with the
   new branch bound. Serdes resolves references through entity_ids, so the new
   branch's rows reference each other natively.

   `syncable-ids` is `{model-name [row-id ...]}` — the syncable content closure,
   typically `(spec/exportable-entities)` (passed in to avoid a module cycle)."
  [syncable-ids from-branch to-branch]
  (let [entities (into []
                       (for [[model-name ids] syncable-ids
                             :let  [model (branchable-models model-name)]
                             :when (and model (seq ids))
                             row   (t2/select model :id [:in ids])
                             :when (or (nil? (:branch row))
                                       (= from-branch (:branch row)))]
                         (do
                           ;; adopt legacy unbranched rows into the branch they're being copied
                           ;; from (the global sync branch), so each row belongs to exactly one
                           ;; branch and cross-branch visibility is unambiguous
                           (when (and (nil? (:branch row))
                                      (= from-branch (settings/remote-sync-branch)))
                             (t2/update! model :id (:id row) {:branch from-branch}))
                           (serdes/extract-one model-name {} row))))]
    (log/infof "Materializing branch %s from %s: %d entities" to-branch from-branch (count entities))
    (with-branch to-branch
      ((requiring-resolve 'metabase-enterprise.serialization.v2.load/load-metabase!)
       (in-memory-ingestable entities)))
    (count entities)))
