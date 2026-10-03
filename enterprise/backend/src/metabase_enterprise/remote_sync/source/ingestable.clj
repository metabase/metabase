(ns metabase-enterprise.remote-sync.source.ingestable
  (:require
   [clojure.string :as str]
   [metabase-enterprise.data-apps.core :as data-apps]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml])
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

(defn check-data-app-files!
  "Throws, naming each file, when a data app entity file in `snapshot` (a manifest, or a file in an app's
  `resources/`) holds what a load can't take as the author meant it. Serialization trusts what it reads, so this is
  what keeps an app's resources to its own collection; it runs on the whole snapshot before any import, since an
  incremental import ingests only the changed files. A file that doesn't parse is left to ingestion to report."
  [snapshot]
  (let [files    (for [path (source.p/list-files snapshot)
                       :when (and (str/starts-with? path "data_apps/")
                                  (serialization/entity-file-path? path))
                       :let [entity (try
                                      (ingest-content (source.p/read-file snapshot path))
                                      (catch Exception _ nil))]
                       :when entity]
                   {:path path :entity entity})
        problems (data-apps/problems files)]
    (when (seq problems)
      (throw (ex-info (str/join " " (map (fn [{:keys [file message]}] (format "Invalid data app file %s: %s" file message))
                                         problems))
                      {:files (mapv :file problems)})))))

(defn- ingest-all
  "Returns {:entities {stripped-hierarchy {:content <yaml-string> :path <repo-path>}}, :errors [Exception...]}.
  The repo `:path` is the actual file the entity was read from (including any dedup suffix), so callers
  can record where each entity lives without recomputing — recomputation would diverge on name
  collisions and slug changes. Dotfiles are silently skipped (editor temp files, see #41567).
  Non-dotfile YAML parse/read failures are collected in :errors."
  [snapshot]
  (let [errors (atom [])]
    {:entities (into {} (for [path (source.p/list-files snapshot)
                              :when (serialization/entity-file-path? path)
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
  "Wraps `ingestable` so that ingesting the n-th of its N entities reports the fraction `lo` + n/N * (`hi` - `lo`)
  through `report`, a fn of a fraction such as one from `make-progress-reporter`.

  A failed report is logged and ignored so it can never abort the load it tracks; a cancellation raised by the
  report (see `update-progress!`) propagates and stops the load."
  [report [lo hi] ingestable]
  (let [total (max 1 (count (serialization/ingest-list ingestable)))
        calls (atom 0)]
    (letfn [(progress-callback [item _]
              (when item
                (try
                  ;; counted down from hi so the last entity lands on hi exactly, not a rounding neighbour
                  (report (- hi (* (- hi lo) (/ (- total (swap! calls inc)) total))))
                  (catch Exception e
                    (if (:cancelled? (ex-data e))
                      (throw e)
                      (log/warn (u/strip-error e "Failed to report import progress; continuing")))))))]
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
                                                                   (serdes/deserialization-dependencies
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
    (when-let [{:keys [content ^String path]} (get @cache (serialization/strip-labels serdes-path))]
      (try
        (let [dir (subs path 0 (inc (or (str/last-index-of path "/") -1)))]
          (serialization/read-resources (ingest-content content)
                                        #(source.p/read-file snapshot (str dir %))))
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
