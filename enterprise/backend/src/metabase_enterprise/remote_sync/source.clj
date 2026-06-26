(ns metabase-enterprise.remote-sync.source
  (:require
   [clojure.string :as str]
   [metabase-enterprise.remote-sync.merge :as remote-sync.merge]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.source.git :as git]
   [metabase-enterprise.remote-sync.source.ingestable :as ingestable]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase.models.serialization :as serdes]
   [metabase.settings.core :as setting]
   [metabase.util.yaml :as yaml]
   [methodical.core :as methodical])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

;; A read-only, path-filtered view over a snapshot, used to scope ingestion to a set of path regexes:
;; files (and reads) outside the filters are omitted. It is not a write target — exports write to the
;; unfiltered source snapshot — so the write methods throw rather than silently filtering writes.
(defrecord WrappingSnapshot [original-snapshot path-filters]
  source.p/SourceSnapshot

  (list-files [_]
    (filter (fn [file-path]
              (some (fn [path-filter] (re-matches path-filter file-path)) path-filters))
            (source.p/list-files original-snapshot)))

  (read-file [_ path]
    (when (some (fn [path-filter] (re-matches path-filter path)) path-filters)
      (source.p/read-file original-snapshot path)))

  (write-files! [_ _message _files]
    (throw (UnsupportedOperationException. "WrappingSnapshot is a read-only ingestion view, not a write target.")))

  (apply-changes! [_ _message _upserts _delete-paths]
    (throw (UnsupportedOperationException. "WrappingSnapshot is a read-only ingestion view, not a write target.")))

  (version [_]
    (source.p/version original-snapshot)))

(methodical/defmethod source.p/->ingestable :default
  [snapshot {:keys [path-filters root-dependencies]}]
  (cond->> (ingestable/->IngestableSnapshot (cond-> snapshot
                                              (seq path-filters) (->WrappingSnapshot path-filters))
                                            (atom nil) (atom []))
    (seq root-dependencies) (ingestable/wrap-root-dep-ingestable root-dependencies)))

(defn- remote-sync-path
  [opts entity]
  (let [resolved (serialization/resolve-storage-path opts entity)
        dirnames (drop-last resolved)
        basename (str (last resolved) ".yaml")]
    (str/join File/separator (concat dirnames [basename]))))

(defn entity->file-spec
  "Serializes a single extracted entity into a `{:path :content}` file spec, using storage context
  `opts` (from `serdes/storage-base-context`)."
  [opts entity]
  {:path    (remote-sync-path opts entity)
   :content (yaml/generate-string (serialization/serialization-deep-sort entity)
                                  {:dumper-options {:flow-style :block :split-lines false}})})

(defn serialize-specs
  "Serializes a stream of entities into an eager vector of `{:path :content}` file specs. Reports progress
  via `task-id` as specs are produced; pass nil for `task-id` to serialize without progress reporting
  (e.g. for a dry-run merge preview).

  Throws Exception if any entity in the stream is an Exception instance."
  [stream task-id]
  (let [opts (serdes/storage-base-context)
        stream-count (bounded-count 10000 stream)]
    (into []
          (map-indexed (fn [idx entity]
                         (when (instance? Exception entity)
                           (throw entity))
                         (let [spec (entity->file-spec opts entity)]
                           (when task-id
                             (remote-sync.task/update-progress!
                              task-id (-> (inc idx) (/ stream-count) (* 0.65) (+ 0.3))))
                           spec)))
          stream)))

(defn store!
  "Stores serialized entities from a stream to a remote source and commits the changes.

  Takes a stream (a sequence of serialized entities to be stored), a snapshot (the remote source
  implementing the SourceSnapshot protocol where files will be written), a task-id (the RemoteSyncTask
  identifier used to track progress updates), and a message (the commit message to use when writing
  files to the source).

  Returns `{:version <written-version> :entries [{:model_type :entity_id :path} ...]}`."
  [stream snapshot task-id message]
  (let [opts         (serdes/storage-base-context)
        stream-count (bounded-count 10000 stream)
        entries      (volatile! [])
        version      (->> stream
                          (map-indexed (fn [idx entity]
                                         (let [spec (entity->file-spec opts entity)]
                                           (vswap! entries conj {:model_type (-> entity :serdes/meta last :model)
                                                                 :entity_id  (:entity_id entity)
                                                                 :path       (:path spec)})
                                           (remote-sync.task/update-progress!
                                            task-id (-> (min (inc idx) stream-count) (/ stream-count) (* 0.65) (+ 0.3)))
                                           spec)))
                          (source.p/write-files! snapshot message))]
    {:version version :entries @entries}))

(defn- snapshot->specs
  "Reads a snapshot's managed-directory files into a sequence of `{:path :content}` specs, matching the
  shape produced by [[serialize-specs]]. Used to read the merge base and remote-tip trees for merging."
  [snapshot]
  (into []
        (keep (fn [path]
                (when (contains? serialization/legal-top-level-paths
                                 (when-let [idx (str/index-of path "/")]
                                   (subs path 0 idx)))
                  (when-let [content (source.p/read-file snapshot path)]
                    {:path path :content content}))))
        (source.p/list-files snapshot)))

(defn compute-merge
  "Runs the entity-identity 3-way merge of local state against the remote tip, without writing. Returns
  the raw merge result `{:merged :conflicts :summary}` from [[remote-sync.merge/three-way-merge]], plus
  `:force-push-casualties` (remote content a force push would discard; see
  [[remote-sync.merge/force-push-casualties]]):
  - `base-snapshot` - the last successfully synced state (the merge base)
  - `stream`        - the local state to serialize (ours)
  - `snapshot`      - the current remote tip (theirs)

  `:merged` is the full reconciled set of `{:path :content}` specs. The export path writes it to the
  remote; the local-only pull merge loads it into the app DB via [[specs->snapshot]]."
  [stream snapshot base-snapshot task-id]
  (let [ours   (serialize-specs stream task-id)
        base   (snapshot->specs base-snapshot)
        theirs (snapshot->specs snapshot)]
    (assoc (remote-sync.merge/three-way-merge base ours theirs)
           :force-push-casualties (remote-sync.merge/force-push-casualties base ours theirs))))

(defn specs->snapshot
  "Builds an in-memory read-only SourceSnapshot backed by `specs` (a seq of `{:path :content}`), so merged
  content can be loaded into the app DB without writing it to git. `write-files!` is unsupported."
  [specs]
  (let [by-path (into {} (map (juxt :path :content)) specs)]
    (reify source.p/SourceSnapshot
      (list-files [_] (vec (keys by-path)))
      (read-file [_ path] (get by-path path))
      (write-files! [_ _ _] (throw (ex-info "in-memory merge snapshot is read-only" {})))
      (apply-changes! [_ _ _ _] (throw (ex-info "in-memory merge snapshot is read-only" {})))
      (version [_] nil))))

(defn preview-merge
  "Dry-run of [[merge-and-store!]]: computes the 3-way merge without writing anything. Returns
  `{:clean? bool :conflicts [labels] :summary {:added :updated :removed}
    :force-push-casualties {:deleted [labels] :overwritten [labels]}}`. The casualties are the remote
  content a force push (rather than a merge) would discard. Pass nil for `task-id` to skip progress
  reporting."
  [stream snapshot base-snapshot task-id]
  (let [{:keys [conflicts summary force-push-casualties]}
        (compute-merge stream snapshot base-snapshot task-id)]
    {:clean?                 (empty? conflicts)
     :conflicts             (mapv remote-sync.merge/conflict-label conflicts)
     :summary               summary
     :force-push-casualties force-push-casualties}))

(defn force-push-casualties-no-base
  "Casualties of a force push when there is no merge base — the remote history was rewritten
  (force-pushed/rebased upstream), so the prior sync point is gone. Without a base we can't tell what
  changed since divergence, so every remote entity that isn't identical to what we'd write counts: remote
  content is foreign and gets discarded wholesale. Returns `{:deleted [labels] :overwritten [labels]}`
  (see [[remote-sync.merge/force-push-casualties]]). `stream` is the local state to serialize (ours),
  `snapshot` the rewritten remote tip (theirs)."
  [stream snapshot]
  (remote-sync.merge/force-push-casualties [] (serialize-specs stream nil) (snapshot->specs snapshot)))

(defn merge-and-store!
  "Like [[store!]], but reconciles the freshly serialized local state against a remote branch that has
  advanced beyond the last sync. Performs an entity-identity 3-way merge of:
  - the merge base (`base-snapshot`, the last successfully synced state),
  - the local state (serialized from `stream`),
  - the current remote tip (`snapshot`).

  On a clean merge, writes the merged file set (which fast-forwards onto the remote tip) and returns
  `{:status :success :version <sha> :summary {:added :updated :removed}}`. When the same entity changed
  on both sides, returns `{:status :conflict :conflicts [..] :summary {..}}` without writing anything."
  [stream snapshot base-snapshot task-id message]
  (let [{:keys [merged conflicts summary]} (compute-merge stream snapshot base-snapshot task-id)]
    (if (seq conflicts)
      {:status :conflict :conflicts conflicts :summary summary}
      {:status  :success
       :version (source.p/write-files! snapshot message merged)
       :summary summary})))

(defn source-from-settings
  "Creates a git source from the current remote sync settings.

  Takes an optional branch name to use. If not provided, uses the configured remote-sync-branch setting.

  Returns a GitSource instance configured with the remote-sync-url, branch, and remote-sync-token from settings."
  ([branch]
   (git/git-source
    (setting/get :remote-sync-url)
    (or branch (setting/get :remote-sync-branch))
    (setting/get :remote-sync-token)
    serialization/legal-top-level-paths))
  ([]
   (source-from-settings (setting/get :remote-sync-branch))))
