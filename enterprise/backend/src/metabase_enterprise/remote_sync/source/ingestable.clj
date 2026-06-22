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
  (:import
   (metabase_enterprise.remote_sync.source.protocol SourceSnapshot)
   (org.yaml.snakeyaml.error MarkedYAMLException)))

(set! *warn-on-reflection* true)

(defn- error-reason
  "A concise, single-line reason for an ingestion failure, suitable for display and machine-readable
  storage. For YAML errors, SnakeYAML's first message line is a generic context (e.g. \"while scanning
  for the next token\"); the useful diagnostic is the problem plus its mark, so those are extracted.
  Otherwise falls back to the first line of the message."
  [e]
  (if (instance? MarkedYAMLException e)
    (let [^MarkedYAMLException e e
          mark (.getProblemMark e)]
      (cond-> (.getProblem e)
        ;; marks are 0-based; report them 1-based to match editors
        mark (str (format " (line %d, column %d)" (inc (.getLine mark)) (inc (.getColumn mark))))))
    (some-> (ex-message e) str/split-lines first str/trim)))

(defn- ingest-content
  [file-content]
  (serialization/read-timestamps (yaml/parse-string file-content {:key-fn serialization/parse-key})))

(defn- ingest-all
  "Returns {:entities {stripped-hierarchy {:content <yaml-string> :path <repo-path>}}, :errors [Exception...]}.
  The repo `:path` is the actual file the entity was read from (including any dedup suffix), so callers
  can record where each entity lives without recomputing — recomputation would diverge on name
  collisions and slug changes. Dotfiles are silently skipped (editor temp files, see #41567).
  Non-dotfile YAML parse/read failures are collected in :errors."
  [snapshot]
  (let [errors (atom [])]
    {:entities (into {} (for [path (source.p/list-files snapshot)
                              :when (and (not (str/starts-with? path "."))
                                         (str/ends-with? path ".yaml"))
                              :let [content (try
                                              (source.p/read-file snapshot path)
                                              (catch Exception e
                                                (log/warn (u/strip-error e "Error reading file during ingestion"))
                                                (swap! errors conj (ex-info (format "Failed to read file: %s" path)
                                                                            {:file path :reason (error-reason e)} e))
                                                nil))
                                    loaded (try
                                             (when content
                                               (serdes/path (ingest-content content)))
                                             (catch Exception e
                                               (log/warn (u/strip-error e "Error parsing file during ingestion"))
                                               (swap! errors conj (ex-info (format "Failed to parse file: %s" path)
                                                                           {:file path :reason (error-reason e)} e))
                                               nil))]
                              :when loaded]
                          [(serialization/strip-labels loaded) {:content content :path path}]))
     :errors @errors}))

;; Wraps another Ingestable calling a callback when a file is ingested
(defrecord CallbackIngestable [ingestable callback]
  serialization/Ingestable
  (ingest-list [_]
    (serialization/ingest-list ingestable))

  (ingest-one [_ serdes-path]
    (u/prog1 (serialization/ingest-one ingestable serdes-path)
      (callback <> serdes-path)))

  (ingest-errors [_]
    (serialization/ingest-errors ingestable)))

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
                  ;; Progress reporting must never abort the ingestion it tracks. The update runs on a
                  ;; separate connection, which on some app DBs can contend with the in-flight load (e.g.
                  ;; a MySQL lock-wait timeout), so swallow DB failures and keep going — but still honor a
                  ;; cancellation signal, which `update-progress!` raises to stop the task.
                  (try
                    (t2/with-connection [_conn (app-db/app-db)]
                      (remote-sync.task/update-progress! task-id (* (/ current-calls total) normalize)))
                    (catch Exception e
                      (if (:cancelled? (ex-data e))
                        (throw e)
                        (log/warn (u/strip-error e "Failed to report import progress; continuing"))))))))]
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
    (serialization/ingest-one ingestable serdes-path))

  (ingest-errors [_]
    (serialization/ingest-errors ingestable)))

(defn wrap-root-dep-ingestable
  "Wraps an Ingestable to filter items by root dependencies.

  Takes root-dependencies (a sequence of serdes dependency maps in the format [{:model MODEL_NAME :id ENTITY_ID}])
  and an ingestable (the source Ingestable object to wrap).

  Returns a RootDependencyIngestable instance that filters ingest-list results to only include items sharing one of
  the specified root dependencies."
  [root-dependencies ingestable]
  (->RootDependencyIngestable ingestable root-dependencies (atom {})))

(defn- populate-cache! [cache errors-atom ingest-fn]
  (when-not @cache
    (let [result (ingest-fn)]
      (reset! cache (:entities result))
      (reset! errors-atom (:errors result)))))

;; Wraps a snapshot object providing the ingestable interface for serdes
(defrecord IngestableSnapshot [^SourceSnapshot snapshot cache errors-atom]
  serialization/Ingestable
  (ingest-list [_]
    (populate-cache! cache errors-atom #(ingest-all snapshot))
    (keys @cache))

  (ingest-one [_ serdes-path]
    (populate-cache! cache errors-atom #(ingest-all snapshot))
    (when-let [target (get @cache (serialization/strip-labels serdes-path))]
      (try
        (ingest-content (:content target))
        (catch Exception e
          (throw (ex-info "Unable to ingest file" {:abs-path serdes-path} e))))))

  (ingest-errors [_]
    (or @errors-atom [])))

(defn cached-file-paths
  "Given an `IngestableSnapshot` whose cache has been populated by a prior ingestion, returns a seq of
  {:model_type :entity_id :path} — the actual repo file each entity was read from. Lets the importer
  record `file_path` so later renames and deletes resolve the real file."
  [{:keys [cache]}]
  (for [[hierarchy {:keys [path]}] @cache
        :let [{:keys [model id]} (last hierarchy)]
        :when (and model id path)]
    {:model_type model :entity_id id :path path}))
