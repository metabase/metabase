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
   [metabase.app-db.core :as mdb]
   [metabase.sync.util :as sync.util]
   [metabase.util.log :as log]
   [metabase.warehouse-schema.models.table :as schema.table]
   [toucan2.core :as t2])
  (:import
   (java.io File)
   (java.sql Connection PreparedStatement)
   (java.time Instant)
   (org.postgresql PGConnection)
   (org.postgresql.copy CopyIn CopyManager)))

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

(defn- drain-via-jdbc-batch!
  "Drive parser batches through JDBC `executeBatch` against per-staging-table
  `PreparedStatement`s. Portable across all app-db drivers."
  [^Connection conn ^File file matched-ids databases-by-source-id]
  (with-open [^PreparedStatement tables-ps (.prepareStatement conn processors/tables-insert-sql)
              ^PreparedStatement fields-ps (.prepareStatement conn processors/fields-insert-sql)]
    (parsers/stream-keyed-arrays!
     file processors/import-batch-size
     {:databases (partial process-databases-batch! matched-ids databases-by-source-id)
      :tables    (fn [batch] (processors/drain-tables-batch-jdbc! tables-ps @databases-by-source-id batch))
      :fields    (fn [batch] (processors/drain-fields-batch-jdbc! fields-ps batch))})))

(defn- drain-via-pg-copy!
  "Drive parser batches through PG's COPY wire protocol via `CopyManager`.
  Streams TSV-formatted bytes directly to the server. Only one COPY can be
  active per connection at a time, so we track the current handle (`:tables`
  or `:fields`) and close it before opening the next."
  [^Connection conn ^File file matched-ids databases-by-source-id]
  (let [^PGConnection pg-conn  (.unwrap conn PGConnection)
        ^CopyManager  copy-mgr (.getCopyAPI pg-conn)
        current                (volatile! {:kind nil :copy-in nil})
        close-current! (fn []
                         (when-let [^CopyIn ci (:copy-in @current)]
                           (.endCopy ci)
                           (vreset! current {:kind nil :copy-in nil})))
        ensure-copy!   (fn [kind ^String sql]
                         (when (not= kind (:kind @current))
                           (close-current!)
                           (vreset! current {:kind kind :copy-in (.copyIn copy-mgr sql)})))]
    (try
      (parsers/stream-keyed-arrays!
       file processors/import-batch-size
       {:databases (partial process-databases-batch! matched-ids databases-by-source-id)
        :tables    (fn [batch]
                     (ensure-copy! :tables processors/tables-copy-sql)
                     (processors/drain-tables-batch-pg-copy! (:copy-in @current) @databases-by-source-id batch))
        :fields    (fn [batch]
                     (ensure-copy! :fields processors/fields-copy-sql)
                     (processors/drain-fields-batch-pg-copy! (:copy-in @current) batch))})
      (close-current!)
      (catch Throwable t
        (try (close-current!) (catch Throwable _ nil))
        (throw t)))))

(defn- drain-and-match-databases!
  "Single-pass walk of the metadata file: match `:databases` against the live
  appdb, drain `:tables` and `:fields` into staging. Returns the set of
  matched target-db-ids.

  Opens one JDBC connection, sets `autoCommit=false`, dispatches the drain
  through a driver-conditional path (PG `CopyManager` fast path, JDBC
  `executeBatch` fallback for H2/MySQL), commits at the end. c3p0's
  `autoCommitOnClose=false` means we must explicitly restore `autoCommit=true`
  before returning the connection to the pool; otherwise the next pool user
  inherits an open-transaction-capable connection and can leak an idle-in-
  transaction backend."
  [^File file]
  (let [matched-ids            (volatile! #{})
        databases-by-source-id (volatile! {})
        ds                     (mdb/data-source)]
    (with-open [^Connection conn (.getConnection ds)]
      (.setAutoCommit conn false)
      (try
        (case (mdb/db-type)
          :postgres (drain-via-pg-copy!     conn file matched-ids databases-by-source-id)
          (drain-via-jdbc-batch! conn file matched-ids databases-by-source-id))
        (.commit conn)
        (catch Throwable t
          (try (.rollback conn) (catch Throwable _ nil))
          (throw t))
        (finally
          (try (.setAutoCommit conn true) (catch Throwable _ nil)))))
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
        (let [new-tables
              (t2/with-transaction [_]
                (let [insert-source-ids (processors/merge-tables!)]
                  ;; round 2 captures INSERT-assigned ids back into table staging
                  (processors/resolve-target-table-ids-in-staging!)
                  ;; copy target-table-ids from table staging onto field staging
                  (processors/resolve-target-table-ids-for-fields-in-staging!)
                  ;; depth-walk: per-depth resolve + UPDATE matched + INSERT new
                  (processors/merge-fields-by-depth!)
                  (mark-databases-sync-complete! matched-target-db-ids)
                  (processors/new-target-tables-from-staging insert-source-ids)))]
          ;; Permission grants run outside the merge txn — the cluster lock
          ;; shouldn't be held across the long merge work.
          (doseq [[db-id rows] (group-by :db_id new-tables)]
            (schema.table/set-new-tables-permissions! db-id rows)))
        (log/infof "metadata-file-import: complete (matched-databases=%d)"
                   (count matched-target-db-ids))))
    :ok))

;;; ============================== Concurrency guard ==============================
;;; In-JVM only — matches the scope of `metabase.sync.util/operation->db-ids`.

(defonce ^:private import-state
  (atom {:status :idle :file nil :since nil :last-result nil}))

(defonce ^:private import-agent
  (agent ::serializer :error-mode :continue))

(defn import-running?
  "Truthy iff a metadata-file-import is currently in flight on this JVM."
  []
  (= :running (:status @import-state)))

(defn- import-busy-reason []
  (let [{:keys [status file since]} @import-state]
    (when (= :running status)
      {:reason (format "metadata-file-import in progress (file=%s, since=%s)"
                       file since)})))

(defonce ^:private _busy-predicate-registered
  (do (sync.util/register-busy-predicate! import-busy-reason) true))

(defn- run-import*
  "Agent body. Always returns `::serializer`; `:error-mode :continue` plus
  the inner try/catch means a failing import never poisons the agent."
  [_serializer ^File file {:keys [delete-after?]}]
  (let [path (.getAbsolutePath file)
        t0   (System/nanoTime)]
    (swap! import-state assoc :status :running :file path :since (Instant/now))
    (log/infof "metadata-file-import: starting (file=%s)" path)
    (try
      (import-metadata-file! file)
      (let [wall-ms (/ (- (System/nanoTime) t0) 1e6)]
        (log/infof "metadata-file-import: complete (file=%s, wall-ms=%.0f)" path wall-ms)
        (swap! import-state assoc
               :status :idle :file nil :since nil
               :last-result {:status :ok
                             :file path
                             :wall-ms wall-ms
                             :finished-at (Instant/now)}))
      (catch Throwable t
        (let [wall-ms (/ (- (System/nanoTime) t0) 1e6)]
          (log/errorf t "metadata-file-import: failed (file=%s, wall-ms=%.0f)" path wall-ms)
          (swap! import-state assoc
                 :status :idle :file nil :since nil
                 :last-result {:status :error
                               :file path
                               :wall-ms wall-ms
                               :ex (str t)
                               :finished-at (Instant/now)})))
      (finally
        (when delete-after?
          (try (.delete file) (catch Throwable _ nil)))))
    ::serializer))

(defn enqueue-import!
  "Submit `file` to the import agent and return immediately. Imports execute
  in arrival order. With `{:delete-after? true}`, the agent deletes `file`
  once it finishes (success or failure)."
  ([^File file]
   (enqueue-import! file {}))
  ([^File file opts]
   (log/infof "metadata-file-import: queued (file=%s)" (.getAbsolutePath file))
   (send-off import-agent run-import* file opts)
   :queued))

(defn initialize-from-env!
  "If `MB_TABLE_METADATA_PATH` is set in the environment, enqueue an import of
  the referenced file. Returns `:ok` on success, including the no-env-vars
  case (silent no-op). Does not block on the import completing.

  Hard-fails if the referenced file doesn't exist or isn't readable."
  []
  (when-let [metadata-path (env-path table-metadata-path-key)]
    (let [metadata-file (assert-file-readable! metadata-path)]
      (log/infof "metadata-file-import: loading metadata from %s" metadata-path)
      (enqueue-import! metadata-file)))
  :ok)
