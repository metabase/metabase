(ns metabase-enterprise.semantic-search.indexer
  (:require [honey.sql :as sql]
            [metabase-enterprise.semantic-search.gate :as semantic.gate]
            [metabase-enterprise.semantic-search.index :as semantic.index]
            [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
            [metabase.util.log :as log]
            [next.jdbc :as jdbc]
            [next.jdbc.result-set :as jdbc.rs])
  (:import (java.time Duration Instant)))

(def ^:private poll-limit 1000)

(def ^:private lag-tolerance (.multipliedBy semantic.gate/gate-write-timeout 2))

(defn indexing-step [pgvector index-metadata index indexing-state]
  (letfn [(poll []
            (let [{:keys [watermark]} @indexing-state]
              (semantic.gate/poll pgvector index-metadata watermark
                                  :limit poll-limit
                                  :lag-tolerance lag-tolerance)))
          ;; when polling within the lag-tolerance window we need to expect
          ;; to see the same gate entries when polling.
          ;; We keep a :last-seen-candidates set so if we saw them last time we can filter them out
          (remove-redundant-candidates [update-candidates]
            (let [{:keys [last-seen-candidates]} @indexing-state]
              (not-empty (if (seq last-seen-candidates)
                           (into [] (remove last-seen-candidates) update-candidates)
                           update-candidates))))

          ;; currently we expect to flush the watermark each time we poll
          (move-to-next-watermark [poll-result]
            (let [{:keys [watermark]} @indexing-state
                  next-watermark (semantic.gate/next-watermark watermark poll-result)]
              (vswap! indexing-state assoc :watermark next-watermark)
              (semantic.gate/flush-watermark! pgvector index-metadata index next-watermark)))]
    (let [{:keys [update-candidates] :as poll-result} (poll)]
      (if-some [novel-candidates (remove-redundant-candidates update-candidates)]
        (let [documents-query   {:select [:model :model_id :document]
                                 :from   [(keyword (:gate-table-name index-metadata))]
                                 :where  [:in :id (sort (map :id novel-candidates))]}
              documents-sql     (sql/format documents-query :quoted true)
              gate-docs         (jdbc/execute! pgvector documents-sql {:builder-fn jdbc.rs/as-unqualified-lower-maps})
              updates           (filter :document gate-docs)
              deletes           (remove :document gate-docs)
              updated-documents (map semantic.gate/gate-doc->search-doc updates)]
          (log/infof "Found gate updates: %d updates, %d deletes" (count updates) (count deletes))
          (when (seq updated-documents)
            (semantic.index/upsert-index! pgvector index updated-documents))
          (doseq [[model deletes] (group-by :model deletes)]
            (semantic.index/delete-from-index! pgvector index model (map :model_id deletes)))
          (vswap! indexing-state assoc
                  :last-seen-change (Instant/now)
                  :last-indexed-count (count novel-candidates)
                  :last-poll-count (count update-candidates))
          (move-to-next-watermark poll-result))
        (do
          (vswap! indexing-state assoc
                  :last-indexed-count 0
                  :last-poll-count (count update-candidates))
          (move-to-next-watermark poll-result)))

      ;; we use this to filter redundant entries from the last poll (duplicate delivery is expected and intended when
      ;; at the tail of the gate index).
      (vswap! indexing-state assoc :last-seen-candidates (set update-candidates)))))

;; having a var is handy for tests
(defn- sleep [ms]
  (Thread/sleep (long ms)))

(defn on-indexing-idle [indexing-state]
  (let [{:keys [last-poll-count last-indexed-count]} @indexing-state
        novelty-ratio (if (zero? last-poll-count) 0 (/ last-indexed-count last-poll-count))]
    (cond
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
  (and start-time
       last-seen-change
       (.isAfter now (.plus last-seen-change exit-early-cold-duration))))

(defn indexing-loop [pgvector
                     index-metadata
                     index
                     indexing-state]
  (vswap! indexing-state assoc :start-time (Instant/now))
  (loop []
    (cond
      (.isInterrupted (Thread/currentThread))
      (on-indexing-interrupted)

      (max-run-time-elapsed? @indexing-state (Instant/now))
      (log/debug "Indexer run time elapsed. Indexer exiting, quartz will reschedule.")

      (exit-early-due-to-cold-data? @indexing-state (Instant/now))
      (log/debug "Indexer not seen any recent change, Indexer exiting, quartz will reschedule.")

      :else
      (let [interrupted (or (try
                              (indexing-step pgvector index-metadata index indexing-state)
                              false
                              (catch InterruptedException _
                                (log/info "Indexing thread interrupted while processing")
                                true))
                            (try
                              (on-indexing-idle indexing-state)
                              false
                              (catch InterruptedException _
                                (log/info "Indexing thread interrupted while idling")
                                true)))]
        (if interrupted
          (on-indexing-interrupted)
          (recur))))))

(def default-max-run-duration
  (Duration/ofMinutes 60))

(def default-exit-early-cold-duration
  (Duration/ofSeconds 30))

(defn init-indexing-state [metadata-row]
  (let [watermark (semantic.gate/resume-watermark metadata-row)
        {:keys [last-seen]} watermark]
    (volatile! {:watermark                watermark
                ;; The last-seen-candidates filters the expected redundant entries when
                ;; polling beyond the confidence threshold. It is overwritten each time we poll.
                ;; Seeding this value with the watermark solves a problem where the very last document
                ;; will be re-indexed every time the indexer is rescheduled
                :last-seen-candidates     (if last-seen #{last-seen} #{})
                :last-indexed-count       0
                :last-poll-count          0
                :max-run-duration         default-max-run-duration
                :exit-early-cold-duration default-exit-early-cold-duration})))

(defn quartz-job-run!
  [pgvector
   index-metadata]
  (let [{:keys [index metadata-row]} (semantic.index-metadata/get-active-index-state pgvector index-metadata)]
    (when-not index (log/debug "No active semantic search index"))
    (when index
      (let [indexing-state (init-indexing-state metadata-row)]
        (try
          (indexing-loop
           pgvector
           index-metadata
           index
           indexing-state)
          (catch InterruptedException ie (throw ie))
          (catch Throwable t
            (log/error t "An exception was caught during the indexing loop")
            (throw t)))))))
