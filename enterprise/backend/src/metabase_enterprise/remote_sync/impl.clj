(ns metabase-enterprise.remote-sync.impl
  (:require
   [clojure.string :as str]
   [diehard.core :as dh]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.guards :as guards]
   [metabase-enterprise.remote-sync.merge :as remote-sync.merge]
   [metabase-enterprise.remote-sync.models.remote-sync-object :as remote-sync.object]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.ingestable :as source.ingestable]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase.analytics-interface.core :as analytics]
   [metabase.api.common :as api]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.models.serialization :as serdes]
   [metabase.search.core :as search]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2])
  (:import (metabase_enterprise.remote_sync.source.protocol SourceSnapshot)))

(set! *warn-on-reflection* true)

(defn- snapshot-has-transforms?
  "Checks if the snapshot contains any Transform, PythonLibrary entities,
   non-built-in TransformTags, or transforms-namespace collections.
   Used to auto-enable/disable remote-sync-transforms setting during import.

   Uses the ingestable to list all entities and checks their :model metadata,
   then also checks if any Collection entities have namespace=transforms.
   Built-in TransformTags are excluded since they are system-created and always present."
  [ingestable]
  (let [serdes-paths (serialization/ingest-list ingestable)
        models-present (spec/models-in-import serdes-paths)]
    (or (some spec/transform-models models-present)
        ;; Check for non-built-in TransformTags
        (when (contains? models-present "TransformTag")
          (some (fn [path]
                  (when (= "TransformTag" (:model (last path)))
                    (let [entity (serialization/ingest-one ingestable path)]
                      (nil? (:built_in_type entity)))))
                serdes-paths))
        (some (fn [path]
                (when (= "Collection" (:model (last path)))
                  (let [entity (serialization/ingest-one ingestable path)]
                    (spec/transforms-namespace-collection? entity))))
              serdes-paths))))

(defn- sync-objects!
  "Populates the remote-sync-object table with imported entities. Deletes all existing RemoteSyncObject records and
  inserts new ones for each imported entity, marking them as 'synced' with the given timestamp.

  Takes a timestamp instant and imported-data map from spec/extract-imported-entities.

  Uses the spec system to determine how to query and build sync objects for each model type."
  [timestamp imported-data]
  (t2/delete! :model/RemoteSyncObject)
  (let [all-inserts (spec/sync-all-entities! timestamp imported-data)]
    (when (seq all-inserts)
      (t2/insert! :model/RemoteSyncObject all-inserts))))

(defn- build-entity-id-where-clause
  "Builds a HoneySQL WHERE clause for entity_id filtering.
   Combines the imported entity-ids exclusion with any spec-level entity_id condition."
  [entity-ids spec-entity-id-condition]
  (let [imported-condition (when (seq entity-ids)
                             [:not-in :entity_id entity-ids])
        spec-condition (when spec-entity-id-condition
                         (let [[op value] spec-entity-id-condition]
                           [op :entity_id value]))
        conditions (filterv some? [imported-condition spec-condition])]
    (when (pos? (count conditions))
      (into [:and] conditions))))

(defn- remove-unsynced!
  "Deletes any remote sync content that was NOT part of the import.

  Takes a sequence of remote-synced collection IDs and imported-data map from spec/extract-imported-entities.
  For each entity-id based model, deletes entities whose entity_id is not in the imported set.

  Models with :scope-key in their spec are scoped to synced collections (using :id for Collection, :collection_id
  for others). Models without :scope-key (like TransformTag) are deleted globally by entity_id.

  Path-based models (Table, Field) are not removed here - they are controlled by published table settings.

  Uses specs-for-deletion to process models in dependency order (models with FK references to
  Collection are deleted before Collection itself)."
  [synced-collection-ids {:keys [by-entity-id]}]
  (doseq [[model-key model-spec] (spec/specs-for-deletion)
          :let [serdes-model (:model-type model-spec)
                entity-ids (get by-entity-id serdes-model [])
                removal-conds (spec/removal-conditions model-spec)
                spec-entity-id-condition (get removal-conds :entity_id)
                entity-id-where (build-entity-id-where-clause entity-ids spec-entity-id-condition)
                scope-key (get-in model-spec [:removal :scope-key])
                ;; Get non-entity_id conditions from spec
                other-conditions (into [] cat (dissoc removal-conds :entity_id))]]
    (let [conditions (cond-> []
                       (and scope-key (seq synced-collection-ids))
                       (conj [:in scope-key synced-collection-ids])

                       entity-id-where
                       (conj entity-id-where)

                       (and (not scope-key) (seq other-conditions))
                       (into (for [[k v] (partition 2 other-conditions)]
                               [:= k v])))
          where-clause (when (seq conditions)
                         (if (= 1 (count conditions))
                           (first conditions)
                           (into [:and] conditions)))]
      (cond
        ;; Scoped models with no collections to scope to — nothing to delete
        (and scope-key (empty? synced-collection-ids)) nil
        where-clause (t2/delete! model-key {:where where-clause})
        :else        (t2/delete! model-key)))))

(defn source-error-message
  "Constructs user-friendly error messages from remote sync source exceptions.

  Takes a throwable exception and returns a string message that categorizes the error (network, authentication,
  repository not found, branch, or generic) based on the exception type and message content."
  [e]
  (cond
    (or (instance? java.net.UnknownHostException e)
        (instance? java.net.UnknownHostException (ex-cause e)))
    "Network error: Unable to reach git repository host"

    (str/includes? (ex-message e) "Authentication failed")
    "Authentication failed: Please check your git credentials"

    (str/includes? (ex-message e) "Repository not found")
    "Repository not found: Please check the repository URL"

    (str/includes? (ex-message e) "branch")
    "Branch error: Please check the specified branch exists"

    (some-> e ex-cause ex-message (str/includes? "Can't create a tenant collection without tenants enabled"))
    "This repository contains tenant collections, but the tenants feature is disabled on your instance."

    (str/includes? (ex-message e) "Missing commit")
    "Repository cache is stale: the remote repository may have been force-pushed. Please retry the operation."

    (= (:error (ex-data e)) :metabase-enterprise.serialization.v2.load/not-found)
    (let [{:keys [model id]} (ex-data e)]
      (format "Import failed: %s '%s' does not exist on this instance. Make sure all referenced databases and other dependencies are set up before importing." model id))

    (some-> e ex-cause ex-message (str/includes? "database not found"))
    (format "Import failed: A referenced database does not exist on this instance. %s" (ex-message (ex-cause e)))

    (seq (:ingest-errors (ex-data e)))
    (let [ingest-errors (:ingest-errors (ex-data e))]
      (format "Failed to read %d file(s) from the repository: %s"
              (count ingest-errors)
              (str/join "; " (for [ie ingest-errors
                                   :let [{:keys [file reason]} (ex-data ie)]]
                               (cond-> file
                                 reason (str ": " reason))))))

    :else
    (format "Failed to reload from git repository: %s" (ex-message e))))

(defn- get-conflicts
  "Detects conflicts that would prevent or complicate import. Returns a map with two classes:
   - :first-import-conflicts - feature/namespace/library conflicts that only block on the very first import
   - :deletion-conflicts     - unsynced local entities of all-or-nothing models (transforms) that the import
                               would wholesale-delete; these block on EVERY import, not just the first

   Conflict types detected:
   - :library-conflict - First import only, local Library exists, import has Library
   - :transforms-conflict / :snippets-conflict - import has matching content but local has unsynced entities
   - :*-conflict (deletion) - import lacks transforms/tags/libraries that exist locally and unsynced (GHY-3900)"
  [ingestable first-import?]
  (let [ingest-list (serialization/ingest-list ingestable)
        imported-data (spec/extract-imported-entities ingest-list)
        models-present (spec/models-in-import ingest-list)
        ;; Extract namespace info from imported Collection entities
        import-ns-info
        (reduce (fn [acc path]
                  (if (= "Collection" (:model (last path)))
                    (let [entity (serialization/ingest-one ingestable path)]
                      (if-let [ns (some-> (:namespace entity) keyword name)]
                        (-> acc
                            (update :namespaces conj ns)
                            (update-in [:entity-ids ns] (fnil conj #{}) (:entity_id entity)))
                        acc))
                    acc))
                {:namespaces #{} :entity-ids {}}
                ingest-list)
        import-namespace-collections (:namespaces import-ns-info)
        ;; TODO (epaget 2026-02-02) -- entity-id conflict checking (detect unsynced local entities with matching entity_ids)
        feature-conflicts (spec/check-feature-conflicts models-present import-namespace-collections)
        ns-coll-conflicts (spec/check-namespace-collection-conflicts
                           import-namespace-collections
                           (:entity-ids import-ns-info))
        library-conflict (when-let [local-library (t2/select-one :model/Collection :type collection/library-collection-type)]
                           (when (and first-import?
                                      (contains? (get-in imported-data [:by-entity-id "Collection"] #{})
                                                 collection/library-entity-id)
                                      (not (t2/exists? :model/RemoteSyncObject
                                                       :model_type "Collection"
                                                       :model_id (:id local-library))))
                             {:type :library-conflict
                              :category "Library"
                              :message "Import contains Library but local instance has an unsynced Library collection"}))
        first-import-conflicts (concat
                                feature-conflicts
                                ns-coll-conflicts
                                (when library-conflict [library-conflict]))]
    {:first-import-conflicts (vec first-import-conflicts)
     :deletion-conflicts     (spec/check-deletion-conflicts imported-data)}))

(defn- record-exported-paths!
  "Records each exported entity's repo file path on its RemoteSyncObject row, so later renames and
  deletes can resolve the old path. `entries` is a seq of {:model_type :entity_id :path}; only
  entity-id models are recorded. Correlates entity_id -> model_id per model type."
  [entries]
  (doseq [[model-type es] (group-by :model_type entries)
          :let [spec (spec/spec-for-model-type model-type)]
          :when (and spec (= :entity-id (:identity spec)))]
    (let [eid->path (into {} (map (juxt :entity_id :path)) es)
          id->eid   (t2/select-pk->fn :entity_id (:model-key spec) :entity_id [:in (vec (keys eid->path))])]
      (doseq [[id eid] id->eid
              :let [path (eid->path eid)]
              :when path]
        (t2/update! :model/RemoteSyncObject :model_type model-type :model_id id
                    {:file_path path})))))

(defn- branch-changed-since-scheduling?
  "Returns true if `pre-task-branch` was captured by the async-* function and the
   `remote-sync-branch` setting has since drifted to a different value. Used as a
   defense-in-depth check against any future code path that bypasses the operation-level
   guards and mutates the setting between scheduling and the work running."
  [pre-task-branch]
  (and (some? pre-task-branch)
       (not= pre-task-branch (settings/remote-sync-branch))))

(defn load-snapshot!
  "Loads a snapshot's serialized entities into the app DB and reconciles local state to match it:
  runs `load-metabase!`, toggles the `remote-sync-transforms` setting based on the snapshot's contents,
  deletes synced content not present in the snapshot, and refreshes the RemoteSyncObject table.

  Shared by [[import!]] (the pull path) and the post-merge reconcile in [[export!]] (where a clean merge
  brought remote changes that must now be applied locally). Returns the imported-data map.

  Does not set the task version — callers own that, but should pass it (and any other version/status
  bookkeeping) as the `:finalize!` thunk, which runs inside the same transaction as the object-table
  reconcile. That keeps the version pointer, RemoteSyncObject statuses, and the reconcile atomic: either
  they all commit or all roll back, so a crash can never leave the version advanced past stale local
  state or drop captured dirty markers (see [[import-merged!]])."
  [snapshot task-id sync-timestamp & {:keys [finalize!]}]
  (let [path-filters        (mapv #(re-pattern (str % "/.*")) serialization/legal-top-level-paths)
        base-ingestable     (source.p/->ingestable snapshot {:path-filters path-filters})
        has-transforms?     (snapshot-has-transforms? base-ingestable)
        ingestable-snapshot (source.ingestable/wrap-progress-ingestable task-id 0.7 base-ingestable)
        load-result         (serdes/with-cache
                              (serialization/load-metabase! ingestable-snapshot))
        seen-paths          (:seen load-result)
        imported-data       (spec/extract-imported-entities seen-paths)]
    (remote-sync.task/update-progress! task-id 0.8)
    (when (and has-transforms?
               (not (settings/remote-sync-transforms)))
      (log/info "Detected transforms in remote source, enabling remote-sync-transforms setting")
      (settings/remote-sync-transforms! true))
    (t2/with-transaction [_conn]
      (remove-unsynced! (spec/all-syncable-collection-ids) imported-data)
      (sync-objects! sync-timestamp imported-data)
      ;; Record the actual repo path each entity was read from, so later renames/deletes resolve the
      ;; real file and stay on the incremental export fast-path.
      (record-exported-paths! (source.ingestable/cached-file-paths base-ingestable))
      (when finalize! (finalize!)))
    (when (and (not has-transforms?)
               (settings/remote-sync-transforms))
      (log/info "No transforms in remote source, disabling remote-sync-transforms setting")
      (settings/remote-sync-transforms! false))
    (remote-sync.task/update-progress! task-id 0.95)
    imported-data))

;;; ------------------------------------------- Incremental Import Fast-Path -------------------------------------------

(def ^:private incremental-not-possible
  "Sentinel returned by [[incremental-load-snapshot!]] when a change can't be applied incrementally and the
  caller must run the full [[load-snapshot!]] instead."
  :remote-sync/incremental-import-not-possible)

(def ^:private full-import-models
  "Models whose change forces a full import on the incremental fast-path: Collection (a rename moves every
  descendant's file, a delete cascades to its contents) and the feature models (their presence drives the
  remote-sync-transforms / library settings, which need whole-snapshot knowledge to toggle correctly)."
  #{"Collection" "Transform" "TransformTag" "PythonLibrary" "NativeQuerySnippet"})

(defn- legal-yaml-path?
  "True for a managed-directory `.yaml` entity file — the only changed paths the importer acts on."
  [^String path]
  (and (str/ends-with? path ".yaml")
       (not (str/starts-with? path "."))
       (when-let [i (str/index-of path "/")]
         (contains? serialization/legal-top-level-paths (subs path 0 i)))))

(defn- rso-where-for
  "HoneySQL :where matching the RemoteSyncObject rows for the given `[{:model_type :model_id}]` maps."
  [rows]
  (into [:or] (map (fn [{:keys [model_type model_id]}]
                     [:and [:= :model_type model_type] [:= :model_id model_id]]))
        rows))

(defn- pulled-change-count
  "Total number of entities applied by a pull, across entity-id- and path-identified models in `imported-data`."
  [imported-data]
  (transduce (map count) + 0 (concat (vals (:by-entity-id imported-data))
                                     (vals (:by-path imported-data)))))

(defn- incremental-import-plan
  "What an incremental load would touch, or [[incremental-not-possible]] if the change must fall back to a full
  import. On success returns `{:ingestable <ingestable-or-nil> :deleted-rsos <RemoteSyncObject rows>}`. Falls back
  when there is no diff, a deleted file can't be mapped back to a tracked entity, or a
  structural/feature/non-entity-id model changed."
  [snapshot last-version]
  (let [changed      (when last-version (source.p/changed-files snapshot last-version))
        add-mod      (into #{} (filter legal-yaml-path?) (into (:added changed) (:modified changed)))
        deleted      (into #{} (filter legal-yaml-path?) (:deleted changed))
        ;; N+1: one query per deleted path (bounded by deletions in a single pull; left un-batched because
        ;; file_path values are long, making an IN clause bulky for marginal gain).
        deleted-rsos (mapv (fn [p] (t2/select-one :model/RemoteSyncObject :file_path p)) deleted)
        ingestable (when (seq add-mod)
                     (source.p/->ingestable snapshot {:path-filters (mapv #(re-pattern (java.util.regex.Pattern/quote %)) add-mod)}))
        add-models (if ingestable
                     (into #{} (map #(:model (last %))) (serialization/ingest-list ingestable))
                     #{})
        all-models (into add-models (map :model_type) deleted-rsos)]
    (cond
      (nil? changed) ;; first import, or diffing not possible (force-push/rebase, non-diffable source)
      incremental-not-possible

      (some nil? deleted-rsos) ;; some deleted file not present in appdb
      incremental-not-possible

      (some full-import-models all-models) ;; anything not incrementally importable by model type?
      incremental-not-possible

      (some #(not= :entity-id (:identity (spec/spec-for-model-type %))) all-models) ;; anything not entity-id model?
      incremental-not-possible

      :else
      {:ingestable ingestable :deleted-rsos deleted-rsos})))

(defn- incremental-load-snapshot!
  "Applies an incremental `plan` from [[incremental-import-plan]]: loads only its added/modified entities,
  deletes only those genuinely removed, and reconciles just those rows of the RemoteSyncObject table —
  leaving everything else untouched. Runs `finalize!` inside the reconcile transaction, then logs success and
  returns [[import!]]'s `:success` result map carrying `snapshot-version`. The caller decides whether an
  incremental load is safe (see [[incremental-import-plan]] and [[import!]]); this assumes the plan is valid
  and local state matches the diff base.

  Renames are handled by entity identity, not path: a rename re-loads the same entity_id at the new path
  (an add), so the old path's delete is recognized as a rename and the entity is not removed."
  [{:keys [ingestable deleted-rsos] :as _plan} snapshot-version task-id sync-timestamp & {:keys [finalize!]}]
  (let [load-result   (when ingestable
                        (serdes/with-cache
                          (serialization/load-metabase!
                           (source.ingestable/wrap-progress-ingestable task-id 0.7 ingestable)
                           :backfill? false :reindex? false)))
        imported-data (spec/extract-imported-entities (:seen load-result))
        loaded-eid?   (fn [model-type eid]
                        ;; by-entity-id holds sets of raw entity_id strings, keyed by model type
                        (contains? (get-in imported-data [:by-entity-id model-type]) eid))
        ;; A tracked entity whose entity_id was NOT re-loaded is a genuine delete; if it WAS
        ;; re-loaded (at a new path) it's a rename, so we keep it.
        deletes       (for [{:keys [model_type model_id]} deleted-rsos
                            ;; N+1: one entity_id query per delete candidate (bounded by deletions in a single
                            ;; pull; batching would need grouping by model-key into per-table IN queries).
                            :let [model-key (:model-key (spec/spec-for-model-type model_type))
                                  eid (when model-key (t2/select-one-fn :entity_id model-key :id model_id))]
                            :when (not (loaded-eid? model_type eid))]
                        {:model_type model_type :model_id model_id :model-key model-key})
        sync-rows     (spec/sync-all-entities! sync-timestamp imported-data)]
    (remote-sync.task/update-progress! task-id 0.8)
    (t2/with-transaction [_conn]
      (doseq [[model-key ds] (group-by :model-key deletes)]
        (t2/delete! model-key :id [:in (mapv :model_id ds)]))
      (when (seq deletes)
        (t2/delete! :model/RemoteSyncObject {:where (rso-where-for deletes)}))
      (when (seq sync-rows)
        (t2/delete! :model/RemoteSyncObject {:where (rso-where-for sync-rows)})
        (t2/insert! :model/RemoteSyncObject sync-rows))
      (when ingestable
        (record-exported-paths! (source.ingestable/cached-file-paths ingestable)))
      (when finalize! (finalize!)))
    ;; We skip the whole-appdb reindex the full load runs. Added/modified entities are already
    ;; re-indexed by the load itself — serdes' t2 insert!/update! fire the :hook/search-index
    ;; after-insert/after-update hooks. Deletes have no such hook, so remove them explicitly.
    (doseq [[model-key ds] (group-by :model-key deletes)]
      (search/delete! model-key (mapv :model_id ds)))
    (remote-sync.task/update-progress! task-id 0.95)
    (log/info "Successfully reloaded entities from git repository")
    {:status :success
     :version snapshot-version
     :outcome {:kind "pulled"
               :count (+ (pulled-change-count imported-data) (count deletes))
               :branch (settings/remote-sync-branch)}}))

(defn- capture-dirty-objects
  "Returns the current non-synced RemoteSyncObject rows — the local changes that have not been pushed.
  Captured before a local-only merge so they can be restored afterwards (see [[import-merged!]])."
  []
  (t2/select :model/RemoteSyncObject {:where [:not= :status "synced"]}))

(defn- restore-dirty-objects!
  "Re-applies captured dirty statuses after a merge load (which marks everything 'synced'). For each
  captured row, updates the matching freshly-synced row's status, or re-inserts it when no row exists
  (e.g. a pending local deletion, whose entity is absent from the merged set)."
  [dirty-objects timestamp]
  (doseq [{:keys [model_type model_id status] :as row} dirty-objects]
    (if-let [existing (t2/select-one :model/RemoteSyncObject :model_type model_type :model_id model_id)]
      (t2/update! :model/RemoteSyncObject (:id existing)
                  {:status status :status_changed_at timestamp})
      (t2/insert! :model/RemoteSyncObject
                  (-> row (dissoc :id) (assoc :status_changed_at timestamp))))))

(defn- import-merged!
  "Local-only merge for the pull path. Performs an entity-identity 3-way merge of local state against the
  remote tip and, on a clean merge, applies the merged result to the LOCAL app DB only — it does not push.
  Remote-originated changes end up 'synced'; the un-pushed local changes are preserved as dirty so they
  can be pushed later. Sets the last version to the remote tip (so the branch is no longer 'behind').

  On a genuine same-entity conflict, returns `:conflict` without touching local state.

  `base-snapshot` is nil only when no safe 3-way merge is possible (no prior sync, or the base commit was
  orphaned by a force-push/rebase) — that surfaces as a conflict. When the remote has not advanced past
  the base, there is nothing to fold in, so it is a no-op success that keeps local changes dirty."
  [snapshot base-snapshot task-id sync-timestamp]
  (let [merge-result (delay (source/compute-merge (spec/extract-entities-for-export) snapshot base-snapshot task-id))]
    (cond
      (nil? base-snapshot)
      {:status    :conflict
       :version   (source.p/version snapshot)
       :conflicts ["Remote history was rewritten (force-push or rebase); cannot merge automatically."]
       :message   "Cannot merge: the remote branch history was rewritten. Discard local changes and pull, or push to a new branch."}

      ;; The remote hasn't advanced past the merge base — nothing to fold in. Keep local changes as-is (still
      ;; dirty, to be pushed later); a no-op success, not a spurious "history was rewritten" conflict.
      (= (source.p/version base-snapshot) (source.p/version snapshot))
      (do
        (log/info "Pull merge: remote has not advanced; keeping local changes unchanged")
        {:status        :success
         :version       (source.p/version snapshot)
         :merge-summary {:added 0 :updated 0 :removed 0}
         :outcome       {:kind "pull-skipped"}})

      (seq (:conflicts @merge-result))
      (let [conflicts (mapv remote-sync.merge/conflict-label (:conflicts @merge-result))]
        (log/infof "Pull merge conflict on %d entit(ies): %s"
                   (count conflicts) (str/join ", " conflicts))
        {:status    :conflict
         :version   (source.p/version snapshot)
         :conflicts conflicts
         :message   "Import blocked: the same content was changed both locally and on the remote branch."})

      :else
      ;; Capture the local (un-pushed) changes before loading; the clean merge guarantees they are
      ;; disjoint from the remote changes, so restoring them reproduces exactly the local diff vs remote.
      ;; Restore + set-version run inside the load's transaction so that a crash can't leave the dirty
      ;; markers overwritten by the load (which would lose them — a retry captures nothing).
      (let [{:keys [merged summary]} @merge-result
            dirty-objects (capture-dirty-objects)]
        (load-snapshot! (source/specs->snapshot merged) task-id sync-timestamp
                        :finalize! (fn []
                                     (restore-dirty-objects! dirty-objects sync-timestamp)
                                     (remote-sync.task/set-version! task-id (source.p/version snapshot))))
        (log/infof "Pull merge: folded in %d remote change(s) (added %d, updated %d, removed %d); kept %d local change(s)"
                   (apply + (vals summary)) (:added summary) (:updated summary) (:removed summary)
                   (count dirty-objects))
        {:status :success
         :version (source.p/version snapshot)
         :merge-summary summary
         :outcome {:kind "pulled"
                   :count (apply + (vals summary))
                   :branch (settings/remote-sync-branch)}}))))

(defn import!
  "Imports and reloads Metabase entities from a remote snapshot.

  Takes a non-nil SourceSnapshot instance, a RemoteSyncTask ID for progress tracking, and optional keyword arguments:
  - :force? - forces import even when the snapshot version matches the last imported version or has first-import conflicts
  - :force-deletion? - forces past deletion conflicts (unsynced local transforms the import would delete); defaults
    to :force?. Kept separate so the setup/enable flow can force past version/dirty guards (force? true) while still
    surfacing transform-deletion as a conflict the admin must confirm (force-deletion? false) — see GHY-3900.
  - :merge? - perform a local-only 3-way merge (keep un-pushed local changes) instead of overwriting local
  - :base-snapshot - the merge base (last synced version), required when :merge? is set
  - :pre-task-branch - the value of `remote-sync-branch` at scheduling time; if it differs
    from the current setting at task start, the import aborts with `:error` to protect data
    integrity (the load mutates the app DB, so we refuse to proceed when state has drifted)

  Loads serialized entities, removes entities not in the import, syncs the remote-sync-object table, and
  optionally creates a remote-synced collection.

  Returns a map with :status (either :success or :error), :version, and :message keys. Various exceptions may be
  thrown during import and are caught and converted to error status maps."
  [^SourceSnapshot snapshot task-id & {:keys [force? force-deletion? merge? base-snapshot pre-task-branch]}]
  (when (branch-changed-since-scheduling? pre-task-branch)
    (log/warnf "Aborting import: remote-sync-branch changed from %s to %s since task was scheduled"
               pre-task-branch (settings/remote-sync-branch))
    (throw (ex-info "Branch setting changed since task was scheduled; aborting to protect data integrity"
                    {:pre-task-branch pre-task-branch
                     :current-branch  (settings/remote-sync-branch)})))
  (log/info "Reloading remote entities from the remote source")
  (analytics/inc! :metabase-remote-sync/imports)
  (let [sync-timestamp (t/instant)]
    (try
      (let [snapshot-version      (source.p/version snapshot)
            last-imported-version (remote-sync.task/last-version)
            first-import?         (nil? last-imported-version)
            ;; force-deletion? defaults to force? when a caller doesn't pass it.
            force-deletion?       (if (nil? force-deletion?) force? force-deletion?)
            finalize!             #(remote-sync.task/set-version! task-id snapshot-version)
            path-filters          (mapv #(re-pattern (str % "/.*")) serialization/legal-top-level-paths)
            ;; First-import conflicts only block the first import; deletion conflicts block every import (an
            ;; already-configured instance must not silently delete unsynced transforms). The get-conflicts tree scan
            ;; is itself deferred so it only runs when one of the gates is open (e.g. a forced import with
            ;; force-deletion? true skips it entirely).
            blocking-conflicts (delay
                                 (let [conflicts (delay (get-conflicts (source.p/->ingestable snapshot {:path-filters path-filters})
                                                                       first-import?))]
                                   (cond-> []
                                     (and first-import? (not force?))
                                     (into (:first-import-conflicts @conflicts))

                                     (not force-deletion?)
                                     (into (:deletion-conflicts @conflicts)))))
            incremental-plan   (delay (incremental-import-plan snapshot last-imported-version))
            dirty?             (delay (remote-sync.object/dirty?))]
        (cond
          merge?
          (import-merged! snapshot base-snapshot task-id sync-timestamp)

          ;; Cheap no-op pull: nothing changed remotely, so nothing is loaded or deleted
          (and (not force?) (= last-imported-version snapshot-version))
          (do
            (log/infof "Skipping import: snapshot version %s matches last imported version" snapshot-version)
            {:status :success
             :version snapshot-version
             :outcome {:kind "pull-skipped"}})

          ;; Incremental fast-path: not forced, no local drift, and the change is incrementally loadable.
          ;; Touches only changed files, so it can't wholesale-delete unsynced transforms — no conflict scan,
          ;; and only the cheap O(changes) diff is computed (never the full-tree get-conflicts read).
          (and (not force?) (not @dirty?) (not= incremental-not-possible @incremental-plan))
          (incremental-load-snapshot! @incremental-plan snapshot-version task-id sync-timestamp :finalize! finalize!)

          (seq @blocking-conflicts)
          (let [message (format "Skipping import: snapshot version %s contains conflicts use force to override" snapshot-version)]
            (log/info message)
            {:status :conflict
             :version snapshot-version
             :conflicts (into #{} (map :category) @blocking-conflicts) ; Backward compat: set of category names
             :conflict-details @blocking-conflicts
             :message message})

          ;; No blocking conflicts: do the full reload.
          :else
          (let [reason        (cond
                                force?        "forced"
                                @dirty?       "local changes pending"
                                first-import? "first import"
                                :else         "changes not incrementally loadable")
                _             (log/infof "Remote sync full import: %s" reason)
                imported-data (load-snapshot! snapshot task-id sync-timestamp :finalize! finalize!)]
            (log/info "Successfully reloaded entities from git repository")
            {:status :success
             :version snapshot-version
             :outcome {:kind "pulled"
                       :count (pulled-change-count imported-data)
                       :branch (settings/remote-sync-branch)}})))
      (catch Exception e
        ;; A cancellation isn't a failure: log it and return nil. Otherwise log the error, count it, and
        ;; return a user-friendly :error result.
        (if (:cancelled? (ex-data e))
          (log/info "Import from git repository was cancelled")
          (do
            (log/errorf e "Failed to reload from git repository: %s" (ex-message e))
            (analytics/inc! :metabase-remote-sync/imports-failed)
            {:status :error
             :message (source-error-message e)
             :version (source.p/version snapshot)
             :details {:error-type (type e)}})))
      (finally
        (analytics/observe! :metabase-remote-sync/import-duration-ms (t/as (t/duration sync-timestamp (t/instant)) :millis))))))

(defn- export-merged!
  "Export path taken when the remote branch has advanced beyond the last synced version (`base-snapshot`
  is the merge base). Performs an entity-identity 3-way merge of local state against the remote tip:
  - on a genuine conflict (same entity changed on both sides) returns a `:conflict` result;
  - on a clean merge, writes the merged set (fast-forwarding onto the remote tip), then reconciles the
    local app DB by loading the merged result (the 'pull' half), so local now contains the remote's
    changes. Returns a `:success` result with a `:merge-summary`."
  [source snapshot base-snapshot task-id message sync-timestamp models]
  (let [pushed-count (count (remote-sync.object/dirty-rows))
        {:keys [status version conflicts summary]}
        (source/merge-and-store! models snapshot base-snapshot task-id message)]
    (case status
      :conflict
      (let [conflicts (mapv remote-sync.merge/conflict-label conflicts)]
        (log/infof "Export merge conflict on %d entit(ies): %s"
                   (count conflicts) (str/join ", " conflicts))
        {:status        :conflict
         :version       (source.p/version snapshot)
         :conflicts     conflicts
         :merge-summary summary
         :message       "Export blocked: the same content was changed both locally and on the remote branch."})

      :success
      ;; Fold-in pull: the merge brought remote changes that aren't in the local app DB yet. Load the
      ;; merged result so local state matches what we just pushed, marking everything synced and advancing
      ;; the version atomically with the reconcile (set-version! runs only after the load, so a crash leaves
      ;; the version at the old base and a retry re-merges — the push is idempotent — rather than advancing
      ;; the pointer past un-reconciled local state).
      (if-let [merged-snapshot (source.p/snapshot-at source version)]
        (do
          (load-snapshot! merged-snapshot task-id sync-timestamp
                          :finalize! (fn []
                                       (t2/update! :model/RemoteSyncObject {:status "synced" :status_changed_at sync-timestamp})
                                       (remote-sync.task/set-version! task-id version)))
          (log/infof "Exported with merge: folded in %d remote change(s) (added %d, updated %d, removed %d)"
                     (apply + (vals summary)) (:added summary) (:updated summary) (:removed summary))
          {:status :success :version version :merge-summary summary
           :outcome {:kind "merged"
                     :pulled (apply + (vals summary))
                     :pushed pushed-count
                     :branch (settings/remote-sync-branch)}})
        ;; The merge was pushed to `version`, but its commit can't be resolved locally (should not happen —
        ;; write-files! updates the local ref before returning). Fail loudly rather than silently advancing
        ;; the version while skipping the reconcile, which would leave local missing the folded-in remote
        ;; changes. The push already landed, so a retry sees the divergence and re-merges + reconciles.
        (throw (ex-info (format (str "Merge pushed to %s but its commit could not be resolved locally to "
                                     "reconcile the app DB; re-run the export to pull the merged changes.")
                                version)
                        {:version version}))))))

;;; ------------------------------------------- Incremental Export Fast-Path -------------------------------------------

(def ^:private closure-opts
  {:include-field-values false :include-database-secrets false
   :continue-on-error false :skip-archived true})

(defn- export-closure
  "All `[model-type id]` entities a full export would pull for the entity `[model-type model-id]`
  (its transitive `serdes/descendants` + `serdes/required`, including the entity itself)."
  [model-type model-id]
  (keys (merge-with into
                    (u/traverse #{[model-type model-id]} #(serdes/descendants (first %) (second %) closure-opts))
                    (u/traverse #{[model-type model-id]} #(serdes/required (first %) (second %))))))

(defn- untracked-content-deps
  "The `[model-type id]` entities in the change's export closure that are remote-sync content but have
  no RemoteSyncObject row — dependencies a full export would pull (via `serdes/descendants`/`required`)
  yet that aren't independently tracked (e.g. a card in a non-synced collection referenced by a synced
  card, and that card's collection). These get written alongside the change so the incremental export
  matches what a full export would emit. Excludes the entity itself and non-content deps (e.g.
  databases, which are resolved by reference at import)."
  [model-type model-id]
  (into #{}
        (filter (fn [[mt id]]
                  (and (not (and (= mt model-type) (= id model-id)))
                       (spec/spec-for-model-type mt)
                       (not (t2/exists? :model/RemoteSyncObject :model_type mt :model_id id)))))
        (export-closure model-type model-id)))

(defn- dep-upserts
  "Serializes the untracked dependency entities `dep-ids` (a set of `[model-type id]`) into file-specs
  to upsert, reusing the storage context `opts` so paths dedupe consistently with the changed entities.
  Returns `[]` when there are no deps, a vector of file-specs on success, or nil if any dependency's
  path is already occupied by a different entity (a collision that requires a full export)."
  [snapshot opts dep-ids]
  (if (empty? dep-ids)
    []
    (let [specs (->> dep-ids
                     (map (fn [[mt id]] {:model_type mt :model_id id}))
                     spec/extract-entities-for-rows
                     (map (fn [e] [(source/entity->file-spec opts e) (:entity_id e)])))]
      ;; keep going only if every dependency's target path is free: absent, or already holding that
      ;; same entity. A present file whose entity_id can't be read counts as occupied — don't clobber it.
      (when (every? (fn [[spec eid]]
                      (if-let [content (source.p/read-file snapshot (:path spec))]
                        (= eid (try (:entity_id (yaml/parse-string content))
                                    (catch Exception _ nil)))
                        true))
                    specs)
        (mapv first specs)))))

(defn- incremental-updates-for-row
  "The updates a single dirty `row` contributes to an incremental plan: a map of
  {:upserts :delete-paths :synced :removed-ids :pull} (any subset), or `:remote-sync/unsyncable-record`
  if the row can't be synced incrementally and the whole batch must fall back to a full export."
  [opts snapshot {:keys [status file_path] :as row}]
  (try
    (let [info   (delay (when-let [entity (first (spec/extract-entities-for-rows [row]))]
                          (let [spec (source/entity->file-spec opts entity)
                                content (source.p/read-file snapshot (:path spec))
                                yaml (when content
                                       ;; errors parsing should throw an invalidate the row
                                       (yaml/parse-string content))]
                            {:entity entity
                             :spec spec
                             :eid (:entity_id entity)
                             :new-path (:path spec)
                             :file-exists? (boolean content)
                             :file-eid (:entity_id yaml)})))]
      (cond
        (not= :entity-id ;; only entity-id models can be synced incrementally
              (:identity (spec/spec-for-model-type (:model_type row))))
        :remote-sync/unsyncable-record

        (not (#{"create" "update" "removed" "delete"} status))
        :remote-sync/unsyncable-record

        (and (#{"removed" "delete"} status) ;; removed/delete with no stored path needs a full export
             (str/blank? file_path))
        :remote-sync/unsyncable-record

        (#{"removed" "delete"} status)
        {:delete-paths [file_path]
         :removed-ids [(:id row)]}

        ;; past here, we're seeing create and update statuses
        (not @info) ;; entity no longer exists
        :remote-sync/unsyncable-record

        ;; create: brand-new file, no old path to delete.
        ;; Target must be free or same entity id
        (and (= "create" status)
             (or (not (:file-exists? @info))
                 (= (:eid @info) (:file-eid @info))))
        {:pull (untracked-content-deps (:model_type row) (:model_id row))
         :upserts [(:spec @info)]
         :synced [{:id (:id row) :file_path (:new-path @info)}]}

        ;; in-place update: at its stored path, or (no stored path) the repo file at
        ;; new-path is already this entity — overwrite.
        (and (= "update" status)
             (or (= file_path (:new-path @info))
                 (and (str/blank? file_path)
                      (= (:eid @info) (:file-eid @info)))))
        {:pull (untracked-content-deps (:model_type row) (:model_id row))
         :upserts [(:spec @info)]
         :synced [{:id (:id row) :file_path (:new-path @info)}]}

        ;; rename: update whose stored path differs from new path. Write the
        ;; new file and delete the old one.
        (and (= "update" status)
             (not (str/blank? file_path))
             (not= file_path (:new-path @info))
             (or (not (:file-exists? @info))
                 (= (:eid @info) (:file-eid @info))))
        {:pull (untracked-content-deps (:model_type row) (:model_id row))
         :upserts [(:spec @info)]
         :synced [{:id (:id row) :file_path (:new-path @info)}]
         :delete-paths [file_path]}

        ;; any other create/update case (e.g. the target path is occupied by a different entity) needs
        ;; a full export
        :else
        :remote-sync/unsyncable-record))
    (catch Exception _
      :remote-sync/unsyncable-record)))

(defn- incremental-plan
  "Builds a plan for a safe incremental export of the current `dirty-rows`, or `:remote-sync/unsyncable-batch` if any
  row can't be handled incrementally.

  Every row must be on an entity-id model and be one of:
  - `create`/`update` — re-serialize the entity and upsert its file. A create, or an update whose path
    is unchanged, is an overwrite-in-place; an update whose stored `file_path` differs is a rename, so
    the old file is also deleted. The target path must be free or already hold this same entity, and
    the change must not reference remote-sync content that isn't already in the repo (else a full
    export, which pulls that dependency via `serdes/descendants`, is required).
  - `delete`/`removed` — delete the entity's stored `file_path`. Requires a stored `file_path`
    (after a fresh import none is recorded yet, so we fall back to a full export, which self-heals).

  Returns one of:
  - {:upserts [file-spec] :delete-paths [path] :synced [{:id :file_path}] :removed-ids [id]} — a safe
    incremental plan;
  - `:remote-sync/unsyncable-batch` — a row (or a dependency path collision) forces a full export."
  [snapshot dirty-rows]
  (let [opts (serdes/storage-base-context)
        plan (->> dirty-rows
                  (map #(incremental-updates-for-row opts snapshot %))
                  (reduce (fn [plan updates]
                            (if (= updates :remote-sync/unsyncable-record)
                              (reduced :remote-sync/unsyncable-batch)
                              (merge-with into plan updates)))
                          {:upserts [] :delete-paths [] :synced [] :removed-ids [] :pull #{}}))]
    (if (= plan :remote-sync/unsyncable-batch)
      :remote-sync/unsyncable-batch
      (if-let [deps (dep-upserts snapshot opts (:pull plan))]
        (-> plan (update :upserts into deps) (dissoc :pull))
        ;; a dependency's path is occupied by a different entity — needs a full export
        :remote-sync/unsyncable-batch))))

(defn- path-top-level-dir [^String path]
  (let [i (str/index-of path "/")]
    (if i (subs path 0 i) path)))

(defn- disabled-content-dirs
  "Top-level repo directories whose content is disabled by the current settings."
  []
  (cond-> #{}
    (not (settings/remote-sync-transforms))    (into ["transforms" "python-libraries" "python_libraries"])
    (not (settings/library-is-remote-synced?)) (conj "snippets")))

(defn- full-export!
  "Re-serializes the entire remote-synced set into `snapshot` and commits it, then marks every
  RemoteSyncObject row synced (as of `sync-timestamp`) and records each entity's file_path. Used when
  the pending changes can't be applied incrementally (name collisions, disabled content needing a
  reconcile, etc.). Throws if there is no remote-syncable content. Returns {:status :success}."
  [snapshot task-id message sync-timestamp]
  (let [models (spec/extract-entities-for-export)]
    (when (not models)
      (throw (ex-info "No remote-syncable content available." {})))
    (remote-sync.task/update-progress! task-id 0.3)
    (let [{:keys [version entries]} (source/store! models snapshot task-id message)]
      (remote-sync.task/set-version! task-id version)
      (t2/update! :model/RemoteSyncObject {:status "synced" :status_changed_at sync-timestamp})
      (record-exported-paths! entries)
      {:status :success
       :outcome {:kind "pushed"
                 :count (count entries)
                 :branch (settings/remote-sync-branch)}})))

(defn export!
  "Exports remote-synced collections to a remote source repository.

  Takes a SourceSnapshot instance, a RemoteSyncTask ID for progress tracking, a commit message string, and
  optional keyword arguments:
  - :force? - when true, overwrite the remote branch wholesale even if it has advanced (no merge)
  - :merge? - when true and the remote has advanced, perform a 3-way merge (rather than refusing)
  - :source - the Source the snapshot came from, used to resolve the merge base and the merged result
  - :base-snapshot - a snapshot of the last synced version (the merge base), supplied when the remote
    branch has advanced and a 3-way merge is required
  - :pre-task-branch - the value of `remote-sync-branch` at scheduling time; if it differs
    from the current setting at task start, the export aborts with `:error` (defense-in-depth
    against any path that mutates the setting between scheduling and the work running).

  Takes the incremental fast-path when every pending change can be applied incrementally (see
  `incremental-plan` — creates, in-place updates, renames, and deletes of entity-id models). Otherwise does a
  full export: re-serializes the entire synced set, writes it, marks all RemoteSyncObject rows synced,
  and records each entity's `file_path` so future renames/deletes can go incremental.

  Behavior when the remote branch has advanced beyond the last sync:
  - `force?`           -> overwrite the remote wholesale (full re-serialize).
  - `merge?`           -> 3-way merge; non-conflicting remote changes are merged in and reconciled into the
                          local app DB; genuine same-entity conflicts return a `:conflict`.
  - neither (default)  -> refuse with `:conflict` (the UI's export preflight decides force/branch/merge).

  When the remote has NOT advanced, takes the incremental fast-path (see `incremental-plan`) when
  possible, otherwise a full re-serialize.

  Returns a map with :status (`:success`, `:conflict`, or `:error`), and optionally :message, :version,
  and :merge-summary keys. Various exceptions are caught and converted to error status maps."
  [^SourceSnapshot snapshot task-id message & {:keys [force? merge? base-snapshot pre-task-branch] src :source}]
  (when (branch-changed-since-scheduling? pre-task-branch)
    (log/warnf "Aborting export: remote-sync-branch changed from %s to %s since task was scheduled"
               pre-task-branch (settings/remote-sync-branch))
    (throw (ex-info "Branch setting changed since task was scheduled; aborting to protect data integrity"
                    {:pre-task-branch pre-task-branch
                     :current-branch  (settings/remote-sync-branch)})))
  (when (not snapshot)
    (throw (ex-info "Remote sync source is not enabled. Please configure MB_GIT_SOURCE_REPO_URL environment variable." {})))
  (let [sync-timestamp (t/instant)]
    (try
      (analytics/inc! :metabase-remote-sync/exports)
      (serdes/with-cache
        (let [base-version   (remote-sync.task/last-version)
              remote-version (source.p/version snapshot)
              diverged?      (and (some? base-version)
                                  (not= base-version remote-version))
              ;; Pending-change inputs for the undiverged path; only computed there (incremental-plan can
              ;; be expensive, and they are unused on the force/merge branches).
              normal?        (and (not force?) (not diverged?))
              disabled-files (when normal?
                               (filterv (comp (disabled-content-dirs) path-top-level-dir)
                                        (source.p/list-files snapshot)))
              dirty-rows     (when normal? (seq (remote-sync.object/dirty-rows)))
              plan           (when dirty-rows (incremental-plan snapshot dirty-rows))]
          (cond
            ;; Forced overwrite — full re-serialize, replacing managed dirs (discards remote divergence).
            force?
            (do
              (log/info "Remote sync full export: forced overwrite")
              (full-export! snapshot task-id message sync-timestamp))

            ;; Remote hasn't advanced and there's nothing to export: no dirty rows and no stale files in
            ;; now-disabled content dirs.
            (and (not diverged?) (empty? dirty-rows) (empty? disabled-files))
            (do
              (log/info "Remote sync export: no changes to export")
              {:status :success
               :outcome {:kind "push-skipped"}})

            ;; Remote hasn't advanced but a dirty row can't be applied incrementally → full re-serialize.
            (and (not diverged?) (= plan :remote-sync/unsyncable-batch))
            (do
              (log/info "Remote sync full export: a pending change can't be applied incrementally")
              (full-export! snapshot task-id message sync-timestamp))

            ;; Remote hasn't advanced — incremental fast-path: write only the changed entities, deleting
            ;; their old paths plus files left behind in now-disabled content dirs, preserving every other.
            (not diverged?)
            (let [{:keys [upserts delete-paths synced removed-ids]} plan
                  delete-paths (into (vec delete-paths) disabled-files)]
              (remote-sync.task/update-progress! task-id 0.3)
              (let [written-version (source.p/apply-changes! snapshot message upserts delete-paths)]
                (remote-sync.task/set-version! task-id written-version))
              (doseq [{:keys [id file_path]} synced]
                (t2/update! :model/RemoteSyncObject :id id
                            {:status "synced" :file_path file_path :status_changed_at sync-timestamp}))
              (when (seq removed-ids)
                (t2/delete! :model/RemoteSyncObject :id [:in removed-ids]))
              (log/infof "Remote sync incremental export: wrote %d, deleted %d"
                         (count upserts) (count delete-paths))
              {:status :success
               :outcome {:kind "pushed"
                         :count (+ (count upserts) (count delete-paths))
                         :branch (settings/remote-sync-branch)}})

            ;; Remote advanced and the caller did not ask to merge — refuse. The UI's export preflight
            ;; drives the choice between force, new branch, and merge.
            (not merge?)
            {:status    :conflict
             :version   remote-version
             :conflicts []
             :message   "The remote branch has changed since your last sync. Choose how to proceed."}

            ;; Merge requested but the merge base is gone (force-push/rebase) — no safe 3-way merge.
            (nil? base-snapshot)
            {:status    :conflict
             :version   remote-version
             :conflicts ["Remote history was rewritten (force-push or rebase); cannot merge automatically."]
             :message   "Cannot merge: the remote branch history was rewritten. Re-import then export, or force the export to overwrite."}

            ;; Merge: 3-way merge, push the result, and reconcile the local app DB.
            :else
            (export-merged! src snapshot base-snapshot task-id message sync-timestamp
                            (spec/extract-entities-for-export)))))
      (catch Exception e
        ;; handle-task-result! records the failure on this result, and skips entirely when the task
        ;; was already cancelled (ended_at set) — so cancellation needs no special case here.
        (log/errorf e "Failed to export to git repository: %s" (ex-message e))
        (analytics/inc! :metabase-remote-sync/exports-failed)
        {:status :error
         :message (format "Failed to export to git repository: %s" (ex-message e))})
      (finally
        (analytics/observe! :metabase-remote-sync/export-duration-ms (t/as (t/duration sync-timestamp (t/instant)) :millis))))))

(defn create-task-with-lock!
  "Takes a cluster-wide lock and either returns an existing in-progress RemoteSyncTask ID or creates a new one.

  Takes a task-type string (either 'import' or 'export'). Returns a RemoteSyncTask with an optional :existing? key.
  If a task is already running (per `current-task`, which uses the staleness window), returns
  `(assoc existing-task :existing? true)`. Otherwise — i.e., no current task, but stale rows might still
  be hanging around — calls `supersede-stale-tasks!` to mark them terminated, then creates a new task.

  Used directly by the auto-import Quartz job, so auto-imports self-heal after a stale task. User-driven
  endpoints go through `ensure-no-active-task!` first (in `async-import!` / `async-export!` / etc.), which
  uses the stricter `task-running?` predicate and refuses if any task — including stale — is alive. So
  this function only reaches the supersession branch on the auto-import path."
  [task-type]
  (cluster-lock/with-cluster-lock ::remote-sync-task
    (if-let [task (remote-sync.task/current-task)]
      (assoc task :existing? true)
      (do
        (remote-sync.task/supersede-stale-tasks!)
        (remote-sync.task/create-sync-task! task-type api/*current-user-id*)))))

;;; ------------------------------------------- Remote Changes Check -------------------------------------------

(def ^:private remote-changes-cache
  "Cache for remote changes check to avoid frequent git operations.
   Structure: {:last-checked <instant>
               :branch <branch-name>
               :remote-version <git-sha>
               :local-version <git-sha or nil>
               :has-changes? <boolean>}"
  (atom nil))

(defn invalidate-remote-changes-cache!
  "Invalidate the remote changes cache. Call this after import/export."
  []
  (reset! remote-changes-cache nil))

(defn- cache-expired?
  "Check if the cache has expired based on TTL setting."
  [last-checked]
  (let [ttl-seconds (settings/remote-sync-check-changes-cache-ttl-seconds)
        expiry-time (t/plus last-checked (t/seconds ttl-seconds))]
    (t/after? (t/instant) expiry-time)))

(defn- cache-valid? [cache-state current-branch force-refresh?]
  (and cache-state
       (not force-refresh?)
       (= current-branch (:branch cache-state))
       (not (cache-expired? (:last-checked cache-state)))))

(defn- snapshot-or-missing-branch
  "Returns a snapshot of `source`, or `::missing-branch` if the configured branch
  no longer exists on the remote. Other exceptions propagate."
  [source]
  (try
    (source.p/snapshot source)
    (catch Exception e
      (case (:error-type (ex-data e))
        :missing-branch ::missing-branch
        (throw e)))))

(defn- branch-missing-result
  "Response for a configured branch that no longer exists upstream. Intentionally
  not cached so the next call re-checks after the user switches branches."
  [current-branch last-imported]
  {:last-checked (t/instant)
   :branch current-branch
   :remote-version nil
   :local-version last-imported
   :has-changes? false
   :branch-missing? true
   :cached? false})

(defn- fresh-result!
  "Computes a has-remote-changes? response from a successful snapshot, caches it,
  and returns it tagged as uncached."
  [current-branch last-imported snapshot]
  (let [current-remote (source.p/version snapshot)
        result {:last-checked (t/instant)
                :branch current-branch
                :remote-version current-remote
                :local-version last-imported
                ;; has-changes? is true if nothing's been imported yet, or if
                ;; remote moved past local.
                :has-changes? (or (nil? last-imported)
                                  (not= last-imported current-remote))}]
    (reset! remote-changes-cache result)
    (assoc result :cached? false)))

(defn has-remote-changes?
  "Check if remote has new changes compared to last imported version.
   Uses cache to avoid frequent git operations. Returns map with:
   - :has-changes? boolean
   - :remote-version string (git SHA)
   - :local-version string (git SHA of last import, or nil)
   - :cached? boolean (whether result came from cache)
   - :branch-missing? boolean (true if the configured branch no longer exists
     on the remote; the result is not cached in that case so the next call
     picks up a branch switch immediately)

   Cache is invalidated if:
   - TTL has expired
   - Branch setting has changed
   - force-refresh? is true"
  ([]
   (has-remote-changes? nil))
  ([{:keys [force-refresh?]}]
   (let [cache-state @remote-changes-cache
         current-branch (settings/remote-sync-branch)]
     (if (cache-valid? cache-state current-branch force-refresh?)
       (assoc cache-state :cached? true)
       (let [last-imported (remote-sync.task/last-version)
             source (source/source-from-settings current-branch)
             snapshot (snapshot-or-missing-branch source)]
         (if (= ::missing-branch snapshot)
           (branch-missing-result current-branch last-imported)
           (fresh-result! current-branch last-imported snapshot)))))))

;;; ------------------------------------------- Task Result Handling -------------------------------------------

(defn handle-task-result!
  "Handles the outcome of running import! or export! by updating the RemoteSyncTask record.

  Takes a result map with a :status key (either :success, :conflict, or :error) and optional :message key, a
  RemoteSyncTask ID, and an optional branch name. On success, updates the remote-sync-branch setting (if branch
  provided), marks the task complete, and invalidates the remote changes cache. On conflict, sets the version and
  stores the conflicts. On error, marks the task as failed with the error message. For any other status, marks the
  task as failed with 'Unexpected Error'.

  If the task has already been terminated (`ended_at` is set, e.g., because an admin cancelled it
  via POST /current-task/cancel while the virtual thread was still running), this function logs a
  warning and returns without writing anything. This prevents a still-running thread from clobbering
  the cancellation bookkeeping or stomping the branch setting via its captured value.

  The read and the subsequent write happen in a single transaction with `SELECT ... FOR UPDATE` so
  a concurrent cancel cannot slip in between the terminated-check and the result-write."
  [result task-id & [branch]]
  (let [proceed?
        (t2/with-transaction [_conn]
          (let [task (t2/select-one :model/RemoteSyncTask :id task-id {:for :update})]
            (cond
              (nil? task)
              (do (log/warnf "Task %s missing during result handling; skipping" task-id)
                  false)

              (some? (:ended_at task))
              (do (log/warnf "Task %s already terminated (ended_at=%s); skipping result handling to preserve state"
                             task-id (:ended_at task))
                  false)

              :else
              (do
                (case (:status result)
                  :success (do
                             (when branch
                               (settings/remote-sync-branch! branch))
                             (remote-sync.task/complete-sync-task! task-id (:outcome result)))
                  :conflict (do
                              (remote-sync.task/set-version! task-id (:version result))
                              (remote-sync.task/conflict-sync-task! task-id (:conflicts result)))
                  :error (remote-sync.task/fail-sync-task! task-id (:message result))
                  (remote-sync.task/fail-sync-task! task-id "Unexpected Error"))
                true))))]
    (when (and proceed? (= (:status result) :success))
      (invalidate-remote-changes-cache!))))

(defn publish-sync-event!
  "Publishes an audit-log event for a completed remote-sync task. Call after the task result has been
  handled so the task row already has its version set. `details` is the audit-log details map
  (e.g. `{:branch \"main\"}`, plus `:auto true` for system-triggered syncs); `user-id` is nil for
  system-triggered syncs."
  [topic task-id details user-id]
  (let [task (t2/select-one :model/RemoteSyncTask task-id)]
    (events/publish-event! topic
                           {:object  task
                            :details details
                            :user-id user-id})))

(defn- run-async!
  "Executes a remote sync task asynchronously in a virtual thread.

  Takes a task-type string ('import' or 'export'), a branch name to update in settings upon completion, a
  sync-fn function that takes a task-id and performs the sync operation, and an optional :on-success callback
  that receives [task-id result] after a successful sync. Creates a new task (or errors if one is already
  running), then executes the sync function in a virtual thread with a timeout.

  Returns a RemoteSyncTask. Throws ExceptionInfo with status 400 if a sync task is already in progress."
  [task-type branch sync-fn & {:keys [on-success]}]
  (let [{task-id :id existing? :existing? :as task} (create-task-with-lock! task-type)]
    (api/check-400 (not existing?) "Remote sync in progress")
    (u.jvm/in-virtual-thread*
     (dh/with-timeout {:interrupt? true
                       :timeout-ms (* (settings/remote-sync-task-time-limit-ms) 10)}
       (let [result (try
                      (sync-fn task-id)
                      (catch Exception e
                        (log/error e "Remote sync task failed")
                        {:status :error
                         :message (source-error-message e)}))]
         (handle-task-result! result task-id branch)
         (when (and on-success (= :success (:status result)))
           (try
             (on-success task-id result)
             (catch Exception e
               (log/error e "Remote sync task :on-success function failed")))))))
    task))

(defn async-import!
  "Imports remote-synced collections from a remote source repository asynchronously.

  Takes a branch name to import from, a force? boolean (if true, imports even if there are unsaved changes or conflicts),
  and an import-args map of additional arguments to pass to the import function. Optionally accepts an :on-success
  callback that receives [task-id result] after a successful import. Checks for dirty changes and throws an
  exception if force? is false and changes exist.

  When `:merge?` is set, a local-only 3-way merge keeps un-pushed local changes instead of overwriting
  them, so the dirty-changes guard is skipped.

  Returns a RemoteSyncTask. Throws ExceptionInfo with status 400 and :conflicts true if there
  are unsaved changes and neither force? nor merge? is set."
  [branch force? import-args & {:keys [on-success merge? force-deletion?]}]
  (guards/ensure-no-active-task!)
  (let [pre-task-branch        (settings/remote-sync-branch)
        source                 (source/source-from-settings branch)
        has-dirty?             (remote-sync.object/dirty?)
        snapshot               (source.p/snapshot source)
        ;; the merge base for a merge pull. When the remote has not advanced it is the remote tip itself
        ;; (base == theirs, so import-merged! no-ops and keeps local dirty). When the remote has advanced
        ;; it's the last-synced commit, which may be nil if orphaned by a force-push/rebase (→ conflict).
        ;; nil also when there's no prior sync. Resolved only for a merge.
        last-task-version      (remote-sync.task/last-version)
        base-snapshot          (when (and merge? (some? last-task-version))
                                 (if (= last-task-version (source.p/version snapshot))
                                   snapshot
                                   (source.p/snapshot-at source last-task-version)))]
    (when (and has-dirty? (not force?) (not merge?))
      (throw (ex-info "There are unsaved changes in the Remote Sync collection which will be overwritten by the import. Force the import to discard these changes."
                      {:status-code 400
                       :conflicts true})))
    (run-async! "import" branch
                (fn [task-id]
                  (import! snapshot task-id
                           (assoc import-args
                                  :force?           force?
                                  :force-deletion?  force-deletion?
                                  :merge?           merge?
                                  :base-snapshot    base-snapshot
                                  :pre-task-branch  pre-task-branch)))
                :on-success on-success)))

(defn async-export!
  "Exports the remote-synced collections to the remote source repository asynchronously.

  Takes a branch name to export to, a force? boolean, and a commit message string. Optionally accepts
  `:merge?` (perform a 3-way merge when the remote has advanced) and an `:on-success` callback that
  receives [task-id result] after a successful export.

  Behavior when the remote branch has advanced beyond the last synced version:
  - `force?`          -> overwrite the remote wholesale.
  - `:merge? true`    -> entity-identity 3-way merge; non-conflicting remote changes are merged in and
                         reconciled into the local app DB; genuine same-entity conflicts surface as a
                         `:conflict` task result.
  - neither (default) -> `:conflict` task result; the caller (typically the UI, via the export preflight)
                         decides whether to force, branch, or merge.

  Returns a RemoteSyncTask."
  [branch force? message & {:keys [on-success merge?]}]
  (guards/ensure-no-active-task!)
  (let [pre-task-branch        (settings/remote-sync-branch)
        source                 (source/source-from-settings branch)
        last-task-version      (remote-sync.task/last-version)
        snapshot               (source.p/snapshot source)
        current-source-version (source.p/version snapshot)
        ;; the merge base, resolved only when the remote has advanced; nil here means a 3-way merge isn't
        ;; possible (no prior sync, or the base commit was orphaned by a force-push/rebase)
        base-snapshot          (when (and (some? last-task-version)
                                          (not= last-task-version current-source-version))
                                 (source.p/snapshot-at source last-task-version))]
    (run-async! "export" branch
                (fn [task-id]
                  (export! snapshot task-id message
                           :force?          force?
                           :merge?          merge?
                           :source          source
                           :base-snapshot   base-snapshot
                           :pre-task-branch pre-task-branch))
                :on-success on-success)))

(defn preview-export-merge
  "Dry-run preview of what exporting the current state would do given the live remote, without writing
  anything. Drives the UI's push decision (force / new branch / merge). Returns a map:
  - `:diverged?` - whether the remote branch has advanced beyond the last synced version
  - `:clean?`    - whether a 3-way merge would apply with no conflicts
  - `:conflicts` - human-readable labels of the entities that conflict (empty when clean)
  - `:summary`   - `{:added :updated :removed}` counts of remote changes a merge would fold in
  - `:force-push-casualties` - `{:deleted :overwritten}` labels of remote content a force push would discard
  - `:reason`    - `:history-rewritten` when the remote was force-pushed/rebased so no merge base exists

  `branch` is the branch to preview against — the caller is responsible for having validated it against
  the `remote-sync-branch` setting."
  [branch]
  (let [no-changes {:diverged? false :clean? true :conflicts [] :summary {:added 0 :updated 0 :removed 0}
                    :force-push-casualties {:deleted [] :overwritten []}}
        source         (source/source-from-settings branch)
        snapshot       (source.p/snapshot source)
        remote-version (source.p/version snapshot)
        base-version   (remote-sync.task/last-version)]
    (if (or (nil? base-version) (= base-version remote-version))
      no-changes
      (if-let [base-snapshot (source.p/snapshot-at source base-version)]
        (serdes/with-cache
          (if-let [models (spec/extract-entities-for-export)]
            (assoc (source/preview-merge models snapshot base-snapshot nil) :diverged? true)
            (assoc no-changes :diverged? true)))
        ;; No merge base — the remote history was rewritten. A merge is impossible, but a force push is
        ;; still offered, so surface what it would discard (every remote entity not identical to ours).
        {:diverged? true :clean? false :reason :history-rewritten
         :conflicts [] :summary {:added 0 :updated 0 :removed 0}
         :force-push-casualties (serdes/with-cache
                                  (if-let [models (spec/extract-entities-for-export)]
                                    (source/force-push-casualties-no-base models snapshot)
                                    {:deleted [] :overwritten []}))}))))

(defn create-branch!
  "Creates a new remote branch from `base-branch` and switches `remote-sync-branch`
   to the new name. Does not publish events or return a response map; the caller
   is responsible for those concerns."
  [name base-branch]
  (guards/ensure-no-active-task!)
  (let [source (source/source-from-settings)]
    (source.p/create-branch source name base-branch)
    (settings/remote-sync-branch! name)))

(defn stash!
  "Creates a new remote branch from the current `remote-sync-branch` and starts an
   async export to it. Returns the resulting RemoteSyncTask. Does not publish events."
  [new-branch message & {:keys [on-success]}]
  (guards/ensure-no-active-task!)
  (let [source (source/source-from-settings)]
    (source.p/create-branch source new-branch (settings/remote-sync-branch))
    (async-export! new-branch false message :on-success on-success)))

(defn finish-remote-config!
  "Based on the current configuration, fill in any missing settings and finalize remote sync setup.

  Will attempt, import the remote collection if no remote-collection exists locally or you are in read-only mode.

  Returns the async-task id if an async task was started, otherwise nil."
  []
  (if (settings/remote-sync-enabled)
    (do
      (when (str/blank? (setting/get :remote-sync-branch))
        (setting/set! :remote-sync-branch (source.p/default-branch (source/source-from-settings))))
      (when (= :read-only (settings/remote-sync-type))
        ;; force? true bypasses the version/dirty guards for setup, but force-deletion? false keeps unsynced
        ;; local transforms from being silently destroyed — they surface as a conflict instead (GHY-3900).
        (:id (async-import! (settings/remote-sync-branch) true {} :force-deletion? false))))
    (do
      (collection/clear-remote-synced-collection!)
      nil)))
