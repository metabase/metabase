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
   (java.io File)
   (metabase_enterprise.remote_sync.source.git GitSource)))

(set! *warn-on-reflection* true)

;; Wrapping source accepts a list of path regexes to apply to paths in the source returning
;; nil when they do no match
(defrecord WrappingSource [original-source path-filters]
  source.p/LibrarySource
  (create-branch [_ branch base]
    (source.p/create-branch original-source branch base))

  (branches [_]
    (source.p/branches original-source))

  (list-files [_]
    (filter (fn [file-path]
              (some (fn [path-filter] (re-matches path-filter file-path)) path-filters))
            (source.p/list-files original-source)))

  (read-file [_ path]
    (when (some (fn [path-filter] (re-matches path-filter path)) path-filters)
      (source.p/read-file original-source path)))

  (write-files! [_ message files]
    (source.p/write-files! original-source message
                           (filter (fn [file-spec]
                                     (some (fn [path-filter] (re-matches path-filter (:path file-spec))) path-filters))
                                   files))))

(methodical/defmethod source.p/->ingestable :default
  [source {:keys [path-filters root-dependencies task-id]}]
  (cond->> (ingestable/->IngestableSource (cond-> source
                                            (seq path-filters) (->WrappingSource path-filters))
                                          (atom nil))
    (seq root-dependencies) (ingestable/wrap-root-dep-ingestable root-dependencies)
    task-id (ingestable/wrap-progress-ingestable task-id 0.7)))

(methodical/defmethod source.p/->ingestable GitSource
  [{:keys [url] :as source} opts]
  (git/fetch! source)
  (if-let [commit-ref (git/->commit-id source)]
    (next-method (assoc source :commit-ish commit-ref) opts)
    (throw (ex-info (str "Unable to find branch " (:commit-ish source) " to read from") {:url url
                                                                                         :branch (:commit-ish source)}))))
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
  (u/prog1 {:path (remote-sync-path opts entity)
            :content (yaml/generate-string entity {:dumper-options {:flow-style :block :split-lines false}})}
           (remote-sync.task/update-progress! task-id (-> (inc idx) (/ count) (* 0.65) (+ 0.3)))))

(defn store!
  "Store files from `stream` to `source` on `branch`. Commits with `message`."
  [stream source task-id message]
  (let [opts (serdes/storage-base-context)
        ;; Bound the count of the items in the stream we don't accidentally realize the entire list into memory
        stream-count (bounded-count 10000 stream)]
    (source.p/write-files! source message (map-indexed #(->file-spec task-id stream-count opts %1 %2) stream))))

(defn source-from-settings
  "Returns a source based on the current settings, optionally passing an alternate branch"
  ([branch]
   (git/git-source
    (setting/get :remote-sync-url)
    (or branch (setting/get :remote-sync-branch))
    (setting/get :remote-sync-token)))
  ([]
   (source-from-settings (setting/get :remote-sync-branch))))
