(ns metabase-enterprise.serialization.metadata-file-import
  "Boot-time loader that streams a metadata file into the appdb, populating
  `:model/Database` (matched, never created), `:model/Table`, and `:model/Field`.

  The loader is a thin orchestrator over three building blocks:

    - [[metabase-enterprise.serialization.metadata-file-import.parsers]] streams batches
      of `[line-num row]` tuples from the file (JSON or YAML, dispatched by
      extension).
    - [[metabase-enterprise.serialization.metadata-file-import.processors]] runs the
      per-batch SQL — validate, match, insert, update, upsert. Each processor
      self-resolves cross-table references via batched natural-key SELECTs; the
      loader carries no id-map state.
    - [[metabase-enterprise.serialization.metadata-file-import.schemas]] defines the
      per-row Malli schemas, shared with the parsers' callers.

  The loader runs four passes:

    1. databases — match by `(name, engine)`, never create. Unmatched source
       databases produce WARN logs (non-fatal).
    2. tables — match-or-insert by `(target-db-id, schema, name)`.
    3. fields — match-or-insert with on-the-fly stubs for missing parents.
    4. fk-resolve — walk fields again to set `fk_target_field_id`.

  After all four passes complete: a `warn-on-unfilled-stubs!` self-check scans
  the matched databases for stubs that never got filled; operator gets a
  structured WARN line. Then `initial_sync_status` is flipped to `\"complete\"`
  on every matched target Database so the UI surfaces tables immediately."
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
  "Environment map. Dynamic for test rebinding; defaults to `environ.core/env`,
  which strips the `MB_` prefix and lowercases with dashes — so
  `MB_TABLE_METADATA_PATH` is read as `:mb-table-metadata-path`."
  env/env)

(def ^:private table-metadata-path-key :mb-table-metadata-path)

(defn- env-path
  "Read `*env*` at `k`, treating blank strings as absent."
  [k]
  (let [v (get *env* k)]
    (when (and (string? v) (not (str/blank? v))) v)))

(defn- assert-file-readable!
  "Coerce `path` to a `File`, throwing `:file_not_found` / `:file_not_readable`
  if it can't be read. Returns the `File`."
  ^File [^String path]
  (let [f (File. path)]
    (when-not (.exists f)
      (throw (ex-info (format "Metadata file not found at path %s" (pr-str path))
                      {:kind :file_not_found, :path path})))
    (when-not (.canRead f)
      (throw (ex-info (format "Metadata file at path %s is not readable" (pr-str path))
                      {:kind :file_not_readable, :path path})))
    f))

;;; ============================== databases ==============================

(defn- load-databases!
  "Stream the `databases` array, run [[processors/process-databases!]] per
  batch. Returns a set of `target-db-id`s (the appdb integer ids of every
  source database that matched). Unmatched source databases are logged WARN;
  non-fatal."
  [^File file]
  (let [matched-ids (volatile! #{})]
    (parsers/stream-array-batches!
     file :databases processors/import-batch-size
     (fn [batch]
       (reduce (fn [_ result]
                 (case (:status result)
                   :matched
                   (vswap! matched-ids conj (:target-id result))

                   :no-match
                   (log/warnf "metadata-file-import: skipped source database %s (no matching target): %s"
                              (pr-str (:source-id result)) (:detail result)))
                 nil)
               nil
               (processors/process-databases! batch))))
    @matched-ids))

;;; ============================== fk-resolve ==============================

(defn- resolve-field-fks!
  "Walk the fields array again to set `fk_target_field_id` on rows that have one."
  [^File file]
  (parsers/stream-array-batches!
   file :fields processors/import-batch-size
   (fn [batch]
     (run! identity (processors/process-fields-fk-resolve! batch)))))

;;; ============================== Unfilled-stubs scan ==============================

(def ^:private ^:const unfilled-stubs-sample-cap
  "Maximum number of unfilled stubs reported in the WARN line."
  50)

(defn- warn-on-unfilled-stubs!
  "Self-check: scan target appdb for rows still carrying the stub sentinel,
  bounded to the matched-target-db-ids so pre-existing stubs from unrelated
  imports don't pollute this run's report. Emits a structured WARN line."
  [matched-target-db-ids]
  (when (seq matched-target-db-ids)
    (let [stubs (t2/select [:model/Field :id :name :table_id :nfc_path]
                           {:where [:and
                                    [:= :database_type "__stub__"]
                                    [:in :table_id {:select [:id]
                                                    :from   [:metabase_table]
                                                    :where  [:in :db_id (vec matched-target-db-ids)]}]]
                            :limit unfilled-stubs-sample-cap})]
      (when (seq stubs)
        (log/warnf
         "metadata-file-import: %d unfilled stub field(s) remain after import (sample up to %d): %s"
         (count stubs)
         unfilled-stubs-sample-cap
         (pr-str (mapv (fn [{:keys [id name table_id nfc_path]}]
                         {:id id :name name :table_id table_id :nfc_path nfc_path})
                       stubs)))))))

;;; ============================== Top-level orchestration ==============================

(defn- mark-databases-sync-complete!
  "Flip every matched target Database's `initial_sync_status` to `\"complete\"`
  so the UI surfaces tables immediately. Without this, the UI stays in the
  `Setting up...` state for matched databases."
  [matched-target-db-ids]
  (when (seq matched-target-db-ids)
    (t2/update! :model/Database :id [:in (vec matched-target-db-ids)]
                {:initial_sync_status "complete"})))

(defn import-metadata-file!
  "Run the full metadata import pipeline against the given file.

  `metadata-file` — `java.io.File` or path-string for the metadata file
                    (databases / tables / fields).

  Returns `:ok` on success; throws on hard-fail conditions."
  [metadata-file]
  (let [^File m-file              (if (instance? File metadata-file)
                                    metadata-file
                                    (File. ^String metadata-file))
        matched-target-db-ids     (load-databases! m-file)]
    (processors/with-staging-tables
      ;; --- drain (writes only to staging) ---
      (processors/drain-tables-into-staging! m-file)
      (processors/drain-fields-into-staging! m-file)
      ;; --- compute (read-only against live; writes only to staging) ---
      (processors/resolve-existing-parents-in-staging!)
      (let [stub-specs (processors/compute-stubs!)]
        ;; --- merge (atomic across phase 2 + 3) ---
        (t2/with-transaction [_]
          (processors/merge-tables!)
          (processors/insert-stubs-where-not-exists! stub-specs)
          (processors/resolve-existing-parents-in-staging!)
          (processors/assert-no-unresolved-parent-refs!)
          (processors/merge-fields!)))
      ;; phase 4 (commit 4 will fold this into the merge txn too)
      (resolve-field-fks! m-file)
      (warn-on-unfilled-stubs! matched-target-db-ids))
    (mark-databases-sync-complete! matched-target-db-ids)
    (log/infof "metadata-file-import: complete (matched-databases=%d)"
               (count matched-target-db-ids))
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
