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

(defn candidate-filter [capacity]
  {:capacity capacity
   :tree     (sorted-set)})

(defn remove-redundant-candidates [candidate-filter update-candidates]
  (let [{:keys [tree]} candidate-filter]
    (remove (fn [{:keys [id gated_at]}] (contains? tree [gated_at id])) update-candidates)))

(defn update-candidate-filter [candidate-filter update-candidates]
  (let [{:keys [capacity tree]} candidate-filter
        rf (fn [tree {:keys [id gated_at] :as candidate}]
             (if (= capacity (count tree))
               (recur (disj tree (first tree)) candidate)
               (conj tree [gated_at id])))]
    {:capacity capacity
     :tree     (reduce rf tree update-candidates)}))

(defn indexing-step [pgvector index-metadata index indexing-state & {:keys [ignore-filter]}]
  (let [{:keys [watermark candidate-filter]} @indexing-state

        move-to-next-watermark
        (fn [poll-result]
          (let [next-watermark (semantic.gate/next-watermark watermark poll-result)]
            (vswap! indexing-state assoc :watermark next-watermark)
            (semantic.gate/flush-watermark! pgvector index-metadata index next-watermark)))

        {:keys [update-candidates] :as poll-result}
        (semantic.gate/poll pgvector index-metadata watermark
                            :limit poll-limit
                            :lag-tolerance lag-tolerance)]
    (if-some [novel-candidates (if ignore-filter
                                 (seq update-candidates)
                                 (seq (remove-redundant-candidates candidate-filter update-candidates)))]
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
                :last-poll-count (count update-candidates)
                :candidate-filter (update-candidate-filter candidate-filter novel-candidates))
        (move-to-next-watermark poll-result))
      (do
        (vswap! indexing-state assoc
                :last-indexed-count 0
                :last-poll-count (count update-candidates))
        (move-to-next-watermark poll-result)))))

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
  (volatile! {:watermark                (semantic.gate/resume-watermark metadata-row)
              :candidate-filter         (candidate-filter poll-limit)
              :last-indexed-count       0
              :last-poll-count          0
              :max-run-duration         default-max-run-duration
              :exit-early-cold-duration default-exit-early-cold-duration}))

(defn quartz-job-run!
  [pgvector
   index-metadata]
  (let [{:keys [index metadata-row]} (semantic.index-metadata/get-active-index-state pgvector index-metadata)]
    (when-not index (log/debug "No active semantic search index"))
    (when index
      (let [indexing-state (init-indexing-state metadata-row)]
        (indexing-loop
         pgvector
         index-metadata
         index
         indexing-state)))))
