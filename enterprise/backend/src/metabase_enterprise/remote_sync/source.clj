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
   [metabase.util :as u]
   [metabase.util.yaml :as yaml]
   [methodical.core :as methodical])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

;; Wrapping snapshot accepts a list of path regexes to apply to paths in the source returning
;; nil when they do not match
(defrecord WrappingSnapshot [original-snapshot path-filters]
  source.p/SourceSnapshot

  (list-files [_]
    (filter (fn [file-path]
              (some (fn [path-filter] (re-matches path-filter file-path)) path-filters))
            (source.p/list-files original-snapshot)))

  (read-file [_ path]
    (when (some (fn [path-filter] (re-matches path-filter path)) path-filters)
      (source.p/read-file original-snapshot path)))

  (write-files! [_ message files]
    (source.p/write-files! original-snapshot message
                           (filter (fn [file-spec]
                                     (some (fn [path-filter] (re-matches path-filter (:path file-spec))) path-filters))
                                   files)))

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

(defn- ->file-spec
  "Converts entity from serdes stream into file spec for source write-files!"
  [task-id count opts idx entity]
  (when (instance? Exception entity)
    (throw entity))
  (u/prog1 {:path (remote-sync-path opts entity)
            :content (yaml/generate-string (serialization/serialization-deep-sort entity)
                                           {:dumper-options {:flow-style :block :split-lines false}})}
    (remote-sync.task/update-progress! task-id (-> (inc idx) (/ count) (* 0.65) (+ 0.3)))))

(defn serialize-specs
  "Serializes a stream of entities into an eager vector of `{:path :content}` file specs — the exact specs
  [[store!]] would write. Reports progress via `task-id` as specs are produced.

  Throws Exception if any entity in the stream is an Exception instance."
  [stream task-id]
  (let [opts (serdes/storage-base-context)
        stream-count (bounded-count 10000 stream)]
    (into [] (map-indexed #(->file-spec task-id stream-count opts %1 %2)) stream)))

(defn store!
  "Stores serialized entities from a stream to a remote source and commits the changes.

  Takes a stream (a sequence of serialized entities to be stored), a snapshot (the remote source
  implementing the SourceSnapshot protocol where files will be written), a task-id (the RemoteSyncTask
  identifier used to track progress updates), and a message (the commit message to use when writing
  files to the source).

  Returns the version written to the source.

  Throws Exception if any entity in the stream is an Exception instance."
  [stream snapshot task-id message]
  (source.p/write-files! snapshot message (serialize-specs stream task-id)))

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
  (let [ours   (serialize-specs stream task-id)
        base   (snapshot->specs base-snapshot)
        theirs (snapshot->specs snapshot)
        {:keys [merged conflicts summary]} (remote-sync.merge/three-way-merge base ours theirs)]
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
