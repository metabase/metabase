(ns metabase-enterprise.semantic-search.indexer
  "Companion to the gate lib defining an indexing loop to be invoked as a singleton Quartz job.

  - A (cluster singleton) interruptible quartz job should invoke (quartz-job-run!) (see task/indexer.clj).
  - The job will poll the gate table in a loop and index anything new it finds (inserts, updates & deletes).
  - Occasionally (scheduled according to demand) will drain some records from the dead letter queue and try attempt to reindex them (see dlq.clj).
  - Saves watermark state back to index metadata for each batch of documents indexed
    (if interrupted / crashes / process dies, polling can continue from its watermark position).
  - The job can run the indexing-loop for a time, eventually yielding back to quartz.
    - we do not poll once per job invocation, indexing-loop can poll and index data many, many times before yielding.
    - it will exit if it has run for default-max-run-duration
    - it will exit if it has not seen any new data in default-exit-early-cold-duration
    - it will exit if it is interrupted (e.g. node shutdown).
  - Polling behaviour respects the limitations of gate.clj (there is a 2x gate-write-timeout lag tolerance).
    - if there is a lot of new write activity you might see the indexer stall for a short time
      to wait for commit-races to become very unlikely.
    - when reindexing cold gate entries the loop is free to index using straightforward key-set pagination, without waiting.
  - By default, any kind of exception will immediately exit the loop (quartz is free to reschedule).
  - If the indexer is deemed to have stalled due to repeated errors:
      - The loop will instead start adding failed gate docs to the dead-letter-queue (see dlq.clj).
      - Progress its watermark regardless (to avoid indexer stalls if e.g. documents are poisoned)."
  (:require
   [honey.sql :as sql]
   [metabase-enterprise.semantic-search.dlq :as semantic.dlq]
   [metabase-enterprise.semantic-search.gate :as semantic.gate]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase.analytics.core :as analytics]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import (java.sql Timestamp)
           (java.time Clock Duration Instant InstantSource)))

(set! *warn-on-reflection* true)

(def ^InstantSource clock "Handy var for test indirection" (Clock/systemUTC))

(def ^:private lag-tolerance (.multipliedBy semantic.gate/gate-write-timeout (semantic.settings/ee-search-indexer-lag-tolerance-multiplier)))

(def ^Duration stall-grace-period
  "Time to wait after marking an indexer as stalled before switching to DLQ mode.

  This grace period allows for transient issues to resolve naturally before
  falling back to the more aggressive DLQ processing mode. During this period,
  the indexer continues to attempt normal processing and throw exceptions on failure."
  (Duration/ofSeconds 10))

(defn- clear-stall!
  "Clears the stall marker from the index metadata table.

  Called when the indexer successfully processes documents after being stalled,
  indicating that normal processing can resume. This resets the indexer to its
  normal error handling mode where exceptions cause the indexer to exit.

  Returns true if a stall marker was actually cleared, false if none existed."
  [pgvector index-metadata index]
  (let [dml {:update [(keyword (:metadata-table-name index-metadata))]
             :set    {:indexer_stalled_at nil}
             :where  [:and [:= :table_name (:table-name index)] [:!= nil :indexer_stalled_at]]}
        sql (sql/format dml :quoted true)
        {update-count ::jdbc/update-count} (jdbc/execute-one! pgvector sql)
        cleared (pos? update-count)]
    (when cleared
      (log/debugf "Cleared stall marker for index %s" (:table-name index)))
    cleared))

(defn- mark-stalled!
  "Marks the indexer as stalled in the index metadata table.

  This is called when an indexing operation fails, indicating that the indexer
  should switch to DLQ mode after the grace period elapses. The stall marker timestamp
  is used to determine when the grace period has passed.

  Only sets the timestamp if one isn't already present (preserves the original
  stall time). Returns the timestamp that was set, or nil if already stalled."
  [pgvector index-metadata index]
  (let [now (Timestamp/from (.instant clock))
        dml {:update [(keyword (:metadata-table-name index-metadata))]
             :set    {:indexer_stalled_at now}
             :where  [:and
                      [:= :table_name (:table-name index)]
                      ;; do not overwrite existing (earlier) timestamps
                      [:= nil :indexer_stalled_at]]}
        sql (sql/format dml :quoted true)
        {update-count ::jdbc/update-count} (jdbc/execute-one! pgvector sql)
        timestamp (when (pos? update-count) now)]
    (when timestamp
      (log/debugf "Marked indexer as stalled for index %s at %s" (:table-name index) timestamp))
    timestamp))

(defn- observe-poll-to-poll-interval [poll-result watermark]
  (let [{new-poll-time :poll-time} poll-result
        {:keys [last-poll]} watermark]
    (when last-poll
      ;; distance between polls
      (let [idle-time-ms (- (inst-ms new-poll-time) (inst-ms last-poll))]
        (analytics/observe! :metabase-search/semantic-indexer-poll-to-poll-interval-ms idle-time-ms)))))

(defn indexing-step
  "Runs a single blocking step of the indexing loop."
  [pgvector index-metadata index indexing-state]
  (letfn [(poll []
            (let [{:keys [watermark]} @indexing-state]
              (semantic.gate/poll pgvector index-metadata watermark
                                  :limit (semantic.settings/ee-search-indexer-poll-limit)
                                  :lag-tolerance lag-tolerance)))
          ;; when polling within the lag-tolerance window we need to expect
          ;; to see the same gate entries when polling.
          ;; We keep a :last-seen-candidates set so if we saw them last time we can filter them out
          (remove-redundant-candidates [update-candidates]
            (let [{:keys [last-seen-candidates]} @indexing-state]
              (if (seq last-seen-candidates)
                (into [] (remove last-seen-candidates) update-candidates)
                update-candidates)))

          ;; currently we expect to flush the watermark each time we poll
          (move-to-next-watermark [poll-result]
            (let [{:keys [watermark]} @indexing-state
                  next-watermark (semantic.gate/next-watermark watermark poll-result)]
              (vswap! indexing-state assoc :watermark next-watermark)
              (semantic.gate/flush-watermark! pgvector index-metadata index next-watermark)))

          (clear-stall-if-needed []
            (when (:stalled-at @indexing-state)
              (analytics/set! :metabase-search/semantic-indexer-stalled 0)
              (clear-stall! pgvector index-metadata index)
              (vswap! indexing-state assoc :stalled-at nil)))]
    (let [poll-result           (poll)
          {:keys [update-candidates]} poll-result
          _                     (observe-poll-to-poll-interval poll-result (:watermark @indexing-state))
          novel-candidates      (remove-redundant-candidates update-candidates)
          documents-query       {:select [:id :gated_at :model :model_id :document]
                                 :from   [(keyword (:gate-table-name index-metadata))]
                                 :where  [:in :id (sort (map :id novel-candidates))]}
          documents-sql         (sql/format documents-query :quoted true)
          lookup-start          (u/start-timer)
          gate-docs             (when (seq novel-candidates) (jdbc/execute! pgvector documents-sql {:builder-fn jdbc.rs/as-unqualified-lower-maps}))
          lookup-duration-ms    (u/since-ms lookup-start)
          updates               (filter :document gate-docs)
          deletes               (remove :document gate-docs)
          ^Timestamp stalled-at (:stalled-at @indexing-state)]

      (when (seq novel-candidates) (analytics/inc! :metabase-search/semantic-indexer-read-documents-ms lookup-duration-ms))

      (when (seq gate-docs)
        (log/infof "Found gate updates: %d updates, %d deletes" (count updates) (count deletes)))

      (cond
        ;; nothing to do
        (empty? gate-docs)
        (do
          (clear-stall-if-needed)
          (move-to-next-watermark poll-result)
          (log/tracef "No gate documents to process for index %s" (:table-name index)))

        ;; NORMAL MODE: Not stalled, or still within grace period
        ;; This is the default behavior when the indexer is healthy. Any failures
        ;; will cause exceptions to be thrown, causing the indexer loop to exit
        ;; and Quartz to reschedule (typically within 10 seconds).
        (or
         ;; not stalled - indexer has not encountered repeated failures
         (nil? stalled-at)
         ;; within grace period - recently stalled but still allowing normal retry behavior
         (.isBefore (.instant clock) (.plus (.toInstant stalled-at) stall-grace-period))
         ;; DLQ processing hasn't been initialized (keeping this while in flux, ensures DLQ is 'optional').
         (nil? (:next-dlq-run @indexing-state)))
        (try
          ;; index changes
          (let [index-start-time (u/start-timer)]
            (when (seq updates)
              (log/debugf "Processing %d index updates in normal mode for index %s" (count updates) (:table-name index))
              (semantic.index/upsert-index! pgvector index (map semantic.gate/gate-doc->search-doc updates)))
            (doseq [[model deletes] (group-by :model deletes)]
              (when (seq deletes)
                (log/debugf "Processing %d index deletes for model %s in normal mode for index %s" (count deletes) model (:table-name index)))
              (semantic.index/delete-from-index! pgvector index model (map :model_id deletes)))
            (analytics/inc! :metabase-search/semantic-indexer-write-indexing-ms (u/since-ms index-start-time)))
          ;; update metadata/watermark
          (let [metadata-start-time (u/start-timer)]
            (clear-stall-if-needed)
            (move-to-next-watermark poll-result)
            (analytics/inc! :metabase-search/semantic-indexer-write-metadata-ms (u/since-ms metadata-start-time)))
          (log/debugf "Processed %d gate documents successfully in normal mode for index %s" (count gate-docs) (:table-name index))
          (catch InterruptedException ie (throw ie))
          (catch Throwable t
            (log/debug t "Indexing failure caught in normal mode")
            (log/warnf "Indexing failed in normal mode for index %s, marking as stalled: %s" (:table-name index) (.getMessage t))
            (mark-stalled! pgvector index-metadata index)
            (throw t)))

        ;; STALLED MODE: Grace period elapsed, switch to DLQ-based processing
        ;; This mode is activated when the indexer has been stalled and the grace period
        ;; has elapsed. The goal is to make progress at any cost while isolating problematic
        ;; documents that prevent normal processing.
        ;;
        ;; DLQ Processing Strategy:
        ;; - Any indexing failures are added to the dead letter queue to be retried after the dlq/initial-backoff.
        ;; - The watermark progresses regardless of success/failure (prevents infinite stalls)
        ;; - DLQ lib implements exponential backoff policies appropriate to error types
        ;; - DLQ lib can isolate poisoned documents from good ones through batch size reduction
        ;; - When all documents in a batch succeed, the indexer recovers to normal mode
        ;;
        ;; This ensures that even if some documents are permanently broken, the indexer
        ;; continues to make progress on processable documents while retrying failures
        ;; according to appropriate policies.
        :else
        (do
          (analytics/set! :metabase-search/semantic-indexer-stalled 1)
          (log/debugf "Processing %d documents in stalled mode (using DLQ) for index %s" (count gate-docs) (:table-name index))
          (let [{:keys [failures]} (semantic.dlq/try-batch! pgvector index gate-docs)]
            (when (seq failures)
              (log/warnf "Adding %d indexing failures to the dead letter queue" (count failures))
              (semantic.dlq/add-entries! pgvector index-metadata (:index-id @indexing-state) (map :dlq-entry failures)))

            ;; once no longer failing, clear any stall from index_metadata
            ;; this will cause the 'healthy' branch to be used again.
            (when (empty? failures)
              (let [stalled-at (.toInstant ^Timestamp (:stalled-at @indexing-state))
                    stall-duration (Duration/between stalled-at (.instant clock))]
                (log/info "Indexer recovered from stall in" stall-duration))
              (clear-stall-if-needed))

            ;; we progress the watermark regardless of success when stalled
            (move-to-next-watermark poll-result)
            (log/debugf "Processed %d gate documents in stalled mode for index %s, %d failed and moved to DLQ" (count gate-docs) (:table-name index) (count failures)))))

      ;; we set :last-seen-candidates
      ;; to filter redundant entries from the last poll (duplicate delivery is expected and intended when
      ;; at the tail of the gate index).
      (vswap! indexing-state assoc
              :last-seen-candidates (set update-candidates)
              :last-novel-count (count novel-candidates)
              :last-poll-count (count update-candidates)
              :last-seen-change (if (seq novel-candidates)
                                  (.instant clock)
                                  (:last-seen-change @indexing-state))))))

;; having a var is handy for tests, and observing sleeps
(defn- sleep [ms]
  (let [start-time (u/start-timer)]
    (Thread/sleep (long ms))
    (analytics/inc! :metabase-search/semantic-indexer-sleep-ms (u/since-ms start-time))
    nil))

(defn on-indexing-idle
  "Runs any loop idle behaviour (such as waiting), called after each step."
  [indexing-state]
  (let [{:keys [last-poll-count
                last-novel-count
                ^Instant next-dlq-run]} @indexing-state
        novelty-ratio (if (zero? last-poll-count) 0 (/ last-novel-count last-poll-count))]

    (cond
      ;; if the next DLQ run should happen on the next iteration, we should not idle
      (and next-dlq-run (.isAfter (.instant clock) next-dlq-run))
      nil

      ;; more than 25% the results are new, immediately get more
      (< 0.25 novelty-ratio)
      nil

      ;; more than 10% the results are new, small backoff.
      (< 0.1 novelty-ratio)
      (sleep 250)

      ;; more than 1% the results are new, medium backoff.
      (< 0.01 novelty-ratio)
      (sleep 1500)

      ;; not a lot of new stuff, big back off.
      :else
      (sleep 3000))))

(defn- on-indexing-interrupted []
  (log/info "Indexing loop interrupted, exited gracefully"))

(defn- max-run-time-elapsed?
  "Returns true if :max-run-duration has been exceeded. We should yield back to quartz, to give other nodes a shot."
  [{:keys [^Instant start-time
           ^Duration max-run-duration]}
   ^Instant now]
  (and start-time (.isAfter now (.plus start-time max-run-duration))))

(defn- exit-early-due-to-cold-data?
  "Returns true if :exit-early-cold-duration has elapsed since we last saw any change.
  We should yield back to quartz and release resources until rescheduled."
  [{:keys [^Instant start-time
           ^Instant last-seen-change
           ^Duration exit-early-cold-duration]}
   ^Instant now]
  (or (and last-seen-change
           (.isAfter now (.plus last-seen-change exit-early-cold-duration)))
      (and (nil? last-seen-change)
           start-time
           (.isAfter now (.plus start-time exit-early-cold-duration)))))

(def ^Duration dlq-max-run-duration
  "Maximum time the DLQ retry loop will run before yielding back to the main indexer.

  This prevents DLQ processing from monopolizing the indexer thread while still
  allowing meaningful progress on retries.

  Constant for now, Later this may vary based on demand of DLQ vs watermark progress."
  (Duration/ofSeconds 10))

(def dlq-max-batch-size
  "Starting batch size for DLQ processing.

  The DLQ will adaptively shrink this on failures to isolate poisoned
  documents, and grow it back up to this maximum on success."
  100)

(def dlq-poll-limit
  "Maximum number of DLQ entries to fetch in a single poll operation.

  This limits memory usage and ensures responsive behavior even when the
  DLQ contains many entries ready for retry.

  We do need to balance this for throughput during periods of prolonged (but transient) failure.
  It is important that DLQ draining throughput is high when there are lots of pending retries.

  NOTE: The DLQ loop does issue multiple poll requests until it runs out of scheduled retries or its max time -
  so this limit does not need to be _that_ high."
  1000)

(def ^Duration dlq-frequency
  "How often to run DLQ processing when there's no immediate work to do.

  When the DLQ run completes because it ran out of ready entries (rather than
  time), the next DLQ run is scheduled this far in the future.
  (i.e. we backoff and focus on watermark indexing If the DLQ run completes there is nothing left to do)."
  (Duration/ofSeconds 15))

(defn dlq-step
  "Runs the dead letter queue retry loop for up to dlq-max-run-duration.
  NOTE: is free to change the :last-seen-change marker timestamp, to avoid cold exits if the
  DLQ runs are processing data. (Otherwise we would _also_ require new gate writes to avoid a cold exit.)"
  [pgvector index-metadata index indexing-state]
  (let [{:keys [index-id]} @indexing-state
        {:keys [exit-reason
                ^Duration run-time
                success-count
                failure-count]}
        (semantic.dlq/dlq-retry-loop!
         pgvector
         index-metadata
         index
         index-id
         :max-run-duration dlq-max-run-duration
         :max-batch-size dlq-max-batch-size
         :poll-limit dlq-poll-limit)

        now (.instant clock)]

    (analytics/inc! :metabase-search/semantic-indexer-dlq-successes success-count)
    (analytics/inc! :metabase-search/semantic-indexer-dlq-failures failure-count)
    (analytics/inc! :metabase-search/semantic-indexer-dlq-loop-ms (.toMillis run-time))

    (log/debugf "DLQ step completed for index %s: exit-reason=%s, run-time=%s, successes=%d, failures=%d"
                (:table-name index) exit-reason run-time success-count failure-count)

    (when (or (pos? success-count) (pos? failure-count))
      (log/infof "Dead letter queue loop completed in %.2f seconds, %d successes, %d failures."
                 (/ (.toMillis run-time) 1e3)
                 success-count
                 failure-count))

    ;; if we succeed we mark a DLQ success to hold off an early exit due to the exit-early-cold-duration elapsing
    ;; otherwise the indexing-loop will exit despite us having more to do in the DLQ.
    (when (pos? success-count)
      (vswap! indexing-state assoc :last-seen-change now))

    ;; schedule the next run, immediately on the next iteration if there is a lot to do.
    (let [next-run (if (and (pos? success-count) (= :ran-out-of-time exit-reason))
                     now
                     (.plus now dlq-frequency))]
      (if (= now next-run)
        (log/debugf "Scheduling next DLQ run for index %s immediately as there is more to retry" (:table-name index))
        (log/debugf "Scheduling next DLQ run for index %s at %s" (:table-name index) next-run))
      (vswap! indexing-state assoc :next-dlq-run next-run))

    nil))

(defn indexing-loop
  "Runs the indexing loop on the current thread, blocks until exit or interrupted.
  See (max-run-time-elapsed?) and (exit-early-due-to-cold-data?) for automatic
  exit conditions."
  [pgvector
   index-metadata
   index
   indexing-state]
  (vswap! indexing-state assoc :start-time (.instant clock))
  (loop []
    (cond
      (.isInterrupted (Thread/currentThread))
      (on-indexing-interrupted)

      (max-run-time-elapsed? @indexing-state (.instant clock))
      (log/debugf "Indexer run time elapsed for index %s. Indexer exiting, quartz will reschedule." (:table-name index))

      (exit-early-due-to-cold-data? @indexing-state (.instant clock))
      (log/debugf "Indexer not seen any recent change for index %s, Indexer exiting, quartz will reschedule." (:table-name index))

      :else
      (let [interrupted (or
                         ;; normal indexing
                         (try
                           (indexing-step pgvector index-metadata index indexing-state)
                           false
                           (catch InterruptedException _
                             (log/info "Indexing thread interrupted while indexing")
                             true))
                         ;; run dead letter queue processing if it is time to do so
                         (when-some [^Instant next-dlq-run (:next-dlq-run @indexing-state)]
                           (when (.isAfter (.instant clock) next-dlq-run)
                             (log/debugf "Starting DLQ processing for index %s" (:table-name index))
                             (try
                               (dlq-step pgvector index-metadata index indexing-state)
                               false
                               (catch InterruptedException _
                                 (log/info "Indexing thread interrupted while processing the dead letter queue")
                                 true))))
                         ;; idling
                         (try
                           (on-indexing-idle indexing-state)
                           false
                           (catch InterruptedException _
                             (log/info "Indexing thread interrupted while idling")
                             true)))]
        (if interrupted
          (on-indexing-interrupted)
          (recur))))))

(def max-run-duration
  "Duration minutes wrapper for [[semantic.settings/ee-search-indexer-max-run-duration]]."
  (Duration/ofMinutes (semantic.settings/ee-search-indexer-max-run-duration)))

(def exit-early-cold-duration
  "Duration seconds wrapper for [[semantic.settings/ee-search-indexer-exit-early-cold-duration]]."
  (Duration/ofSeconds (semantic.settings/ee-search-indexer-exit-early-cold-duration)))

(defn init-indexing-state
  "Initialises the indexing state variable, contains the watermark position, statistics on
  what has been seen, and parameters for policy such as the :max-run-duration."
  [metadata-row]
  (let [watermark (semantic.gate/resume-watermark metadata-row)
        {:keys [last-seen]} watermark]
    (volatile! {:watermark                watermark
                ;; The last-seen-candidates filters the expected redundant entries when
                ;; polling beyond the confidence threshold. It is overwritten each time we poll.
                ;; Seeding this value with the watermark solves a problem where the very last document
                ;; will be re-indexed every time the indexer is rescheduled
                :last-seen-candidates     (if last-seen #{last-seen} #{})
                :last-novel-count         0
                :last-poll-count          0
                :max-run-duration         max-run-duration
                :exit-early-cold-duration exit-early-cold-duration
                :index-id                 (:id metadata-row)
                ;; nil if healthy, a timestamp of when we first stalled if unhealthy
                :stalled-at               (:indexer_stalled_at metadata-row)})))

(defn quartz-job-run!
  "Quartz job (execute) implementation. Determines the active index before running
  a (indexing-loop) with the default parameters.

  Blocks until exit or interrupt if an active index exists."
  [pgvector
   index-metadata]
  (let [{:keys [index metadata-row]} (semantic.index-metadata/get-active-index-state pgvector index-metadata)]
    (when-not index (log/debug "No active semantic search index"))
    (when index
      (log/debugf "Starting indexer loop for index %s (ID: %s)" (:table_name metadata-row) (:id metadata-row))
      (let [indexing-state (init-indexing-state metadata-row)]

        ;; if the DLQ table exists, schedule runs to happen during indexing
        ;; note: we might remove the table-exists? condition once schema solidifies
        (if (semantic.dlq/dlq-table-exists? pgvector index-metadata (:id metadata-row))
          (do
            (log/debugf "DLQ table exists for index %s, scheduling DLQ processing" (:table-name index))
            (vswap! indexing-state assoc :next-dlq-run (.plus (.instant clock) dlq-frequency)))
          (log/warnf "DLQ table does not exist for index %s" (:table-name index)))

        (try
          (let [loop-start-time (u/start-timer)]
            (indexing-loop
             pgvector
             index-metadata
             index
             indexing-state)
            (analytics/inc! :metabase-search/semantic-indexer-loop-ms (u/since-ms loop-start-time)))

          (catch InterruptedException ie (throw ie))
          (catch Throwable t
            (log/errorf t "An exception was caught during the indexing loop for index %s" (:table-name metadata-row))
            (throw t)))))))
