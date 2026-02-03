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

  (version [_]
    (source.p/version original-snapshot)))

(methodical/defmethod source.p/->ingestable :default
  [snapshot {:keys [path-filters root-dependencies]}]
  (cond->> (ingestable/->IngestableSnapshot (cond-> snapshot
                                              (seq path-filters) (->WrappingSnapshot path-filters))
                                            (atom nil))
    (seq root-dependencies) (ingestable/wrap-root-dep-ingestable root-dependencies)))

(defn- remote-sync-path
  [opts entity]
  (let [base-path (serdes/storage-path entity opts)
        dirnames (drop-last base-path)
        basename (str (last base-path) ".yaml")]
    (str/join File/separator (map serialization/escape-segment (concat dirnames [basename])))))

(defn- ->file-spec
  "Converts entity from serdes stream into file spec for source write-files! "
  [task-id count opts idx entity]
  (when (instance? Exception entity)
    ;; Just short-circuit if there are errors.
    (throw entity))
  (u/prog1 (if (string? entity)
             ;; when an entity is a string that means it's a path to delete
             {:path entity
              :remove? true}
             {:path (remote-sync-path opts entity)
              :content (yaml/generate-string (serialization/serialization-deep-sort entity)
                                             {:dumper-options {:flow-style :block :split-lines false}})})
    (remote-sync.task/update-progress! task-id (-> (inc idx) (/ count) (* 0.65) (+ 0.3)))))

(defn store!
  "Stores serialized entities from a stream to a remote source and commits the changes.

  Takes a stream (a sequence of serialized entities to be stored), a list of prefixes to recursively-delete at,
  a snapshot (the remote source implementing the SourceSnapshot protocol where files will be written), a task-id
  (the RemoteSyncTask identifier used to track progress updates), and a message (the commit message to use when
  writing files to the source).

  Returns the version written to the source.

  Throws Exception if any entity in the stream is an Exception instance."
  [stream delete-prefixes snapshot task-id message]
  (let [opts (serdes/storage-base-context)
        ;; Bound the count of the items in the stream we don't accidentally realize the entire list into memory
        stream-count (bounded-count 10000 stream)]
    (->> (concat stream delete-prefixes)
         (map-indexed #(->file-spec task-id stream-count opts %1 %2))
         (source.p/write-files! snapshot message))))

(defn source-from-settings
  "Creates a git source from the current remote sync settings.

  Takes an optional branch name to use. If not provided, uses the configured remote-sync-branch setting.

  Returns a GitSource instance configured with the remote-sync-url, branch, and remote-sync-token from settings."
  ([branch]
   (git/git-source
    (setting/get :remote-sync-url)
    (or branch (setting/get :remote-sync-branch))
    (setting/get :remote-sync-token)))
  ([]
   (source-from-settings (setting/get :remote-sync-branch))))
