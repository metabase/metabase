(ns metabase-enterprise.remote-sync.source.ingestable
  (:require
   [clojure.string :as str]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.serialization.core :as ee.serialization]
   [metabase.serialization.core :as serialization]
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
  (-> (yaml/parse-string file-content {:key-fn ee.serialization/parse-key})
      ee.serialization/read-timestamps
      serialization/restore-identity))

(defn- ingest-all
  "Returns {:entities {key {:content <yaml-string> :path <repo-path>}}, :errors [Exception...]}, each key the
  `[model ref]` of an entity.
  The repo `:path` is the actual file the entity was read from (including any dedup suffix), so callers
  can record where each entity lives without recomputing — recomputation would diverge on name
  collisions and slug changes. Dotfiles are silently skipped (editor temp files, see #41567).
  Non-dotfile YAML parse/read failures are collected in :errors."
  [snapshot]
  (let [errors (atom [])]
    {:entities (into {} (for [path (source.p/list-files snapshot)
                              :when (ee.serialization/entity-file-path? path)
                              :let [content (try
                                              (source.p/read-file snapshot path)
                                              (catch Exception e
                                                (log/warn (u/strip-error e "Error reading file during ingestion"))
                                                (swap! errors conj (ex-info (format "Failed to read file: %s" path)
                                                                            {:file path :reason (error-reason e)} e))
                                                nil))
                                    loaded (try
                                             (when content
                                               (serialization/key-of (ingest-content content)))
                                             (catch Exception e
                                               (log/warn (u/strip-error e "Error parsing file during ingestion"))
                                               (swap! errors conj (ex-info (format "Failed to parse file: %s" path)
                                                                           {:file path :reason (error-reason e)} e))
                                               nil))]
                              :when loaded]
                          [loaded {:content content :path path}]))
     :errors @errors}))

;; Wraps another Ingestable calling a callback when a file is ingested
(defrecord CallbackIngestable [ingestable callback]
  ee.serialization/Ingestable
  (ingest-list [_]
    (ee.serialization/ingest-list ingestable))

  (ingest-many [_ ks]
    (u/prog1 (ee.serialization/ingest-many ingestable ks)
      (callback <> ks)))

  (ingest-errors [_]
    (ee.serialization/ingest-errors ingestable)))

(defn wrap-progress-ingestable
  "Wraps `ingestable` so that the n-th entity read reports the fraction `lo` + n/2N * (`hi` - `lo`) through `report`, a
  fn of a fraction such as one from `make-progress-reporter`, where N is the number of its entities: a load reads each
  entity twice, once to order the load and once to load it.

  A failed report is logged and ignored so it can never abort the load it tracks; a cancellation raised by the
  report (see `update-progress!`) propagates and stops the load."
  [report [lo hi] ingestable]
  (let [total (max 1 (* 2 (count (ee.serialization/ingest-list ingestable))))
        calls (atom 0)]
    (letfn [(progress-callback [items _]
              (when-let [n (not-empty (filterv some? items))]
                (try
                  ;; counted down from hi so the last entity lands on hi exactly, not a rounding neighbour
                  (report (- hi (* (- hi lo) (/ (max 0 (- total (swap! calls + (count n)))) total))))
                  (catch Exception e
                    (if (:cancelled? (ex-data e))
                      (throw e)
                      (log/warn (u/strip-error e "Failed to report import progress; continuing")))))))]
      (->CallbackIngestable ingestable progress-callback))))

;; Wraps another Ingestable and filters the `list-files` content to only content that has the specified
;; root-depedencies
(defn- reaching
  "The keys of `ingestable` whose entities refer, directly or through others, to one of `root-dependencies`, or are
  one, reading the entities a batch at a time."
  [ingestable root-dependencies]
  (let [ks         (ee.serialization/ingest-list ingestable)
        dependents (transduce (comp (partition-all 100)
                                    (mapcat (fn [batch]
                                              (for [[model pairs] (group-by ffirst (filter second batch))
                                                    [[k] deps]    (map vector pairs
                                                                       (serialization/import-dependencies
                                                                        model (mapv second pairs)))
                                                    dep           deps]
                                                [dep k]))))
                              (completing (fn [acc [dep k]] (update acc dep (fnil conj []) k)))
                              {}
                              (ee.serialization/ingested ingestable ks))]
    (loop [reached (set root-dependencies) frontier (seq root-dependencies)]
      (if-let [[k & more] frontier]
        (let [new (remove reached (get dependents k))]
          (recur (into reached new) (seq (concat more new))))
        (filterv reached ks)))))

(defrecord RootDependencyIngestable [ingestable ks]
  ee.serialization/Ingestable
  (ingest-list [_]
    @ks)

  (ingest-many [_ ks]
    (ee.serialization/ingest-many ingestable ks))

  (ingest-errors [_]
    (ee.serialization/ingest-errors ingestable)))

(defn wrap-root-dep-ingestable
  "Wraps an Ingestable to filter items by root dependencies.

  Takes root-dependencies (a sequence of `[model ref]` keys)
  and an ingestable (the source Ingestable object to wrap).

  Returns a RootDependencyIngestable instance that filters ingest-list results to only include items sharing one of
  the specified root dependencies."
  [root-dependencies ingestable]
  (->RootDependencyIngestable ingestable (delay (reaching ingestable root-dependencies))))

(defn- populate-cache! [cache errors-atom ingest-fn]
  (when-not @cache
    (let [result (ingest-fn)]
      (reset! cache (:entities result))
      (reset! errors-atom (:errors result)))))

;; Wraps a snapshot object providing the ingestable interface for serdes
(defrecord IngestableSnapshot [^SourceSnapshot snapshot cache errors-atom]
  ee.serialization/Ingestable
  (ingest-list [_]
    (populate-cache! cache errors-atom #(ingest-all snapshot))
    (keys @cache))

  (ingest-many [_ ks]
    (populate-cache! cache errors-atom #(ingest-all snapshot))
    (mapv (fn [k]
            (when-let [{:keys [content ^String path]} (get @cache k)]
              (try
                (let [dir (subs path 0 (inc (or (str/last-index-of path "/") -1)))]
                  (ee.serialization/read-resources (ingest-content content)
                                                   #(source.p/read-file snapshot (str dir %))))
                (catch Exception e
                  (throw (ex-info "Unable to ingest file" {:key k} e))))))
          ks))

  (ingest-errors [_]
    (or @errors-atom [])))

(defn cached-file-paths
  "Given an `IngestableSnapshot` whose cache has been populated by a prior ingestion, returns a seq of
  {:model_type :entity_id :path} — the actual repo file each entity was read from. Lets the importer
  record `file_path` so later renames and deletes resolve the real file."
  [{:keys [cache]}]
  (for [[[model id] {:keys [path]}] @cache
        :when (and model (string? id) path)]
    {:model_type (name model) :entity_id id :path path}))
