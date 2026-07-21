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
     [[metabase.remote-sync.core/branch-filter-clause]] keyed off
     [[current-branch]] — an other-branch row is simply not found.

   - **Pull / push** always run within a branch: extraction filters rows to the
     operation branch, and serdes load takes an explicit `:branch` option that
     scopes entity resolution to `(entity_id, branch)` and stamps the column.
     A data migration backfills `branch` from the `remote-sync-branch` setting
     for pre-existing synced content, so there is no runtime adoption of
     NULL-branch rows."
  (:require
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase-enterprise.serialization.v2.ingest :as serdes.ingest]
   [metabase-enterprise.serialization.v2.models :as serdes.models]
   [metabase.api.common :as api]
   [metabase.models.serialization :as serdes]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private content-models
  "Model-name -> model keyword for every content serdes model."
  (into {} (map (fn [m] [m (keyword "model" m)])) serdes.models/content))

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
                 (vals content-models))))

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
                             :let  [model (content-models model-name)]
                             :when (and model (seq ids))
                             row   (t2/select model :id [:in ids])
                             :when (or (nil? (:branch row))
                                       (= from-branch (:branch row)))]
                         (serdes/extract-one model-name {} row)))]
    (log/infof "Materializing branch %s from %s: %d entities" to-branch from-branch (count entities))
    (serialization/load-metabase! (in-memory-ingestable entities) :branch to-branch)
    (count entities)))
