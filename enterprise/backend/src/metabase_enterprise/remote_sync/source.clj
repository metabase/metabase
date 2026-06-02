(ns metabase-enterprise.remote-sync.source
  (:require
   [clojure.string :as str]
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

  (apply-changes! [_ message upserts delete-paths]
    (let [path-allowed? (fn [path] (some (fn [path-filter] (re-matches path-filter path)) path-filters))]
      (source.p/apply-changes! original-snapshot message
                               (filter (comp path-allowed? :path) upserts)
                               (filter path-allowed? delete-paths))))

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
  "Converts entity from serdes stream into file spec for source write-files!.

  When `path-atom` is provided, records `{:model_type :entity_id :path}` for the entity so callers
  can persist each exported entity's path. The path is computed once here and reused — calling
  `remote-sync-path` twice on the same entity would advance the storage context's unique-name
  generator and yield a different (wrong) path."
  [task-id count opts idx path-atom entity]
  (when (instance? Exception entity)
    (throw entity))
  (let [path (remote-sync-path opts entity)]
    (when path-atom
      (swap! path-atom conj {:model_type (-> entity :serdes/meta last :model)
                             :entity_id  (:entity_id entity)
                             :path       path}))
    (u/prog1 {:path path
              :content (yaml/generate-string (serialization/serialization-deep-sort entity)
                                             {:dumper-options {:flow-style :block :split-lines false}})}
      (remote-sync.task/update-progress! task-id (-> (inc idx) (/ count) (* 0.65) (+ 0.3))))))

(defn entity->file-spec
  "Serializes a single extracted entity into a `{:path :content}` file spec.

  Takes a storage context `opts` (from `serdes/storage-base-context`) and an extracted entity.
  Used by the incremental export fast-path, which serializes only changed entities.

  Throws if `entity` is an Exception instance."
  [opts entity]
  (when (instance? Exception entity)
    (throw entity))
  {:path    (remote-sync-path opts entity)
   :content (yaml/generate-string (serialization/serialization-deep-sort entity)
                                  {:dumper-options {:flow-style :block :split-lines false}})})

(defn store!
  "Stores serialized entities from a stream to a remote source and commits the changes.

  Takes a stream (a sequence of serialized entities to be stored), a snapshot (the remote source
  implementing the SourceSnapshot protocol where files will be written), a task-id (the RemoteSyncTask
  identifier used to track progress updates), and a message (the commit message to use when writing
  files to the source).

  When `path-atom` is provided, each exported entity's `{:model_type :entity_id :path}` is conj'd
  onto it (so the caller can persist `file_path` on the RemoteSyncObject rows).

  Returns the version written to the source.

  Throws Exception if any entity in the stream is an Exception instance."
  ([stream snapshot task-id message]
   (store! stream snapshot task-id message nil))
  ([stream snapshot task-id message path-atom]
   (let [opts (serdes/storage-base-context)
         stream-count (bounded-count 10000 stream)]
     (->> stream
          (map-indexed #(->file-spec task-id stream-count opts %1 path-atom %2))
          (source.p/write-files! snapshot message)))))

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
