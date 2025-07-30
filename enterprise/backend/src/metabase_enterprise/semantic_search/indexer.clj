(ns metabase-enterprise.semantic-search.indexer
  (:require [honey.sql :as sql]
            [metabase-enterprise.semantic-search.gate :as semantic.gate]
            [metabase-enterprise.semantic-search.index :as semantic.index]
            [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
            [metabase.util.json :as json]
            [metabase.util.log :as log]
            [next.jdbc :as jdbc]
            [next.jdbc.result-set :as jdbc.rs])
  (:import (java.time Duration)
           (org.postgresql.util PGobject)))

(defn- do-io [f]
  (try
    [(f)]
    (catch InterruptedException e (throw e))                ; bubble interrupts to the loop
    (catch Throwable t [nil t])))

(defn- on-indexing-interrupted []
  (log/info "Indexing loop interrupted, exited gracefully"))

(def ^:private poll-limit 1000)

(def ^:private lag-tolerance (.multipliedBy semantic.gate/gate-write-timeout 2))

(defn- candidate-filter [capacity]
  {:capacity capacity
   :tree     (sorted-set)})

(defn- remove-redundant-candidates [candidate-filter update-candidates]
  (let [{:keys [tree]} candidate-filter]
    (remove (fn [{:keys [id gated_at]}] (contains? tree [gated_at id])) update-candidates)))

(defn- update-candidate-filter [candidate-filter update-candidates]
  (let [{:keys [capacity tree]} candidate-filter
        rf (fn [tree {:keys [id gated_at] :as candidate}]
             (if (= capacity (count tree))
               (recur (disj tree (key (first tree))) candidate)
               (conj tree [gated_at id])))]
    {:capacity capacity
     :tree     (reduce rf tree update-candidates)}))

(defn indexing-step [pgvector index-metadata index indexing-state & {:keys [ignore-filter]}]
  (let [{:keys [watermark candidate-filter]} @indexing-state

        move-to-next-watermark
        (fn [poll-result]
          (let [next-watermark (semantic.gate/next-watermark watermark poll-result)]
            ;; assumption: it is better to progress and hope the flush recovers, so we use the new watermark
            ;;             even if the flush fails
            (vswap! indexing-state assoc :watermark next-watermark)
            (let [[_ ex] (do-io #(semantic.gate/flush-watermark! pgvector index-metadata index next-watermark))]
              (when ex
                (log/warn ex "An exception was caught flushing the indexer watermark, this might cause redundant work on a restart.")))))

        [poll-result poll-ex]
        (do-io #(semantic.gate/poll pgvector index-metadata watermark
                                    :limit poll-limit
                                    :lag-tolerance lag-tolerance))]

    (when poll-ex
      (log/warn poll-ex "An exception was caught polling the document gate"))

    (when-some [{:keys [update-candidates]} poll-result]
      (if-some [novel-candidates (if ignore-filter
                                   (seq update-candidates)
                                   (seq (remove-redundant-candidates candidate-filter update-candidates)))]
        (do
          (log/infof "Found %d update candidates" (count novel-candidates))
          (let [documents-query {:select [:document]
                                 :from   [(keyword (:gate-table-name index-metadata))]
                                 :where  [:in :id (sort (map :id novel-candidates))]}
                documents-sql   (sql/format documents-query :quoted true)
                [pg-documents query-ex] (do-io #(jdbc/execute! pgvector documents-sql {:builder-fn jdbc.rs/as-unqualified-lower-maps}))
                decode-document (fn [{:keys [document]}] (json/decode (.getValue ^PGobject document) keyword))
                documents       (map decode-document pg-documents)
                ;; later we will want to pull embedding computation out from the upsert! here so we can pipeline and use more connections
                [_ upsert-ex] (when-not query-ex (do-io #(semantic.index/upsert-index! pgvector index documents)))]
            (cond
              ;; todo back off policy for these
              query-ex
              (log/warn query-ex "An exception was caught fetching documents for update candidates")
              upsert-ex
              (log/warn upsert-ex "An exception was caught indexing documents into the index")
              :else
              (do
                (vswap! indexing-state assoc
                        :last-indexed-count (count novel-candidates)
                        :last-poll-count (count update-candidates))
                (vswap! indexing-state update :candidate-filter update-candidate-filter novel-candidates)
                (move-to-next-watermark poll-result)))))
        (do
          (vswap! indexing-state assoc
                  :last-indexed-count 0
                  :last-poll-count (count update-candidates))
          (move-to-next-watermark poll-result))))))

;; having a var is handy for tests
(defn- sleep [ms]
  (Thread/sleep (long ms)))

(defn- on-indexing-idle [indexing-state]
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

(defn indexing-loop [pgvector index-metadata index indexing-state]
  (loop []
    (if (.isInterrupted (Thread/currentThread))
      (on-indexing-interrupted)
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

(defn init-indexing-state [metadata-row]
  (volatile! {:watermark          (semantic.gate/resume-watermark metadata-row)
              :candidate-filter   (candidate-filter poll-limit)
              :last-indexed-count 0
              :last-poll-count    0}))

(def ^:private ^Duration indexer-shutdown-wait-duration
  (Duration/ofSeconds 30))

(defn- interrupt-indexing-thread! [^Thread indexing-thread]
  (log/info "Interrupting indexing thread")
  (.interrupt indexing-thread)
  (if (.join indexing-thread indexer-shutdown-wait-duration)
    (log/info "Indexing thread shutdown gracefully")
    (log/fatal "Indexing thread not responding to interrupt!")))

(comment
  (def pgvector ((requiring-resolve 'metabase-enterprise.semantic-search.env/get-pgvector-datasource!)))
  (def index-metadata ((requiring-resolve 'metabase-enterprise.semantic-search.env/get-index-metadata)))
  (def active-index-state
    ((requiring-resolve 'metabase-enterprise.semantic-search.index-metadata/get-active-index-state)
     pgvector
     index-metadata))

  (def index (:index active-index-state))

 ;; reset to initial watermark, reload active-index-state
  (jdbc/execute!
   pgvector
   ["update index_metadata set indexer_last_poll = ?, indexer_last_seen = ? where table_name = ?"
    java.time.Instant/EPOCH
    java.time.Instant/EPOCH
    (:table-name index)])

  (def indexing-state (init-indexing-state (:metadata-row active-index-state)))
  @indexing-state

  (time (indexing-step pgvector index-metadata index indexing-state :ignore-filter true))
  (time (indexing-step pgvector index-metadata index indexing-state :ignore-filter false))
  @indexing-state

  (def indexing-thread (Thread. #(indexing-loop pgvector index-metadata index indexing-state)))
  (.start indexing-thread)
  (interrupt-indexing-thread! indexing-thread)
  (.isAlive indexing-thread))

;; separate index-switching control from the core indexing loop, keeps the indexer loop itself simpler
;; and allows it to have less behaviour
;; later this might provide opportunity for more indexing loops than active, e.g rebuild indexing loops.

(defn control-step [pgvector index-metadata control-state]
  (let [[{:keys [index metadata-row]} get-index-ex] (do-io #(semantic.index-metadata/get-active-index-state pgvector index-metadata))
        {:keys [indexing-index ^Thread indexing-thread]} @control-state]
    ;; possibly not initialised, or availability issue
    (when get-index-ex
      (log/error get-index-ex "An exception was thrown querying for the active index"))
    (when index
      ;; index has changed (or is new)
      (when (not= index indexing-index)

        ;; already have an indexing thread, shut it down
        (when indexing-thread
          (log/info "Active index changed, stopping existing indexing thread")
          (interrupt-indexing-thread! indexing-thread))

        ;; need a new indexing thread, start it up
        (when (or (nil? indexing-index) (not (.isAlive indexing-thread)))
          (log/info "Starting new indexing thread")
          (let [new-indexing-state  (init-indexing-state metadata-row)
                ;; virtual thread could also be good here, most time will be blocking on I/O
                new-indexing-thread (Thread. ^Runnable (fn [] (indexing-loop pgvector index-metadata index new-indexing-state)))
                thread-name         (format "%s--indexing-%s"
                                            (.getName (Thread/currentThread))
                                            (:table-name index))]
            (.setDaemon new-indexing-thread true)
            (.setName new-indexing-thread thread-name)
            (vswap! control-state assoc :indexing-index index :indexing-thread new-indexing-thread :indexing-state new-indexing-state)
            (.start new-indexing-thread)))))))

(defn- on-control-interrupted [control-state]
  (log/info "Indexer control thread interrupted, exiting...")
  (some-> @control-state :indexing-thread interrupt-indexing-thread!)
  (log/info "Indexer control thread exited gracefully"))

(defn- on-control-idle [] (sleep 10000))

(defn control-loop [pgvector index-metadata control-state]
  (loop []
    (if (.isInterrupted (Thread/currentThread))
      (on-control-interrupted control-state)
      (let [interrupted (or (try
                              (control-step pgvector index-metadata control-state)
                              false
                              (catch InterruptedException _
                                (log/info "Indexer control thread interrupted while processing")
                                true))
                            (try
                              (on-control-idle)
                              false
                              (catch InterruptedException _
                                (log/info "Indexer control thread interrupted while idling")
                                true)))]
        (if interrupted
          (on-control-interrupted control-state)
          (recur))))))

(defn initial-control-state []
  (volatile! {}))

(comment
  (def pgvector ((requiring-resolve 'metabase-enterprise.semantic-search.env/get-pgvector-datasource!)))
  (def index-metadata ((requiring-resolve 'metabase-enterprise.semantic-search.env/get-index-metadata)))

  (def control-state (initial-control-state))
  @control-state

  (control-step pgvector index-metadata control-state)
  @control-state
  (.isAlive (:indexing-thread @control-state))
  (interrupt-indexing-thread! (:indexing-thread @control-state))

  (def control-state (initial-control-state))
  (def control-thread (Thread. #(control-loop pgvector index-metadata control-state)))
  (.start control-thread)
  (.interrupt control-thread)
  (.isAlive control-thread))

(defn init-process-map! []
  (volatile! {:shutting-down false
              :processes     {}}))

(defn shutdown!
  [process-map & {:keys [shutdown-wait-duration] :or {shutdown-wait-duration (Duration/ofSeconds 30)}}]
  (vswap! process-map assoc :shutting-down true)
  (doseq [[process-key {:keys [^Thread control-thread]}] (:processes @process-map)]
    (log/info "Interrupting index control thread")
    (.interrupt control-thread)
    (when-not (.join control-thread ^Duration shutdown-wait-duration)
      ;; abort will happen anyway as it is a daemon thread
      (log/warnf "Index control thread %s did not respond to shutdown in %s, will be aborted instead." control-thread shutdown-wait-duration))
    ;; just so the change is observable (e.g. for tests)
    (vswap! process-map update :processes dissoc process-key)))

(defn heartbeat! [process-map
                  pgvector
                  index-metadata]
  (log/info "Indexer heartbeat")
  (let [{:keys [processes shutting-down]} process-map
        process-key [pgvector index-metadata]]
    (when shutting-down
      (log/info "Shutdown detected, skipping heartbeat"))
    (when-not shutting-down
      (let [{:keys [^Thread control-thread
                    control-state]}
            (get processes process-key)
            dead-control-thread (some-> control-thread .isAlive false?)
            start               (or dead-control-thread (nil? control-thread))]
        (when dead-control-thread
          (log/info "Control thread unexpectedly dead")
          (when-some [indexing-thread (:indexing-thread @control-state)]
            (log/info "Interrupting orphaned indexing thread")
            (interrupt-indexing-thread! indexing-thread)))
        (when start
          (log/info "Starting indexer control loop")
          (let [control-state  (initial-control-state)
                control-thread (doto (Thread. ^Runnable (fn [] (control-loop pgvector index-metadata control-state)))
                                 (.setDaemon true)
                                 (.setName (str "indexer-control-thread--" (:metadata-table-name index-metadata))))]
            (vswap! process-map assoc-in [:processes process-key] {:control-thread control-thread :control-state control-state})
            (.start control-thread)))))))

(comment
  (def proc-map (init-process-map!))
  @proc-map

  (heartbeat! proc-map
              pgvector
              index-metadata)

  @proc-map
  (shutdown! proc-map))
