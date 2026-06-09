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

(defn entity->file-spec
  "Serializes a single extracted entity into a `{:path :content}` file spec, using storage context
  `opts` (from `serdes/storage-base-context`).

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

  Returns `{:version <written-version> :entries [{:model_type :entity_id :path} ...]}`.

  Throws Exception if any entity in the stream is an Exception instance."
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
