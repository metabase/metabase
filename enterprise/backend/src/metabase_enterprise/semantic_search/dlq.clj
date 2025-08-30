(ns metabase-enterprise.semantic-search.dlq
  "Dead Letter Queue (DLQ) implementation for semantic search indexing.

  This namespace provides a dead letter queue system that handles failed semantic search
  indexing operations with configurable retry policies. The DLQ is used when the main indexer
  becomes stalled due to repeated failures, allowing the system to:

  - Isolate problematic documents that cause indexing to fail (batch poisoning)
  - Apply exponential backoff retry policies for transient vs permanent errors
  - Allow the main indexer watermark to progress when only a subset of documents fail to be indexed

  Initial write to the dead letter queue happen inside the indexer
  when stall conditions are detected (see indexer.clj stall handling).

  The queue is continuously drained (entries retried, and removed on success) by the indexer as part of normal index maintenance - there is no additional job
  and writes & reads remain coordinated, ordering is preserved.

  Documents will be rescheduled for retries on failure - there is a transient-policy (for temporary errors)
  and a permanent-policy (that is likely only resolved with manual intervention, a patch to the code).
  Even 'permanent' errors are retried however - due to inherent ambiguity - it just effects the backoff climb."
  (:require
   [honey.sql :as sql]
   [metabase-enterprise.semantic-search.gate :as semantic.gate]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (java.net SocketException)
   (java.time Clock Duration Instant InstantSource)))

(set! *warn-on-reflection* true)

(def ^:private dlq-table-schema
  "The database schema definition for a DLQ table.
  The schema includes:
  - gate_id: PK & reference to the gate table entry that failed (NOTE: no FK, the DLQ is index specific and does not impose any change to the behaviour of the gate table)
  - retry_count: Number of retry attempts made for this entry
  - attempt_at: Next scheduled retry timestamp (based on backoff policy)
  - last_attempted_at: Timestamp of the most recent retry attempt
  - error_gated_at: Original timestamp when the gate entry was marked as failed"
  [[:gate_id :text [:primary-key] :not-null]
   [:retry_count :int :not-null]
   [:attempt_at :timestamp-with-time-zone :not-null]
   [:last_attempted_at :timestamp-with-time-zone :not-null]
   [:error_gated_at :timestamp-with-time-zone :not-null]])

(defn dlq-table-name-kw
  "Generates the DLQ table name keyword for a specific index (metadata record).

  Uses the index-table-qualifier format string from index-metadata to construct
  a table name like 'index_table_dlq_{index-id}'."
  [index-metadata index-id]
  (let [{:keys [index-table-qualifier]} index-metadata]
    (keyword (format index-table-qualifier (str "dlq_" index-id)))))

(defn create-dlq-table-if-not-exists!
  "Creates the DLQ table for the specified index if it doesn't already exist."
  [pgvector index-metadata index-id]
  (let [dlq-table (dlq-table-name-kw index-metadata index-id)]
    (log/debugf "Creating DLQ table %s for index %s" dlq-table index-id)
    ;; create table
    (let [ddl {:create-table [dlq-table :if-not-exists]
               :with-columns dlq-table-schema}
          sql (sql/format ddl :quoted true)]
      (jdbc/execute-one! pgvector sql))
    ;; create attempt_at index
    (let [ddl {:create-index [[(keyword (str (name dlq-table) "_attempt_at_idx")) :if-not-exists] [dlq-table :attempt_at]]}
          sql (sql/format ddl :quoted true)]
      (jdbc/execute-one! pgvector sql))
    nil))

(defn drop-dlq-table-if-exists!
  "Drops the DLQ table for the specified index if it exists."
  [pgvector index-metadata index-id]
  (let [ddl {:drop-table [:if-exists (dlq-table-name-kw index-metadata index-id)]}
        sql (sql/format ddl :quoted true)]
    (jdbc/execute-one! pgvector sql)
    nil))

(defn dlq-table-exists?
  "Returns true if the dead letter queue table exists for the given index."
  [pgvector index-metadata index-id]
  (semantic.util/table-exists? pgvector (name (dlq-table-name-kw index-metadata index-id))))

(defn categorize-error
  "Categorizes an error as :transient, :permanent, or defaults to :transient.

  Error categorization examples:
  - HTTP 4xx status codes -> :permanent (client errors, won't be fixed by retry)
  - HTTP 5xx status codes -> :transient (server errors, may recover)
  - SocketException -> :transient (network issues, may recover)
  - AssertionError -> :permanent (logic errors, won't be fixed by retry)
  - NullPointerException -> :permanent (programming errors, won't be fixed by retry)
  - Everything else -> :transient (safer to retry unknown errors)

  This categorization determines which retry policy is applied - 'permanent' errors
  get much longer delays between retries than transient ones."
  [^Throwable t]
  (or (when-some [{:keys [status]} (ex-data t)]
        (cond
          (not (int? status)) nil
          (<= 400 status 499) :permanent
          (<= 500 status 599) :transient))
      (condp instance? t
        SocketException :transient
        AssertionError :permanent
        NullPointerException :permanent
        nil)
      :transient))

(def transient-policy
  "Retry policy for transient errors that are more likely to recover quickly."
  {:cap  (Duration/ofMinutes 10)
   :base (Duration/ofMillis 500)
   :exp  2.0})

(def permanent-policy
  "Retry policy for permanent errors that are unlikely to recover without intervention.

  This policy is designed for errors like malformed documents or configuration
  issues that typically require human intervention to resolve."
  {:cap  (Duration/ofHours 24)
   :base (Duration/ofMinutes 10)
   :exp  2.0})

(defn linear-policy
  "Creates a linear retry policy (no exponential backoff).

  Useful for testing."
  [base]
  {:cap  base
   :base base
   :exp  1.0})

(defn max-delay-ms
  "Calculates the maximum delay in milliseconds for a given retry count and policy.

  Uses an exponential backoff formula: base-delay * (retry-count ^ exponential-factor)
  The result is capped at the policy's maximum (:cap) delay and floored at 0.

  This is used internally by next-delay (which introduces random jitter). It is sometimes useful
  to predict the maximum delay regardless of any jitter."
  ^double [^long retry-count policy]
  (let [{:keys [^Duration base ^Duration cap ^Double exp]} policy
        base-ms    (.toMillis base)
        cap-ms     (.toMillis cap)
        exp-factor (Math/pow retry-count exp)
        raw-delay  (* base-ms exp-factor)
        delay      (min raw-delay cap-ms)]
    (max 0.0 (long delay))))

(defn next-delay
  "Calculates the next retry delay as a Duration for the given retry count and policy.

  Applies the policy's exponential backoff formula with the cap constraint.
  Returns a Duration object suitable for scheduling the next retry attempt (presumably against now/last-attempt).

  Initially DLQ entries have a retry count of zero - it is not 'try' count, it is 'retry' count.
  The initial retry is scheduled using the standard 'initial-backoff' variable, this function is only used
  when we have retried at least once."
  ^Duration [^long retry-count policy]
  (let [{:keys [^Duration cap]} policy
        cap-ms (.toMillis cap)
        delay-ms (max-delay-ms retry-count policy)
        jitter (+ 0.9 (* (rand) 0.2))
        jittered-ms (* delay-ms jitter)]
    (Duration/ofMillis (min cap-ms (max 0 (long jittered-ms))))))

(comment
  (next-delay 0 transient-policy)
  (next-delay 1 transient-policy)
  (next-delay 2 transient-policy)
  (next-delay 10 transient-policy)
  (next-delay 0 permanent-policy)
  (next-delay 1 permanent-policy)
  (next-delay 5 permanent-policy)
  (next-delay 10 permanent-policy))

(defn add-entries!
  "Adds or updates DLQ entries in the database.

  When there's a conflict on gate_id:
    Updates the entry only if the new error_gated_at is >= the existing one (sanity check, should not happen in practice
    if called in an order consistent with gating).
    This ensures more recent failures take precedence over older DLQ entries

  Returns the number of entries that were inserted or updated."
  [pgvector index-metadata index-id dlq-entries]
  (if (empty? dlq-entries)
    0
    (let [dml {:insert-into   (dlq-table-name-kw index-metadata index-id)
               :values        (sort-by :gate_id dlq-entries)
               :on-conflict   [:gate_id]
               :do-update-set {:fields {:attempt_at        :excluded.attempt_at
                                        :retry_count       :excluded.retry_count
                                        :error_gated_at    :excluded.error_gated_at
                                        :last_attempted_at :excluded.last_attempted_at}
                               ;; condition: if exiting dlq entry reflects a more recent gate failure
                               ;; prefer the new attempt_at / retry_count from the gate to the prior DLQ entry.
                               :where  [:<= [:. (dlq-table-name-kw index-metadata index-id) :error_gated_at]
                                        :excluded.error_gated_at]}}
          sql (sql/format dml :quoted true)
          {upsert-count ::jdbc/update-count} (jdbc/execute-one! pgvector sql)]
      (log/debugf "Added/updated %d DLQ entries for index %s" upsert-count index-id)
      upsert-count)))

(defn delete-entries!
  "Removes DLQ entries that correspond to successfully processed gate documents.

  Deletes entries matching both gate_id and error_gated_at to ensure we only
  remove DLQ entries that correspond to the specific gate failure that was just
  successfully reprocessed. This composite key approach prevents accidentally
  removing newer DLQ entries for the same document.

  We also use this to delete entries that have been orphaned due to an independent gate table change. This
  race is unlikely - but nonetheless we ignore these entries and drop them from the gate table.
  (We might race with GC'ing old tombstones, or if we change the way DLQ writes are ordered in respect to gate writes).

  Returns the number of entries deleted."
  [pgvector index-metadata index-id gate-docs]
  (if (empty? gate-docs)
    0
    (let [dml {:delete-from (dlq-table-name-kw index-metadata index-id)
               :where       [:in [:composite :gate_id :error_gated_at]
                             (for [{:keys [id gated_at]} gate-docs]
                               [id gated_at])]}
          sql (sql/format dml :quoted true)
          {delete-count ::jdbc/update-count} (jdbc/execute-one! pgvector sql)]
      (when (pos? delete-count)
        (log/debugf "Deleted %d DLQ entries for index %s" delete-count index-id))
      delete-count)))

(def ^InstantSource clock
  "The system clock, but indirect so you can override it in tests."
  (Clock/systemUTC))

(def default-max-run-duration
  "The default amount of time for which the DLQ retry loop will run for before exiting. The loop will
  still exit if there is nothing left to do. We only expect to hit this max run if there are lots of scheduled retries
  within a short time window.

  By yielding the loop the indexer thread regains control and can decide how best to balance DLQ draining demands vs
  regular watermarked indexing."
  (Duration/ofSeconds 5))

(def default-max-batch-size
  "The default batch size, will shrink if failures continue to be encountered during a loop.
  - In case the size of the batch is causing the error (e.g. large documents).
  - To isolate any poisoned documents sooner than might otherwise be the case."
  100)

(def default-poll-limit
  "The maximum number of retry records to fetch in a single poll"
  1000)

(defn poll
  "Polls the indexer DLQ table for up to poll-limit entries ready to be retried.

  Considers the state of both the DLQ table and the gate table to:
  - Find DLQ entries where attempt_at <= current time (ready for retry)
  - Include corresponding gate document data needed for reindexing
  - Detect orphaned DLQ entries (where gate entry was deleted or has since been modified)

  The entries are projected as 'gate-docs' compatible with the retry functions defined elsewhere in this namespace.
  In addition to the gate keys: :id, :gated_at, :model, :model_id, :document, they will include some information from the
  DLQ entry:
  - A :retry_count to determine the next back off it fails again
  - Both a :gated_at (from DLQ) and :new_gated_at (from gate).
    So a caller can identify stale DLQ entries that no longer match the current gate state.

  Returns up to poll-limit records, sort is undefined."
  [pgvector index-metadata index-id poll-limit]
  (let [q   {:select    [[:d.gate_id :id]
                         [:d.error_gated_at :gated_at]
                         :d.retry_count
                         :g.model
                         :g.model_id
                         :g.document
                         [:g.gated_at :new_gated_at]]
             :from      [[(dlq-table-name-kw index-metadata index-id) :d]]
             ;; idea: we will allow gate entries to be deleted independently of the dead letter queue
             ;; avoid cascading fks or any kind of explicit relationship
             :left-join [[(keyword (:gate-table-name index-metadata)) :g] [:= :d.gate_id :g.id]]
             :where     [:<= :d.attempt_at (.instant clock)]
             :limit     poll-limit}
        sql (sql/format q :quoted true)
        results (jdbc/execute! pgvector sql {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
    (when (seq results)
      (log/debugf "Polled %d DLQ entries ready for retry from index %s" (count results) index-id))
    results))

(def ^Duration initial-backoff
  "Used to schedule the initial retry attempt - no jitter, will assume the whole batch of failures
  can be retried again at around the same time (optimistic).

  From then on jitter and batch shrinking will split retries apart
  in time and avoid situations where the same documents are tried in the same batch.

  NOTE: this backoff duration only applies when the indexer is considered stalled. Before this (stall grace period)
  the indexer retries according to its quartz schedule - this value (and the dead letter queue in general) is not used."
  (Duration/ofSeconds 10))

(defn initial-dlq-entry
  "Returns the initial DLQ entry for a gate document that failed for the first time.

  Sets retry_count to 0 and schedules the first retry after initial-backoff."
  [{:keys [id gated_at]} ^Instant attempted-at]
  {:gate_id           id
   :error_gated_at    gated_at
   :retry_count       0
   :attempt_at        (.plus attempted-at initial-backoff)
   :last_attempted_at attempted-at})

(defn- next-dlq-entry
  "Returns the next DLQ entry for a gate document that has failed again.

  Increments the retry_count and calculates the next attempt_at timestamp using
  the provided retry-policy's backoff schedule. Preserves the original error_gated_at
  timestamp to maintain consistency."
  [{:keys [id gated_at retry_count]} retry-policy ^Instant attempted-at]
  (let [new-retry-count (inc retry_count)]
    {:gate_id           id
     :error_gated_at    gated_at
     :retry_count       new-retry-count
     :attempt_at        (.plus attempted-at ^Duration (next-delay new-retry-count retry-policy))
     :last_attempted_at attempted-at}))

(defn- failure-outcome [ex gate-docs]
  (let [now         (.instant clock)
        ex-category (categorize-error ex)
        ex-policy   ({:transient transient-policy, :permanent permanent-policy} ex-category transient-policy)]
    {:failures (mapv (fn [gate-doc]
                       {:gate-doc gate-doc
                        :dlq-entry
                        (if (:retry_count gate-doc)
                          (next-dlq-entry gate-doc ex-policy now)
                          (initial-dlq-entry gate-doc now))})
                     gate-docs)}))

(defn- success-outcome [gate-docs] {:successes (vec gate-docs)})

(def ^:private merge-outcomes (partial merge-with into))

(defn- retry! [f gate-docs]
  (try
    (f gate-docs)
    (success-outcome gate-docs)
    (catch InterruptedException ie (throw ie))
    (catch Throwable t
      (failure-outcome t gate-docs))))

(defn- retry-upserts! [pgvector index gate-docs]
  (retry!
   #(semantic.index/upsert-index! pgvector index (map semantic.gate/gate-doc->search-doc %))
   gate-docs))

(defn- retry-deletes! [pgvector index gate-docs]
  (->> gate-docs
       (group-by :model)
       (sort-by key)
       (transduce
        (map (fn [[model gate-docs]]
               (retry!
                #(semantic.index/delete-from-index! pgvector index model (map :model_id %))
                gate-docs)))
        merge-outcomes
        {})))

(defn try-batch!
  "Attempts to index a batch of gate documents, separating upserts from deletes
  processing them independently and then returning information on what failed and what succeeded.

  Each discrete indexing operation swallows any error thrown, other than interrupts.

  Upserts / Deletes can fail independently, even if both batched.
  For deletes, currently deletes are processed in model groups, so one operation is issued for each search model
  in the delete set - so again, multiple operations that can fail/succeed independently.

  Returns an outcome map with :successes and :failures vectors,

  - The :successes vector contains the input gate-docs that were successfully indexed.
  - Maps in the :failures vector include both the original :gate-doc and a :dlq-entry that represents a new retry
  using the gate-docs prior :retry_count and the policy associated with the caught error."
  [pgvector index gate-docs]
  (let [[upserts deletes] ((juxt filter remove) :document gate-docs)
        upsert-outcome (some->> (seq upserts) (retry-upserts! pgvector index))
        delete-outcome (some->> (seq deletes) (retry-deletes! pgvector index))]
    (merge-outcomes {} upsert-outcome delete-outcome)))

(defn- update-dlq-with-retry-outcome! [pgvector index-metadata index-id outcome]
  (let [{:keys [successes
                failures]} outcome]
    (when (seq successes)
      (->> successes
           (sort-by (juxt :id :gated_at))
           (delete-entries! pgvector index-metadata index-id)))
    (when (seq failures)
      (add-entries! pgvector index-metadata index-id (map :dlq-entry failures)))))

(defn dlq-retry-loop!
  "Runs the DLQ retry loop to attempt reindexing of failed documents.

  This is the main entry point for DLQ processing, typically called by the indexer
  when it detects that DLQ should be drained. The loop operates until one of
  several exit conditions is met.

  Loop behavior:
  1. Polls the DLQ for entries ready to retry (attempt_at <= current time)
  2. Filters out orphaned entries (where gate record no longer exists)
  3. Attempts to reindex valid entries in batches
  4. Updates DLQ based on success/failure outcomes:
     - Successful entries are removed from the DLQ
     - Failed entries get new retry schedules with an incremented retry_count
  5. Dynamically adjusts batch size:
     - Shrinks to 1 on failures (helps isolate poisoned documents)
     - Grows up to max-batch-size on success (optimizes throughput)

  Exit conditions
  - :interrupted - Thread was interrupted (graceful shutdown) NOTE: can ALSO still throw InterruptedException!
  - :ran-out-of-time - Exceeded max-run-duration (used by the indexer to ensure it regains control if there are a lot of DLQ entries to retry, or retries take a long time).
     IMPORTANT: DOES NOT terminate any blocking operations, so we should still set indexer/embedder timeout policies to reasonable numbers.
  - :no-more-data - No more DLQ entries ready to retry (caught up)

  Parameters:
  - max-run-duration: Maximum time to run before exiting
  - max-batch-size: Starting and maximum batch size
  - poll-limit: Maximum entries to fetch per poll

  Returns a map with:
  - :exit-reason - One of the exit conditions above
  - :run-time - Actual duration the loop ran (could be useful to determine the best next schedule)
  - :success-count - Number of documents successfully re-indexed
  - :failure-count - Number of documents that failed - counts failed _operations_, not unique documents.

  The loop is designed run for a short-ish time, and to be interruptible and to yield control back to the
  calling indexer, allowing for cooperative multitasking in the indexer job.
  It is possible the indexer might choose to run longer DLQ loops if the main watermark is caught up and there are
  lots of entries to retry in the DLQ.
  The converse policy could apply if the indexer is busy at its watermark, and the DLQ demands are small."
  [pgvector
   index-metadata
   index
   index-id
   & {:keys [^Duration max-run-duration
             max-batch-size
             poll-limit]
      :or   {max-run-duration default-max-run-duration
             max-batch-size   default-max-batch-size
             poll-limit       default-poll-limit}}]
  (let [loop-start (u/start-timer)
        max-run-ms (.toMillis max-run-duration)]
    (log/debugf "Starting DLQ retry loop for index %s with max-run-duration %s, max-batch-size %d" index-id max-run-duration max-batch-size)
    (loop [poll-results  []
           batch-size    max-batch-size                     ;; assumes success is more likely that not.
           success-count 0
           failure-count 0]
      (cond
        (.isInterrupted (Thread/currentThread))
        {:exit-reason   :interrupted
         :run-time      (Duration/ofMillis (u/since-ms loop-start))
         :success-count success-count
         :failure-count failure-count}

        ;; ran out of time
        (< max-run-ms (u/since-ms loop-start))
        (do
          (log/debugf "DLQ retry loop for index %s exceeded max run time (took %s)" index-id (Duration/ofMillis (u/since-ms loop-start)))
          {:exit-reason   :ran-out-of-time
           :run-time      (Duration/ofMillis (u/since-ms loop-start))
           :success-count success-count
           :failure-count failure-count})

        ;; ran out of data
        (empty? poll-results)
        (let [new-results (poll pgvector index-metadata index-id poll-limit)]
          (if (empty? new-results)
            (do
              (log/debugf "DLQ retry loop completed - no more data ready for retry in index %s" index-id)
              {:exit-reason   :no-more-data
               :run-time      (Duration/ofMillis (u/since-ms loop-start))
               :success-count success-count
               :failure-count failure-count})
            (recur new-results
                   ; you would think you might be able to reset to initial, but at the edge when you have lots of retries together it will slow down isolating poisoned docs
                   ; so if the batch size has shrunk - keep it to start with (it will soon grow)
                   batch-size
                   success-count
                   failure-count)))

        :else
        (let [[dlq-batch remaining-results] (split-at batch-size poll-results)
              ;; filter out (and delete from the dlq) orphaned batch entries (that no longer reflect the latest gate record)
              [orphaned valid-batch] ((juxt filter remove) #(not= (:gated_at %) (:new_gated_at %)) dlq-batch)
              _              (some->> orphaned seq (delete-entries! pgvector index-metadata index-id))
              _              (when (seq orphaned)
                               (log/debugf "Removed %d orphaned DLQ entries from index %s" (count orphaned) index-id))
              _              (when (seq valid-batch)
                               (log/debugf "Retrying DLQ batch of %d documents for index %s" (count valid-batch) index-id))
              outcome        (try-batch! pgvector index valid-batch)
              ;; outcome applies only to the valid batch entries
              _              (update-dlq-with-retry-outcome! pgvector index-metadata index-id outcome)
              {:keys [successes failures]} outcome
              ; re-shrink batch in case data is poisoned, or we are hitting timeouts
              new-batch-size (if (seq failures) 1 (min max-batch-size (* 2 batch-size)))]
          (recur
           remaining-results
           new-batch-size
           (+ success-count (count successes))
           (+ failure-count (count failures))))))))
