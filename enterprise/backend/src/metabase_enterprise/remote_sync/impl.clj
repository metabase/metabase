(ns metabase-enterprise.remote-sync.impl
  (:require
   [clojure.string :as str]
   [diehard.core :as dh]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.guards :as guards]
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
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml]
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

(defn import!
  "Imports and reloads Metabase entities from a remote snapshot.

  Takes a SourceSnapshot instance, a RemoteSyncTask ID for progress tracking, and optional keyword arguments:
  - :force? - forces import even when the snapshot version matches the last imported version
  - :pre-task-branch - the value of `remote-sync-branch` at scheduling time; if it differs
    from the current setting at task start, the import aborts with `:error` to protect data
    integrity (the load mutates the app DB, so we refuse to proceed when state has drifted)

  Loads serialized entities, removes entities not in the import, syncs the remote-sync-object table, and
  optionally creates a remote-synced collection.

  Returns a map with :status (either :success or :error), :version, and :message keys. Various exceptions may be
  thrown during import and are caught and converted to error status maps."
  [^SourceSnapshot snapshot task-id & {:keys [force? pre-task-branch]}]
  (when (and (some? pre-task-branch)
             (not= pre-task-branch (settings/remote-sync-branch)))
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
        (let [snapshot-version (source.p/version snapshot)
              last-imported-version (remote-sync.task/last-version)
              first-import? (nil? last-imported-version)
              path-filters (mapv #(re-pattern (str % "/.*")) serialization/legal-top-level-paths)
              base-ingestable (source.p/->ingestable snapshot {:path-filters path-filters})
              has-transforms? (snapshot-has-transforms? base-ingestable)
              {:keys [conflicts summary]} (get-conflicts base-ingestable first-import?)
              ingestable-snapshot (source.ingestable/wrap-progress-ingestable task-id 0.7 base-ingestable)]
          (cond
            (and first-import? (not force?) (seq conflicts))
            (u/prog1 {:status :conflict
                      :version (source.p/version snapshot)
                      :conflicts summary          ; Keep backward compatibility: return set of category names
                      :conflict-details conflicts ; New: detailed conflict info
                      :message (format "Skipping import: snapshot version %s contains conflicts use force to override" snapshot-version)}
              (log/infof (:message <>)))

            (and (not force?) (= last-imported-version snapshot-version))
            (u/prog1 {:status :success
                      :version (source.p/version snapshot)
                      :message (format "Skipping import: snapshot version %s matches last imported version" snapshot-version)}
              (log/infof (:message <>)))

            :else
            (let [load-result (serdes/with-cache
                                (serialization/load-metabase! ingestable-snapshot))
                  seen-paths (:seen load-result)
                  imported-data (spec/extract-imported-entities seen-paths)]
              (remote-sync.task/update-progress! task-id 0.8)
              (when (and has-transforms?
                         (not (settings/remote-sync-transforms)))
                (log/info "Detected transforms in remote source, enabling remote-sync-transforms setting")
                (settings/remote-sync-transforms! true))
              (t2/with-transaction [_conn]
                (remove-unsynced! (spec/all-syncable-collection-ids) imported-data)
                (sync-objects! sync-timestamp imported-data)
                ;; Record the actual repo path each entity was read from, so later renames/deletes
                ;; resolve the real file and stay on the incremental export fast-path.
                (record-exported-paths! (source.ingestable/cached-file-paths base-ingestable)))
              (when (and (not has-transforms?)
                         (settings/remote-sync-transforms))
                (log/info "No transforms in remote source, disabling remote-sync-transforms setting")
                (settings/remote-sync-transforms! false))
              (remote-sync.task/update-progress! task-id 0.95)
              (remote-sync.task/set-version!
               task-id
               (source.p/version snapshot))
              (log/info "Successfully reloaded entities from git repository")
              {:status :success
               :version (source.p/version snapshot)
               :message "Successfully reloaded from git repository"})))
        (catch Exception e
          (handle-import-exception e snapshot))
        (finally
          (analytics/observe! :metabase-remote-sync/import-duration-ms (t/as (t/duration sync-timestamp (t/instant)) :millis))))
      {:status :error
       :message "Remote sync source is not enabled. Please configure MB_GIT_SOURCE_REPO_URL environment variable."})))

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
      (record-exported-paths! entries))
    {:status :success}))

(defn export!
  "Exports remote-synced collections to a remote source repository.

  Takes a SourceSnapshot instance, a RemoteSyncTask ID for progress tracking, a commit message string, and
  optional keyword arguments:
  - :pre-task-branch - the value of `remote-sync-branch` at scheduling time; if it differs
    from the current setting at task start, the export aborts with `:error` (defense-in-depth
    against any path that mutates the setting between scheduling and the work running).

  Takes the incremental fast-path when every pending change can be applied incrementally (see
  `incremental-plan` — creates, in-place updates, renames, and deletes of entity-id models). Otherwise does a
  full export: re-serializes the entire synced set, writes it, marks all RemoteSyncObject rows synced,
  and records each entity's `file_path` so future renames/deletes can go incremental.

  Returns a map with {:status :success}, {:status :error}, or throws an exception with an appropriate message."
  [^SourceSnapshot snapshot task-id message & {:keys [pre-task-branch]}]
  ;; Defense-in-depth: refuse to run if the branch setting drifted between scheduling and now.
  (when (and (some? pre-task-branch)
             (not= pre-task-branch (settings/remote-sync-branch)))
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
        (let [disabled-files (filterv (comp (disabled-content-dirs) path-top-level-dir)
                                      (source.p/list-files snapshot))
              dirty-rows     (seq (remote-sync.object/dirty-rows))
              plan           (when dirty-rows (incremental-plan snapshot dirty-rows))]
          (cond
            ;; nothing to do: no pending changes and no stale files in now-disabled content dirs
            (and (empty? dirty-rows) (empty? disabled-files))
            (do
              (log/info "Remote sync export: no changes to export")
              {:status :success})

            ;; a dirty row can't be applied incrementally → full re-serialize
            (= plan :remote-sync/unsyncable-batch)
            (full-export! snapshot task-id message sync-timestamp)

            ;; Incremental fast-path: write only the changed entities, and delete their old paths plus
            ;; any files left behind in now-disabled content dirs — preserving every other file. Avoids
            ;; re-serializing the entire synced set.
            :else
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
              {:status :success}))))
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
                             (remote-sync.task/complete-sync-task! task-id))
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

  Returns a RemoteSyncTask. Throws ExceptionInfo with status 400 and :conflicts true if there
  are unsaved changes and force? is false."
  [branch force? import-args & {:keys [on-success]}]
  (guards/ensure-no-active-task!)
  (let [pre-task-branch (settings/remote-sync-branch)
        source          (source/source-from-settings branch)
        has-dirty?      (remote-sync.object/dirty?)]
    (when (and has-dirty? (not force?))
      (throw (ex-info "There are unsaved changes in the Remote Sync collection which will be overwritten by the import. Force the import to discard these changes."
                      {:status-code 400
                       :conflicts true})))
    (run-async! "import" branch
                (fn [task-id]
                  (import! (source.p/snapshot source) task-id
                           (assoc import-args
                                  :force?           force?
                                  :pre-task-branch  pre-task-branch)))
                :on-success on-success)))

(defn async-export!
  "Exports the remote-synced collections to the remote source repository asynchronously.

  Takes a branch name to export to, a force? boolean (if true, exports even if there are new changes in the remote
  branch), and a commit message string. Optionally accepts an :on-success callback that receives [task-id result]
  after a successful export. Checks if the remote branch has changed since the last sync and throws an
  exception if force? is false and changes exist.

  Returns a RemoteSyncTask. Throws ExceptionInfo with status 400 and :conflicts true if there
  are new remote changes and force? is false."
  [branch force? message & {:keys [on-success]}]
  (guards/ensure-no-active-task!)
  (let [pre-task-branch        (settings/remote-sync-branch)
        source                 (source/source-from-settings branch)
        last-task-version      (remote-sync.task/last-version)
        snapshot               (source.p/snapshot source)
        current-source-version (source.p/version snapshot)]
    (when (and (not force?) (some? last-task-version) (not= last-task-version current-source-version))
      (throw (ex-info "Cannot export changes that will overwrite new changes in the branch."
                      {:status-code 400
                       :conflicts true})))
    (run-async! "export" branch
                (fn [task-id]
                  (export! snapshot task-id message
                           :pre-task-branch pre-task-branch))
                :on-success on-success)))

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
