(ns metabase-enterprise.remote-sync.source.ingestable
  (:require
   [clojure.string :as str]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase.app-db.core :as app-db]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(defn- ingest-content
  [file-content]
  (serialization/read-timestamps (yaml/parse-string file-content {:key-fn serialization/parse-key})))

(defn- ingest-all
  [source]
  (into {} (for [path (source.p/list-files source)
                 :when (and (not (str/starts-with? path "."))
                            (str/ends-with? path ".yaml"))
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

;; Wraps another Ingestable calling a callback when a file is ingested
(defrecord CallbackIngestable [ingestable callback]
  serialization/Ingestable
  (ingest-list [_]
    (serialization/ingest-list ingestable))

  (ingest-one [_ serdes-path]
    (u/prog1 (serialization/ingest-one ingestable serdes-path)
      (callback serdes-path))))

(defn wrap-progress-ingestable
  "Updates a RemoteSyncTask model with a progress indcator.

  Arguments:
    task-id: the integer id of the RemoteSyncTask model to update
    normalize: make the progress ratio of out this number
    ingestable:  And Ingestable to wrap

  Returns:
    an Ingestable object that will use the callback"
  [task-id normalize ingestable]
  (let [total (count (serialization/ingest-list ingestable))
        calls (atom 0)]
    (letfn [(progress-callback [_]
              (let [current-calls (swap! calls inc)]
                (t2/with-connection [_conn (app-db/app-db)]
                  (remote-sync.task/update-progress! task-id (* (/ current-calls total) normalize)))))]
      (->CallbackIngestable ingestable progress-callback))))

;; Wraps another Ingestable and filters the `list-files` content to only content that has the specified
;; root-depedencies
(defrecord RootDependencyIngestable [ingestable root-dependencies dep-cache]
  serialization/Ingestable
  (ingest-list [_]
    (filter (fn [item]
              (some
               #(contains? (u/traverse [item]
                                       (fn [dep]
                                         (try
                                           (zipmap (or (get @dep-cache dep)
                                                       (get (swap! dep-cache assoc dep
                                                                   (serdes/dependencies
                                                                    (serialization/ingest-one ingestable dep)))
                                                            dep))
                                                   (repeat dep))
                                           (catch Exception _
                                             nil))))
                           %)
               root-dependencies))
            (serialization/ingest-list ingestable)))
  (ingest-one [_ serdes-path]
    (serialization/ingest-one ingestable serdes-path)))

(defn wrap-root-dep-ingestable
  "Wraps an ingestable in a function that filters the result of ingest list to only items in the Ingestable
  that have one of the root-dependencies passed to it.

  Arguments:
    root-dependencies: sequence of serdes dependencies in the format [{:model MODEL_NAME :id ENTITY_ID}]
    ingestable: source ingestable object

  Returns:
    and ingestable that filters out the items it lists to just to those sharing the dependencies  "
  [root-dependencies ingestable]
  (->RootDependencyIngestable ingestable root-dependencies (atom {})))

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

(defn ingestable-version
  "Returns the version of the given ingestable source."
  [ingestable]
  (let [ingestable (or (:ingestable ingestable) ingestable)]
    (source.p/version (:source ingestable))))
