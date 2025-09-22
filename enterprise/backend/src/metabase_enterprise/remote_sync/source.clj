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
   (org.eclipse.jgit.api.errors GitAPIException InvalidRemoteException TransportException)))

(set! *warn-on-reflection* true)

(defn- ingest-content
  [file-content]
  (serialization/read-timestamps (yaml/parse-string file-content {:key-fn serialization/parse-key})))

(defn- ingest-all
  [source branch]
  (into {} (for [path (source.p/list-files source branch)
                 :when (and (not (str/starts-with? path "."))
                            (str/ends-with? path ".yaml"))
                    ;; TODO legal-top-level check? / maybe not necessary for library?
                 :let [content (try
                                 (source.p/read-file source branch path)
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
(defrecord IngestableSource [source branch cache]
  serialization/Ingestable
  (ingest-list [_]
    (keys (or @cache (reset! cache (ingest-all source branch)))))

  (ingest-one [_ abs-path]
    (when-not @cache
      (reset! cache (ingest-all source branch)))
    (if-let [target (get @cache (serialization/strip-labels abs-path))]
      (try
        (ingest-content (second target))
        (catch Exception e
          (throw (ex-info "Unable to ingest file" {:abs-path abs-path} e))))
      (throw (ex-info "Cannot find file" {:abs-path abs-path})))))

(defn ingestable-source
  [source branch]
  (->IngestableSource source branch (atom nil)))

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
  [stream source branch message]
  (let [opts (serdes/storage-base-context)]
    (source.p/write-files! source branch message (map #(->file-spec opts %) stream))))

(defn source-from-settings
  "Returns a source based on the current settings"
  []
  (git/git-source (setting/get :remote-sync-url)
                  (setting/get :remote-sync-token)))

(defn can-access-branch-in-source?
  "Return true if we can access the given branch in the remote git repository, false otherwise."
  [source branch]
  (try
    (boolean (get (set (source.p/branches source)) branch))

    (catch InvalidRemoteException _ false)
    (catch TransportException _ false)
    (catch GitAPIException _ false)))
