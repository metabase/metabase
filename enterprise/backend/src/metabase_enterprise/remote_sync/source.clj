(ns metabase-enterprise.remote-sync.source
  (:require
   [clojure.string :as str]
   [metabase-enterprise.remote-sync.source.git :as git]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase.models.serialization :as serdes]
   [metabase.settings.core :as setting]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml])
  (:import
   (java.io File)
   (metabase_enterprise.remote_sync.source.git GitSource)))

(set! *warn-on-reflection* true)

(defn- ingest-content
  [file-content]
  (serialization/read-timestamps (yaml/parse-string file-content {:key-fn serialization/parse-key})))

(defn- ingest-all
  [source]
  (into {} (for [path (source.p/list-files source)
                 :when (and (not (str/starts-with? path "."))
                            (str/ends-with? path ".yaml"))
                    ;; TODO legal-top-level check? / maybe not necessary for library?
                 :let [content (try
                                 (source.p/read-file source path)
                                 (catch Exception e
                                   (log/error e "Error reading file" path)))
                       loaded (try
                                (when content
                                  (serdes/path (ingest-content content)))
                                (catch Exception e
                                  (log/error e "Error reading file" path)))]
                 :when loaded]
             [(serialization/strip-labels loaded) [loaded content]])))

;; Wraps a source object providing the ingestable interface for serdes
(defrecord IngestableSource [source cache]
  serialization/Ingestable
  (ingest-list [_]
    (keys (or @cache (reset! cache (ingest-all source)))))

  (ingest-one [_ serdes-path]
    (when-not @cache
      (reset! cache (ingest-all source)))
    (if-let [target (get @cache (serialization/strip-labels serdes-path))]
      (try
        (ingest-content (second target))
        (catch Exception e
          (throw (ex-info "Unable to ingest file" {:abs-path serdes-path} e))))
      (throw (ex-info "Cannot find file" {:abs-path serdes-path})))))

(defmethod source.p/->ingestable :default
  [source]
  (->IngestableSource source (atom nil)))

(defmethod source.p/->ingestable GitSource
  [{:keys [git url branch token] :as source}]
  (git/fetch! source)
  (when-let [commit-ref (git/->commit-id source branch)]
    (->IngestableSource (git/->GitSource git url commit-ref token) (atom nil))))

(defn- remote-sync-path
  [opts entity]
  (let [base-path (serdes/storage-path entity opts)
        dirnames (drop-last base-path)
        basename (str (last base-path) ".yaml")]
    (str/join File/separator (map serialization/escape-segment (concat dirnames [basename])))))

(defn- ->file-spec
  "Converts entity from serdes stream into file spec for source write-files! "
  [opts entity]
  (when (instance? Exception entity)
    ;; Just short-circuit if there are errors.
    (throw entity))
  {:path (remote-sync-path opts entity)
   :content (yaml/generate-string entity {:dumper-options {:flow-style :block :split-lines false}})})

(defn store!
  "Store files from `stream` to `source` on `branch`. Commits with `message`."
  [stream source message]
  (let [opts (serdes/storage-base-context)]
    (source.p/write-files! source message (map #(->file-spec opts %) stream))))

(defn source-from-settings
  "Returns a source based on the current settings, optionally passing an alternate branch"
  ([branch]
   (git/git-source
    (setting/get :remote-sync-url)
    (or branch (setting/get :remote-sync-branch))
    (setting/get :remote-sync-token)))
  ([]
   (source-from-settings (setting/get :remote-sync-branch))))
