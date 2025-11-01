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
   [toucan2.core :as t2])
  (:import (metabase_enterprise.remote_sync.source.protocol SourceSnapshot)))

(defn- ingest-content
  [file-content]
  (serialization/read-timestamps (yaml/parse-string file-content {:key-fn serialization/parse-key})))

(defn- ingest-all
  [snapshot]
  (into {} (for [path (source.p/list-files snapshot)
                 :when (and (not (str/starts-with? path "."))
                            (str/ends-with? path ".yaml"))
                 :let [content (try
                                 (source.p/read-file snapshot path)
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
      (callback <> serdes-path))))

(defn wrap-progress-ingestable
  "Wraps an Ingestable to track and update progress during ingestion.

  Takes a task-id (the integer ID of the RemoteSyncTask model to update with progress), a normalize value (the
  maximum progress ratio value, with progress calculated as a fraction of this number), and an ingestable (an
  Ingestable object to wrap with progress tracking).

  Returns a CallbackIngestable instance that updates task progress as items are ingested."
  [task-id normalize ingestable]
  (let [total (count (serialization/ingest-list ingestable))
        calls (atom 0)]
    (letfn [(progress-callback [item _]
              (when item
                (let [current-calls (swap! calls inc)]
                  (t2/with-connection [_conn (app-db/app-db)]
                    (remote-sync.task/update-progress! task-id (* (/ current-calls total) normalize))))))]
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
  "Wraps an Ingestable to filter items by root dependencies.

  Takes root-dependencies (a sequence of serdes dependency maps in the format [{:model MODEL_NAME :id ENTITY_ID}])
  and an ingestable (the source Ingestable object to wrap).

  Returns a RootDependencyIngestable instance that filters ingest-list results to only include items sharing one of
  the specified root dependencies."
  [root-dependencies ingestable]
  (->RootDependencyIngestable ingestable root-dependencies (atom {})))

;; Wraps a snapshot object providing the ingestable interface for serdes
(defrecord IngestableSnapshot [^SourceSnapshot snapshot cache]
  serialization/Ingestable
  (ingest-list [_]
    (keys (or @cache (reset! cache (ingest-all snapshot)))))

  (ingest-one [_ serdes-path]
    (when-not @cache
      (reset! cache (ingest-all snapshot)))
    (when-let [target (get @cache (serialization/strip-labels serdes-path))]
      (try
        (ingest-content (second target))
        (catch Exception e
          (throw (ex-info "Unable to ingest file" {:abs-path serdes-path} e)))))))
