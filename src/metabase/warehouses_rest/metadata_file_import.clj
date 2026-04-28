(ns metabase.warehouses-rest.metadata-file-import
  "Boot-time loader that streams a metadata file and (optionally) a field-values
  file into the appdb, populating `:model/Database` (matched, never created),
  `:model/Table`, `:model/Field`, and `:model/FieldValues`.

  The loader is a thin orchestrator over four building blocks:

    - [[metabase.warehouses-rest.metadata-file-import.parsers]] streams batches
      of `[line-num row]` tuples from the file (JSON or YAML, dispatched by
      extension).
    - [[metabase.warehouses-rest.metadata-file-import.processors]] runs the
      per-batch SQL — validate, match, insert, update, upsert.
    - [[metabase.warehouses-rest.metadata-file-import.id-map]] holds the
      `source_field_id → target_field_id` map outside the JVM heap during
      phase 3, since at warehouse-scale it can run to 10M+ entries.
    - [[metabase.warehouses-rest.metadata-file-import.schemas]] defines the
      per-row Malli schemas, shared with the parsers' callers.

  Phases (per METADATA_FILE_IMPORT_PLAN.md §5):

    1. Databases — match by `(name, engine)`, never create. Build db-id-map
       in heap. Unmatched source databases produce WARN logs and the loader
       skips their dependent tables / fields.
    2. Tables — rewrite `db_id` through phase-1's map, match-or-insert by
       `(target-db-id, schema, name)`. Build tbl-id-map in heap.
    3. Fields, multi-pass-by-depth — walk the file once per nesting level.
       Each pass classifies rows into already-mapped (skip), resolvable now
       (parent_id null or already in the field id-map), or deferred. Resolvable
       rows go to the processor; the loader appends new pairs to the id-map
       and commits at end-of-pass. Terminates clean when a pass resolves zero
       new rows AND has zero unresolvable; hard-fails as `:phase-3-stuck` when
       a pass resolves zero new rows but has non-zero unresolvable (cycle or
       orphan parent reference).
    4. Fields-finalize — walk the file once more. For each row with non-null
       `fk_target_field_id`, resolve both the row's own source id AND its
       fk-target source id via the field id-map, build a batched UPDATE.
    5. Field-values — walk the field-values file. Rewrite each `field_id`
       through the field id-map; rows whose source field id didn't resolve
       are skipped with a WARN.

  After phase 5: every matched target Database is flipped to
  `initial_sync_status='complete'` so the UI surfaces tables immediately.

  No `version` field handling — see plan §4 (deferred until export-side
  coordination)."
  (:require
   [clojure.string :as str]
   [environ.core :as env]
   [metabase.util.log :as log]
   [metabase.warehouses-rest.metadata-file-import.id-map :as id-map]
   [metabase.warehouses-rest.metadata-file-import.parsers :as parsers]
   [metabase.warehouses-rest.metadata-file-import.processors :as processors]
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
(def ^:private field-values-path-key   :mb-field-values-path)

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

;;; ============================== Phase 1: databases ==============================

(defn- load-databases!
  "Phase 1 — stream the `databases` array, run [[processors/process-databases!]]
  per batch, and accumulate `{source-db-id → target-db-id}`. Unmatched source
  databases are logged WARN and skipped."
  [^File file]
  (let [db-id-map (volatile! {})]
    (parsers/stream-array-batches!
     file :databases processors/import-batch-size
     (fn [batch]
       (reduce (fn [_ result]
                 (case (:status result)
                   :matched
                   (vswap! db-id-map assoc (:source-id result) (:target-id result))

                   :no-match
                   (log/warnf "metadata-file-import: skipped source database id=%s (no_match): %s"
                              (pr-str (:source-id result)) (:detail result)))
                 nil)
               nil
               (processors/process-databases! batch))))
    @db-id-map))

;;; ============================== Phase 2: tables ==============================

(defn- load-tables!
  "Phase 2 — stream the `tables` array, calling
  [[processors/process-tables!]] per batch with the db-id-map. Returns
  `{source-table-id → target-table-id}` for every row whose `db_id` resolved."
  [^File file db-id-map]
  (let [tbl-id-map (volatile! {})]
    (parsers/stream-array-batches!
     file :tables processors/import-batch-size
     (fn [batch]
       (reduce (fn [_ result]
                 (case (:status result)
                   (:matched :inserted)
                   (vswap! tbl-id-map assoc (:source-id result) (:target-id result))

                   :no-target-db
                   (log/warnf "metadata-file-import: skipped table source-id=%s (no-target-db): %s"
                              (pr-str (:source-id result)) (:detail result)))
                 nil)
               nil
               (processors/process-tables! batch db-id-map))))
    @tbl-id-map))

;;; ============================== Phase 3: fields-insert (multi-pass) ==============================

(def ^:private ^:const unresolvable-sample-cap
  "Maximum number of unresolvable `(source-id, parent-id)` pairs to retain for
  the `:phase-3-stuck` error message. Caps the message size on pathological
  files while still giving ops actionable evidence."
  20)

(defn- run-phase-3-pass!
  "Walk the `fields` array once. Returns
  `{:newly-resolved N, :unresolvable N, :unresolvable-sample [...]}`. Appends
  new `(source-id, target-id)` pairs to the field id-map's in-pass buffer; the
  caller must `commit-pass!` after this returns."
  [^File file tbl-id-map field-id-map]
  (let [newly-resolved      (volatile! 0)
        unresolvable        (volatile! 0)
        unresolvable-sample (volatile! [])]
    (parsers/stream-array-batches!
     file :fields processors/import-batch-size
     (fn [batch]
       (let [resolvable
             (into []
                   (keep (fn [[ln {:keys [id parent_id] :as row}]]
                           (cond
                             ;; already in the committed id-map → skip silently
                             (>= (id-map/get-target field-id-map id) 0)
                             nil

                             ;; root field — resolvable now with parent=nil
                             (nil? parent_id)
                             [ln row nil]

                             ;; nested field — resolvable iff parent is mapped
                             :else
                             (let [resolved-parent (id-map/get-target field-id-map parent_id)]
                               (if (>= resolved-parent 0)
                                 [ln row resolved-parent]
                                 (do (vswap! unresolvable inc)
                                     (when (< (count @unresolvable-sample)
                                              unresolvable-sample-cap)
                                       (vswap! unresolvable-sample conj
                                               {:source-id id :parent-id parent_id}))
                                     nil))))))
                   batch)]
         (when (seq resolvable)
           (reduce (fn [_ result]
                     (case (:status result)
                       (:matched :inserted)
                       (do (id-map/append! field-id-map
                                           (:source-id result) (:target-id result))
                           (vswap! newly-resolved inc))

                       :no-target-table
                       (log/warnf "metadata-file-import: skipped field source-id=%s (no-target-table): %s"
                                  (pr-str (:source-id result)) (:detail result)))
                     nil)
                   nil
                   (processors/process-fields-insert-pass! resolvable tbl-id-map))))))
    {:newly-resolved      @newly-resolved
     :unresolvable        @unresolvable
     :unresolvable-sample @unresolvable-sample}))

(defn- run-phase-3!
  "Phase 3 — multi-pass-by-depth. Repeats [[run-phase-3-pass!]] until
  termination. Hard-fails on `:phase-3-stuck` when a pass makes zero progress
  but has unresolvable rows."
  [^File file tbl-id-map field-id-map]
  (loop [pass-num 0]
    (let [{:keys [newly-resolved unresolvable unresolvable-sample]}
          (run-phase-3-pass! file tbl-id-map field-id-map)]
      (id-map/commit-pass! field-id-map)
      (log/infof "metadata-file-import: phase-3 pass %d newly-resolved=%d unresolvable=%d"
                 pass-num newly-resolved unresolvable)
      (cond
        (and (zero? newly-resolved) (zero? unresolvable))
        :done

        (zero? newly-resolved)
        (throw (ex-info (format (str "Phase 3 stuck: %d source field id(s) could not be resolved "
                                     "(cycle or orphan parent_id reference). Sample: %s")
                                unresolvable
                                (pr-str unresolvable-sample))
                        {:kind                :phase-3-stuck
                         :pass                pass-num
                         :unresolvable-count  unresolvable
                         :unresolvable-sample unresolvable-sample}))

        :else
        (recur (inc pass-num))))))

;;; ============================== Phase 4: fields-finalize ==============================

(defn- run-phase-4!
  "Phase 4 — walk the `fields` array once. For each row with a non-null
  `fk_target_field_id`, resolve both the row's own source id and the
  fk-target id via the field id-map, then call
  [[processors/process-fields-fk-finalize!]]. Hard-fails if either lookup
  misses (corrupt file, per §10)."
  [^File file field-id-map]
  (parsers/stream-array-batches!
   file :fields processors/import-batch-size
   (fn [batch]
     (let [tuples
           (into []
                 (keep (fn [[ln {:keys [id fk_target_field_id] :as row}]]
                         (when fk_target_field_id
                           (let [tgt-id (id-map/get-target field-id-map id)
                                 fk-tgt (id-map/get-target field-id-map fk_target_field_id)]
                             (when (or (neg? tgt-id) (neg? fk-tgt))
                               (throw (ex-info (format (str "Phase 4 reference miss at line %d: "
                                                            "source field id=%d %s, "
                                                            "fk_target_field_id=%d %s")
                                                       ln id (if (neg? tgt-id) "(unmapped)" "(mapped)")
                                                       fk_target_field_id (if (neg? fk-tgt) "(unmapped)" "(mapped)"))
                                               {:kind                :phase-4-reference-miss
                                                :line                ln
                                                :source-id           id
                                                :fk-target-source-id fk_target_field_id})))
                             [ln row tgt-id fk-tgt]))))
                 batch)]
       (when (seq tuples)
         (run! identity (processors/process-fields-fk-finalize! tuples)))))))

;;; ============================== Phase 5: field values ==============================

(defn- load-field-values!
  "Phase 5 — stream the `field_values` array, mapping each row's source
  `field_id` through the field id-map. Rows whose source field didn't resolve
  are skipped with a WARN (the field was unmatched in phase 3)."
  [^File file field-id-map]
  (let [resolve-fn (fn [src]
                     (let [t (id-map/get-target field-id-map src)]
                       (when (>= t 0) t)))]
    (parsers/stream-array-batches!
     file :field_values processors/import-batch-size
     (fn [batch]
       (reduce (fn [_ result]
                 (case (:status result)
                   (:inserted :updated)
                   nil

                   :no-target-field
                   (log/warnf "metadata-file-import: skipped field_values source-field-id=%s (no-target-field): %s"
                              (pr-str (:source-field-id result)) (:detail result)))
                 nil)
               nil
               (processors/process-field-values! batch resolve-fn))))))

;;; ============================== Top-level orchestration ==============================

(defn- mark-databases-sync-complete!
  "Flip every matched target Database's `initial_sync_status` to `\"complete\"`
  so the UI surfaces tables immediately. Without this, the UI stays in the
  `Setting up...` state for matched databases."
  [db-id-map]
  (when-some [target-db-ids (seq (vals db-id-map))]
    (t2/update! :model/Database :id [:in target-db-ids]
                {:initial_sync_status "complete"})))

(defn import-metadata-file!
  "Run the full import pipeline against the given files.

  `metadata-file` — `java.io.File` or path-string for the metadata file (databases / tables / fields).
  `fv-file`       — `java.io.File`, path-string, or `nil` for the field-values file (phase 5).

  Wraps the whole pipeline in a `try/finally` that always closes (and deletes)
  the disk-spooled field id-map. Returns `:ok` on success; throws on any of
  the hard-fail conditions in §10."
  [metadata-file fv-file]
  (let [^File m-file  (if (instance? File metadata-file) metadata-file (File. ^String metadata-file))
        ^File fv-file (when fv-file
                        (if (instance? File fv-file) fv-file (File. ^String fv-file)))
        field-id-map  (id-map/create!)]
    (try
      (let [db-id-map  (load-databases! m-file)
            tbl-id-map (load-tables! m-file db-id-map)]
        (run-phase-3! m-file tbl-id-map field-id-map)
        (run-phase-4! m-file field-id-map)
        (when fv-file
          (load-field-values! fv-file field-id-map))
        (mark-databases-sync-complete! db-id-map)
        (log/infof "metadata-file-import: complete (matched-databases=%d tables=%d field-id-map-size=%d)"
                   (count db-id-map) (count tbl-id-map) (id-map/size field-id-map))
        :ok)
      (finally
        (id-map/close! field-id-map)))))

(defn initialize-from-env!
  "If `MB_TABLE_METADATA_PATH` (and optionally `MB_FIELD_VALUES_PATH`) is set
  in the environment, run the import pipeline against the referenced files.
  Returns `:ok` on success, including the no-env-vars case (silent no-op).

  Hard fails if `MB_FIELD_VALUES_PATH` is set without `MB_TABLE_METADATA_PATH`
  (the field id-map is derived from phase 3, so we can't load field-values
  alone). Hard-fails if either referenced file doesn't exist or isn't
  readable.

  Invoked once during boot from
  `metabase.core.config-from-file/init-from-file-if-code-available!`
  (integration tracked as item 13 in the implementation checklist)."
  []
  (let [metadata-path (env-path table-metadata-path-key)
        fv-path       (env-path field-values-path-key)]
    (cond
      (and (nil? metadata-path) (nil? fv-path))
      :ok

      (and (some? fv-path) (nil? metadata-path))
      (throw (ex-info "MB_FIELD_VALUES_PATH set without MB_TABLE_METADATA_PATH — field ids cannot be resolved"
                      {:kind :missing_metadata_path}))

      :else
      (let [metadata-file (assert-file-readable! metadata-path)
            fv-file       (when fv-path (assert-file-readable! fv-path))]
        (log/infof "metadata-file-import: loading metadata from %s" metadata-path)
        (when fv-file
          (log/infof "metadata-file-import: loading field-values from %s" fv-path))
        (import-metadata-file! metadata-file fv-file)
        :ok))))
