(ns metabase-enterprise.serialization.metadata-file-import
  "Boot-time loader that streams a metadata file into the appdb, populating
  `:model/Database` (matched, never created), `:model/Table`, and `:model/Field`.

  Composes three building blocks:

    - [[metabase-enterprise.serialization.metadata-file-import.parsers]] streams
      batches of `[line-num row]` tuples from the file (JSON or YAML, dispatched
      by extension).
    - [[metabase-enterprise.serialization.metadata-file-import.processors]] provides
      the per-batch and per-depth SQL building blocks.
    - [[metabase-enterprise.serialization.metadata-file-import.schemas]] defines
      the per-row Malli schemas, shared with the parsers' callers.

  Strict-consistency invariants enforced by the pre-flight + depth-tagging
  steps mean the merge loop has no orphan-handling code paths. The whole
  merge is set-based SQL, one statement per phase per depth level.

  `with-staging-tables` clears the staging tables on entry and on exit
  (try/finally), so a crashed prior attempt cannot leak rows into the next
  run."
  (:require
   [clojure.string :as str]
   [environ.core :as env]
   [metabase-enterprise.serialization.metadata-file-import.parsers :as parsers]
   [metabase-enterprise.serialization.metadata-file-import.processors :as processors]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

;;; ============================== Env handling ==============================

(def ^:dynamic *env*
  "Environment map. Dynamic for test rebinding; defaults to `environ.core/env`."
  env/env)

(def ^:private table-metadata-path-key :mb-table-metadata-path)

(defn- env-path
  "Read `*env*` at `k`, treating blank strings as absent."
  [k]
  (let [v (get *env* k)]
    (when (and (string? v) (not (str/blank? v))) v)))

(defn- assert-file-readable!
  "Coerce `path` to a `File`. Throws if the file doesn't exist or can't be read."
  ^File [^String path]
  (let [f (File. path)]
    (when-not (.exists f)
      (throw (ex-info (format "Metadata file not found at path %s" (pr-str path))
                      {:kind :file_not_found, :path path})))
    (when-not (.canRead f)
      (throw (ex-info (format "Metadata file at path %s is not readable" (pr-str path))
                      {:kind :file_not_readable, :path path})))
    f))

;;; ============================== drain + database matching ==============================

(defn- process-databases-batch!
  "Per-batch handler for `:databases`. Updates `databases-by-source-id`
  with `source-id → name` for every row, conjs target-db-ids onto
  `matched-ids` for matches, and WARN-logs unmatched rows."
  [matched-ids databases-by-source-id batch]
  (reduce (fn [_ result]
            (vswap! databases-by-source-id assoc (:source-id result) (:name result))
            (case (:status result)
              :matched
              (vswap! matched-ids conj (:target-id result))

              :no-match
              (log/warnf "metadata-file-import: skipped source database %s (no matching target): %s"
                         (pr-str (:name result)) (:detail result)))
            nil)
          nil
          (processors/process-databases! batch)))

(defn- drain-and-match-databases!
  "Single-pass walk of the metadata file: match `:databases` against the live
  appdb, drain `:tables` and `:fields` into staging. Returns the set of
  matched target-db-ids."
  [^File file]
  (let [matched-ids            (volatile! #{})
        databases-by-source-id (volatile! {})]
    (parsers/stream-keyed-arrays!
     file processors/import-batch-size
     {:databases (partial process-databases-batch! matched-ids databases-by-source-id)
      :tables    (fn [batch] (processors/drain-tables-batch! @databases-by-source-id batch))
      :fields    processors/drain-fields-batch!})
    @matched-ids))

;;; ============================== Top-level orchestration ==============================

(defn- mark-databases-sync-complete!
  "Flip every matched target Database's `initial_sync_status` to `\"complete\"`
  so the UI surfaces tables immediately.

  Writes via raw `:metabase_database` to bypass `:model/Database`'s
  `:after-update` hook, which would schedule per-database Quartz sync
  triggers — undesirable here, since the whole point of metadata-file-import
  is to skip warehouse sync. App startup re-registers triggers."
  [matched-target-db-ids]
  (when (seq matched-target-db-ids)
    (t2/query {:update :metabase_database
               :set    {:initial_sync_status "complete"}
               :where  [:in :id (vec matched-target-db-ids)]})))

(defn import-metadata-file!
  "Run the full metadata import pipeline against the given file.

  `metadata-file` — `java.io.File` or path-string for the metadata file
                    (databases / tables / fields).

  Returns `:ok` on success; throws on hard-fail conditions (file not
  readable, file incomplete, cycle in reference graph, mid-merge errors)."
  [metadata-file]
  (let [^File m-file (if (instance? File metadata-file)
                       metadata-file
                       (File. ^String metadata-file))]
    (processors/with-staging-tables
      ;; --- drain + database matching (single pass over the file) ---
      (let [matched-target-db-ids (drain-and-match-databases! m-file)]
        ;; --- analyze: feed the planner real selectivity for downstream UPDATEs ---
        (processors/analyze-staging-tables!)
        ;; --- pre-flight: every parent ref must resolve within the file ---
        (processors/assert-no-orphan-refs!)
        ;; --- pre-flight: NULL orphan fk-target refs (informational, not fatal) ---
        (let [{:keys [count sample]} (processors/null-orphan-fk-target-refs!)]
          (when (pos? count)
            (log/warnf "metadata-file-import: %d orphan fk_target_field_id ref(s) NULLed (target not present in file); sample=%s"
                       count (pr-str sample))))
        ;; --- depth tagging: assign 0..max-depth, detect cycles ---
        (processors/compute-staging-depth!)
        ;; --- table resolve round 1: matched-vs-insert decision for merge-tables! ---
        (processors/resolve-target-table-ids-in-staging!)
        ;; --- merge (one txn — every live-data write all-or-nothing) ---
        (t2/with-transaction [_]
          (processors/merge-tables!)
          ;; round 2 captures INSERT-assigned ids back into table staging
          (processors/resolve-target-table-ids-in-staging!)
          ;; copy target-table-ids from table staging onto field staging
          (processors/resolve-target-table-ids-for-fields-in-staging!)
          ;; depth-walk: per-depth resolve + UPDATE matched + INSERT new
          (processors/merge-fields-by-depth!)
          (mark-databases-sync-complete! matched-target-db-ids))
        (log/infof "metadata-file-import: complete (matched-databases=%d)"
                   (count matched-target-db-ids))))
    :ok))

(defn initialize-from-env!
  "If `MB_TABLE_METADATA_PATH` is set in the environment, run the import
  pipeline against the referenced file. Returns `:ok` on success, including
  the no-env-vars case (silent no-op).

  Hard-fails if the referenced file doesn't exist or isn't readable."
  []
  (if-let [metadata-path (env-path table-metadata-path-key)]
    (let [metadata-file (assert-file-readable! metadata-path)]
      (log/infof "metadata-file-import: loading metadata from %s" metadata-path)
      (import-metadata-file! metadata-file)
      :ok)
    :ok))
