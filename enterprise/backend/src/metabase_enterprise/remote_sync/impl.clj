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
   [metabase.models.serialization :as serdes]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import (metabase_enterprise.remote_sync.source.protocol SourceSnapshot)))

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

    :else
    (format "Failed to reload from git repository: %s" (ex-message e))))

(defn- handle-import-exception
  "Handles exceptions that occur during import by logging and returning an error status map.

  If the exception indicates cancellation (has :cancelled? in ex-data), logs an info message and returns nil.
  Otherwise logs the error, increments the failed imports analytics metric, and returns a map with :status :error,
  a user-friendly :message, the source :version, and error :details."
  [e snapshot]
  (if (:cancelled? (ex-data e))
    (log/info "Import from git repository was cancelled")
    (do
      (log/errorf e "Failed to reload from git repository: %s" (ex-message e))
      (analytics/inc! :metabase-remote-sync/imports-failed)
      {:status :error
       :message (source-error-message e)
       :version (source.p/version snapshot)

       :details {:error-type (type e)}})))

(defn- get-conflicts
  "Detects conflicts that would prevent or complicate import.
   Returns a map with :conflicts (detailed list) and :summary (set of category names).

   Conflict types detected:
   - :entity-id-conflict - Items with existing entity IDs that are NOT already synced
   - :library-conflict - First import only, local Library exists, import has Library
   - :transforms-not-enabled - Import has Transform/TransformTag/PythonLibrary, setting disabled
   - :snippets-without-library - Import has NativeQuerySnippet, Library not remote-synced"
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
        all-conflicts (concat
                       feature-conflicts
                       ns-coll-conflicts
                       (when library-conflict [library-conflict]))]
    {:conflicts (vec all-conflicts)
     :summary (into #{} (map :category) all-conflicts)}))

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
  brought remote changes that must now be applied locally). Returns the imported-data map. Does not set
  the task version — callers own that."
  [snapshot task-id sync-timestamp]
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
      (sync-objects! sync-timestamp imported-data))
    (when (and (not has-transforms?)
               (settings/remote-sync-transforms))
      (log/info "No transforms in remote source, disabling remote-sync-transforms setting")
      (settings/remote-sync-transforms! false))
    (remote-sync.task/update-progress! task-id 0.95)
    imported-data))

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

  On a genuine same-entity conflict, returns `:conflict` without touching local state."
  [snapshot base-snapshot task-id sync-timestamp]
  (if (nil? base-snapshot)
    {:status    :conflict
     :version   (source.p/version snapshot)
     :conflicts ["Remote history was rewritten (force-push or rebase); cannot merge automatically."]
     :message   "Cannot merge: the remote branch history was rewritten. Discard local changes and pull, or push to a new branch."}
    (let [models (spec/extract-entities-for-export)
          {:keys [merged conflicts summary]}
          (source/compute-merge models snapshot base-snapshot task-id)]
      (if (seq conflicts)
        (u/prog1 {:status    :conflict
                  :version   (source.p/version snapshot)
                  :conflicts (mapv remote-sync.merge/conflict-label conflicts)
                  :message   "Import blocked: the same content was changed both locally and on the remote branch."}
          (log/infof "Pull merge conflict on %d entit(ies): %s"
                     (count conflicts) (str/join ", " (:conflicts <>))))
        ;; Capture the local (un-pushed) changes before loading; the clean merge guarantees they are
        ;; disjoint from the remote changes, so restoring them reproduces exactly the local diff vs remote.
        (let [dirty-objects (capture-dirty-objects)]
          (load-snapshot! (source/specs->snapshot merged) task-id sync-timestamp)
          (restore-dirty-objects! dirty-objects sync-timestamp)
          (remote-sync.task/set-version! task-id (source.p/version snapshot))
          (log/infof "Pull merge: folded in %d remote change(s) (added %d, updated %d, removed %d); kept %d local change(s)"
                     (apply + (vals summary)) (:added summary) (:updated summary) (:removed summary)
                     (count dirty-objects))
          {:status :success
           :version (source.p/version snapshot)
           :merge-summary summary})))))

(defn import!
  "Imports and reloads Metabase entities from a remote snapshot.

  Takes a SourceSnapshot instance, a RemoteSyncTask ID for progress tracking, and optional keyword arguments:
  - :force? - forces import even when the snapshot version matches the last imported version
  - :merge? - perform a local-only 3-way merge (keep un-pushed local changes) instead of overwriting local
  - :base-snapshot - the merge base (last synced version), required when :merge? is set
  - :pre-task-branch - the value of `remote-sync-branch` at scheduling time; if it differs
    from the current setting at task start, the import aborts with `:error` to protect data
    integrity (the load mutates the app DB, so we refuse to proceed when state has drifted)

  Loads serialized entities, removes entities not in the import, syncs the remote-sync-object table, and
  optionally creates a remote-synced collection.

  Returns a map with :status (either :success or :error), :version, and :message keys. Various exceptions may be
  thrown during import and are caught and converted to error status maps."
  [^SourceSnapshot snapshot task-id & {:keys [force? merge? base-snapshot pre-task-branch]}]
  (when (branch-changed-since-scheduling? pre-task-branch)
    (log/warnf "Aborting import: remote-sync-branch changed from %s to %s since task was scheduled"
               pre-task-branch (settings/remote-sync-branch))
    (throw (ex-info "Branch setting changed since task was scheduled; aborting to protect data integrity"
                    {:pre-task-branch pre-task-branch
                     :current-branch  (settings/remote-sync-branch)})))
  (log/info "Reloading remote entities from the remote source")
  (analytics/inc! :metabase-remote-sync/imports)
  (let [sync-timestamp (t/instant)]
    (if snapshot
      (try
        (if merge?
          (import-merged! snapshot base-snapshot task-id sync-timestamp)
          (let [snapshot-version (source.p/version snapshot)
                last-imported-version (remote-sync.task/last-version)
                first-import? (nil? last-imported-version)
                path-filters (mapv #(re-pattern (str % "/.*")) serialization/legal-top-level-paths)
                base-ingestable (source.p/->ingestable snapshot {:path-filters path-filters})
                {:keys [conflicts summary]} (get-conflicts base-ingestable first-import?)]
            (cond
              (and first-import? (not force?) (seq conflicts))
              (u/prog1 {:status :conflict
                        :version (source.p/version snapshot)
                        :conflicts summary  ; Keep backward compatibility: return set of category names
                        :conflict-details conflicts  ; New: detailed conflict info
                        :message (format "Skipping import: snapshot version %s contains conflicts use force to override" snapshot-version)}
                (log/infof (:message <>)))

              (and (not force?) (= last-imported-version snapshot-version))
              (u/prog1 {:status :success
                        :version (source.p/version snapshot)
                        :message (format "Skipping import: snapshot version %s matches last imported version" snapshot-version)}
                (log/infof (:message <>)))

              :else
              (do
                (load-snapshot! snapshot task-id sync-timestamp)
                (remote-sync.task/set-version!
                 task-id
                 (source.p/version snapshot))
                (log/info "Successfully reloaded entities from git repository")
                {:status :success
                 :version (source.p/version snapshot)
                 :message "Successfully reloaded from git repository"}))))
        (catch Exception e
          (handle-import-exception e snapshot))
        (finally
          (analytics/observe! :metabase-remote-sync/import-duration-ms (t/as (t/duration sync-timestamp (t/instant)) :millis))))
      {:status :error
       :message "Remote sync source is not enabled. Please configure MB_GIT_SOURCE_REPO_URL environment variable."})))

(defn- export-merged!
  "Export path taken when the remote branch has advanced beyond the last synced version (`base-snapshot`
  is the merge base). Performs an entity-identity 3-way merge of local state against the remote tip:
  - on a genuine conflict (same entity changed on both sides) returns a `:conflict` result;
  - on a clean merge, writes the merged set (fast-forwarding onto the remote tip), then reconciles the
    local app DB by loading the merged result (the 'pull' half), so local now contains the remote's
    changes. Returns a `:success` result with a `:merge-summary`."
  [source snapshot base-snapshot task-id message sync-timestamp models]
  (let [{:keys [status version conflicts summary]}
        (source/merge-and-store! models snapshot base-snapshot task-id message)]
    (case status
      :conflict
      (u/prog1 {:status        :conflict
                :version       (source.p/version snapshot)
                :conflicts     (mapv remote-sync.merge/conflict-label conflicts)
                :merge-summary summary
                :message       "Export blocked: the same content was changed both locally and on the remote branch."}
        (log/infof "Export merge conflict on %d entit(ies): %s"
                   (count conflicts) (str/join ", " (:conflicts <>))))

      :success
      (do
        (remote-sync.task/set-version! task-id version)
        ;; Fold-in pull: the merge brought remote changes that aren't in the local app DB yet. Load the
        ;; merged result so local state matches what we just pushed.
        (when-let [merged-snapshot (source.p/snapshot-at source version)]
          (load-snapshot! merged-snapshot task-id sync-timestamp))
        (t2/update! :model/RemoteSyncObject {:status "synced" :status_changed_at sync-timestamp})
        (log/infof "Exported with merge: folded in %d remote change(s) (added %d, updated %d, removed %d)"
                   (apply + (vals summary)) (:added summary) (:updated summary) (:removed summary))
        {:status :success :version version :merge-summary summary}))))

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

  Extracts all remote-synced collections, serializes their content, writes the files to the source, and
  updates all RemoteSyncObject statuses to 'synced'.

  Behavior when the remote branch has advanced beyond the last sync:
  - `force?`           -> overwrite the remote wholesale.
  - `merge?`           -> 3-way merge; non-conflicting remote changes are merged in and reconciled into the
                          local app DB; genuine same-entity conflicts return a `:conflict`.
  - neither (default)  -> refuse with `:conflict` (the caller, typically the UI via the export preflight,
                          decides whether to force, branch, or merge).

  Returns a map with :status (`:success`, `:conflict`, or `:error`), :version, and optionally :message
  and :merge-summary keys. Various exceptions may be thrown during export and are caught and converted to
  error status maps."
  [^SourceSnapshot snapshot task-id message & {:keys [force? merge? base-snapshot pre-task-branch] src :source}]
  (when (branch-changed-since-scheduling? pre-task-branch)
    (log/warnf "Aborting export: remote-sync-branch changed from %s to %s since task was scheduled"
               pre-task-branch (settings/remote-sync-branch))
    (throw (ex-info "Branch setting changed since task was scheduled; aborting to protect data integrity"
                    {:pre-task-branch pre-task-branch
                     :current-branch  (settings/remote-sync-branch)})))
  (if snapshot
    (let [sync-timestamp (t/instant)]
      (try
        (analytics/inc! :metabase-remote-sync/exports)
        (serdes/with-cache
          (if-let [models (spec/extract-entities-for-export)]
            (let [base-version   (remote-sync.task/last-version)
                  remote-version (source.p/version snapshot)
                  diverged?      (and (some? base-version)
                                      (not= base-version remote-version))]
              (remote-sync.task/update-progress! task-id 0.3)
              (cond
                ;; No divergence, or the caller forced an overwrite — write the local state as-is.
                (or force? (not diverged?))
                (let [written-version (source/store! models snapshot task-id message)]
                  (remote-sync.task/set-version! task-id written-version)
                  (t2/update! :model/RemoteSyncObject {:status "synced" :status_changed_at sync-timestamp})
                  {:status :success
                   :version written-version})

                ;; Remote advanced and the caller did not ask to merge — refuse. The UI's export preflight
                ;; drives the choice between force, new branch, and merge.
                (not merge?)
                {:status    :conflict
                 :version   remote-version
                 :conflicts []
                 :message   "The remote branch has changed since your last sync. Choose how to proceed."}

                ;; Merge requested but the merge base is gone (force-push/rebase rewrote history) — no safe
                ;; 3-way merge is possible.
                (nil? base-snapshot)
                {:status    :conflict
                 :version   remote-version
                 :conflicts ["Remote history was rewritten (force-push or rebase); cannot merge automatically."]
                 :message   "Cannot merge: the remote branch history was rewritten. Re-import then export, or force the export to overwrite."}

                :else
                (export-merged! src snapshot base-snapshot task-id message sync-timestamp models)))
            {:status :error
             :message "No remote-syncable content available."}))
        (catch Exception e
          (if (:cancelled? (ex-data e))
            (log/info "Export to git repository was cancelled")
            (do
              (log/errorf e "Failed to export to git repository: %s" (ex-message e))
              (analytics/inc! :metabase-remote-sync/exports-failed)
              (remote-sync.task/fail-sync-task! task-id (ex-message e))
              {:status :error
               :version (source.p/version snapshot)
               :message (format "Failed to export to git repository: %s" (ex-message e))})))
        (finally
          (analytics/observe! :metabase-remote-sync/export-duration-ms (t/as (t/duration sync-timestamp (t/instant)) :millis)))))
    {:status :error
     :message "Remote sync source is not enabled. Please configure MB_GIT_SOURCE_REPO_URL environment variable."}))

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
                             (remote-sync.task/complete-sync-task! task-id))
                  :conflict (do
                              (remote-sync.task/set-version! task-id (:version result))
                              (remote-sync.task/conflict-sync-task! task-id (:conflicts result)))
                  :error (remote-sync.task/fail-sync-task! task-id (:message result))
                  (remote-sync.task/fail-sync-task! task-id "Unexpected Error"))
                true))))]
    (when (and proceed? (= (:status result) :success))
      (invalidate-remote-changes-cache!))))

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
  [branch force? import-args & {:keys [on-success merge?]}]
  (guards/ensure-no-active-task!)
  (let [pre-task-branch        (settings/remote-sync-branch)
        source                 (source/source-from-settings branch)
        has-dirty?             (remote-sync.object/dirty?)
        snapshot               (source.p/snapshot source)
        ;; the merge base, resolved only for a merge when the remote has advanced; nil means no safe
        ;; 3-way merge is possible (no prior sync, or the base commit was orphaned by force-push/rebase)
        last-task-version      (remote-sync.task/last-version)
        base-snapshot          (when (and merge?
                                          (some? last-task-version)
                                          (not= last-task-version (source.p/version snapshot)))
                                 (source.p/snapshot-at source last-task-version))]
    (when (and has-dirty? (not force?) (not merge?))
      (throw (ex-info "There are unsaved changes in the Remote Sync collection which will be overwritten by the import. Force the import to discard these changes."
                      {:status-code 400
                       :conflicts true})))
    (run-async! "import" branch
                (fn [task-id]
                  (import! snapshot task-id
                           (assoc import-args
                                  :force?           force?
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
  - `:reason`    - `:history-rewritten` when the remote was force-pushed/rebased so no merge base exists

  `branch` is the branch to preview against — the caller is responsible for having validated it against
  the `remote-sync-branch` setting."
  [branch]
  (let [no-changes {:diverged? false :clean? true :conflicts [] :summary {:added 0 :updated 0 :removed 0}}
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
        {:diverged? true :clean? false :reason :history-rewritten
         :conflicts [] :summary {:added 0 :updated 0 :removed 0}}))))

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
        (:id (async-import! (settings/remote-sync-branch) true {}))))
    (u/prog1 nil
      (collection/clear-remote-synced-collection!))))
