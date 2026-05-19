(ns metabase-enterprise.serialization.metadata-file-import
  "Streams a metadata file into the appdb, populating
  `:model/Database` (matched, never created), `:model/Table`, and `:model/Field`.

  Composes three building blocks:

    - [[metabase-enterprise.serialization.metadata-file-import.parsers]] streams
      batches of `[line-num row]` tuples from a JSON file.
    - [[metabase-enterprise.serialization.metadata-file-import.processors]] provides
      the per-batch and per-depth SQL building blocks.
    - [[metabase-enterprise.serialization.metadata-file-import.schemas]] defines
      the per-row Malli schemas, shared with the parsers' callers.

  Strict-consistency invariants enforced by the pre-flight + depth-tagging
  steps mean the merge loop has no orphan-handling code paths. The whole
  merge is set-based SQL, one statement per phase per depth level."
  (:require
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
   (java.util UUID)
   (org.postgresql PGConnection)
   (org.postgresql.copy CopyIn CopyManager)))

(set! *warn-on-reflection* true)

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
  `PreparedStatement`s. The fallback path for non-Postgres app-dbs."
  [^Connection conn ^File file matched-ids databases-by-source-id]
  (with-open [^PreparedStatement tables-ps (.prepareStatement conn (processors/tables-insert-sql))
              ^PreparedStatement fields-ps (.prepareStatement conn (processors/fields-insert-sql))]
    (parsers/stream-keyed-arrays!
     file processors/import-batch-size
     {:databases (partial process-databases-batch! matched-ids databases-by-source-id)
      :tables    (fn [batch] (processors/drain-tables-batch-jdbc! tables-ps @databases-by-source-id batch))
      :fields    (fn [batch] (processors/drain-fields-batch-jdbc! fields-ps batch))})))

;; Only one COPY can be active per connection at a time, so we track the
;; current handle (`:tables` or `:fields`) and close it before opening the next.
(defn- drain-via-pg-copy!
  "Drive parser batches through PG's COPY wire protocol via `CopyManager`,
  streaming TSV-formatted bytes directly to the server."
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

;; Opens one JDBC connection with autoCommit=false and commits at the end.
;; c3p0's autoCommitOnClose=false means we must explicitly restore
;; autoCommit=true before returning the connection to the pool — otherwise the
;; next pool user inherits an open-transaction-capable connection and can leak
;; an idle-in-transaction backend.
(defn- drain-and-match-databases!
  "Single-pass walk of `file`: match `:databases` against the live appdb,
  drain `:tables` and `:fields` into staging. Returns the set of matched
  target-db-ids."
  [^File file]
  (let [matched-ids            (volatile! #{})
        databases-by-source-id (volatile! {})
        ds                     (mdb/data-source)]
    (with-open [^Connection conn (.getConnection ds)]
      (.setAutoCommit conn false)
      (try
        ;; PG COPY fast path; JDBC executeBatch fallback for H2/MySQL.
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

;; Writes via raw `:metabase_database` to bypass `:model/Database`'s
;; `:after-update` hook, which would schedule per-database Quartz sync triggers
;; — undesirable here, since the whole point of metadata-file-import is to skip
;; warehouse sync. App startup re-registers triggers.
(defn- mark-databases-sync-complete!
  "Flip every matched target Database's `initial_sync_status` to `\"complete\"`
  so the UI surfaces tables immediately."
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
    ;; with-staging-tables clears the staging tables on entry and exit
    ;; (try/finally), so a crashed prior attempt can't leak rows into this run.
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

;;; ============================== Import registry + agent ==============================
;;; In-JVM only — matches the scope of `metabase.sync.util/operation->db-ids`.
;;; Status is not durable across server restarts.

(def ^:private terminal-record-limit
  "Max number of completed (`:ok`/`:error`) records retained in the registry.
  In-flight (`:queued`/`:running`) records are never evicted regardless of count."
  10)

;; id -> {:id :status :file :enqueued-at :started-at :finished-at :wall-ms :error}
(defonce ^:private import-registry (atom {}))

(defonce ^:private import-agent
  (agent ::serializer :error-mode :continue))

;; The id currently being run by the agent, or nil. A single-element index over
;; `import-registry` so the sync busy-check is O(1) instead of scanning.
(defonce ^:private running-import-id (atom nil))

(defn- terminal-status? [status]
  (contains? #{:ok :error} status))

(defn- prune-terminal-records
  "Drop the oldest terminal records past `terminal-record-limit`, ordered by
  `:finished-at`. Non-terminal records are retained regardless of count."
  [registry]
  (let [terminal (filter (comp terminal-status? :status val) registry)]
    (if (<= (count terminal) terminal-record-limit)
      registry
      (->> terminal
           (sort-by (comp :finished-at val))
           (drop-last terminal-record-limit)
           (map key)
           (apply dissoc registry)))))

(defn- finalize-record
  "Merge terminal `attrs` onto record `id`, then prune."
  [registry id attrs]
  (-> registry
      (update id merge attrs)
      prune-terminal-records))

(defn import-status
  "Registry record for import `id`, or nil if the id is unknown or has been
  evicted."
  [id]
  (get @import-registry id))

(defn import-running?
  "Truthy iff a metadata-file-import is currently in flight on this JVM."
  []
  (some? @running-import-id))

(defn- import-busy-reason []
  (when-let [id @running-import-id]
    (let [{:keys [file started-at]} (get @import-registry id)]
      {:reason (format "metadata-file-import in progress (file=%s, since=%s)"
                       file started-at)})))

(defonce ^:private initialized? (atom false))

(defn init!
  "Register hooks with the subsystems this module coordinates with (sync).
  Called from `metabase-enterprise.serialization.init` at boot. Idempotent —
  callers don't need to guard against multiple invocations."
  []
  (when (compare-and-set! initialized? false true)
    (sync.util/register-busy-predicate! import-busy-reason)))

(defn- run-import*
  "Agent body. Always returns `::serializer`; `:error-mode :continue` plus
  the inner try/catch means a failing import never poisons the agent."
  [_serializer id ^File file {:keys [delete-after?]}]
  (let [path (.getAbsolutePath file)
        t0   (System/nanoTime)]
    (swap! import-registry update id merge {:status :running :started-at (Instant/now)})
    (reset! running-import-id id)
    (log/infof "metadata-file-import: starting (id=%s, file=%s)" id path)
    (try
      (import-metadata-file! file)
      (let [wall-ms (/ (- (System/nanoTime) t0) 1e6)]
        (log/infof "metadata-file-import: complete (id=%s, file=%s, wall-ms=%.0f)" id path wall-ms)
        (swap! import-registry finalize-record id
               {:status :ok :finished-at (Instant/now) :wall-ms wall-ms :error nil}))
      (catch Throwable t
        (let [wall-ms (/ (- (System/nanoTime) t0) 1e6)]
          (log/errorf t "metadata-file-import: failed (id=%s, file=%s, wall-ms=%.0f)" id path wall-ms)
          (swap! import-registry finalize-record id
                 {:status :error :finished-at (Instant/now) :wall-ms wall-ms :error (str t)})))
      (finally
        (reset! running-import-id nil)
        (when delete-after?
          (try (.delete file) (catch Throwable _ nil)))))
    ::serializer))

(defn enqueue-import!
  "Submit `file` to the import agent and return its import id (a string UUID).
  Imports execute in arrival order; a `:queued` registry record is created
  synchronously before this returns, so the caller can immediately look the id
  up via `import-status`. With `{:delete-after? true}`, the agent deletes
  `file` once it finishes (success or failure)."
  ([^File file]
   (enqueue-import! file {}))
  ([^File file opts]
   (let [id   (str (UUID/randomUUID))
         path (.getAbsolutePath file)]
     (swap! import-registry assoc id {:id          id
                                      :status      :queued
                                      :file        path
                                      :enqueued-at (Instant/now)
                                      :started-at  nil
                                      :finished-at nil
                                      :wall-ms     nil
                                      :error       nil})
     (log/infof "metadata-file-import: queued (id=%s, file=%s)" id path)
     (send-off import-agent run-import* id file opts)
     id)))
