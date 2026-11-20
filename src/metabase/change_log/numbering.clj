(ns metabase.change-log.numbering
  "Gives `change_log` entries their monotonically increasing `position`.

  Each node numbers on a thread of its own. The first logged write starts it, and the global system stops it. A logged
  write keeps it awake with [[stay-awake!]]: it numbers every 5 seconds until a minute passes with no logged write. A
  node that logs nothing runs no query.

  The write is still in its transaction when it wakes the numbering, and the minute gives it time to commit. An entry
  that commits later than that gets its position after the next logged write, on any node."
  (:require
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.app-db.core :as mdb]
   [metabase.change-log.db :as change-log.db]
   [metabase.global-system.system :as system]
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent Executors ScheduledExecutorService ThreadFactory TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:private awake-ms 60000)

(def ^:private interval-ms 5000)

(def ^:private batch-size 10000)

(defn- statement-size
  "How many entries one UPDATE numbers: 1,000, or one on MariaDB."
  []
  ;; On MariaDB an update of many rows can wait for rows that open transactions inserted (`ids-out-of-order-test`).
  (if (mdb/mariadb?) 1 1000))

(defn- number-entries!
  "Numbers the committed entries that have no position. The first gets the clock in microseconds, or the next free
  position if that is higher, and the rest rise with their ids."
  []
  (when (seq (change-log.db/unnumbered-ids 1))
    ;; Before the lock: the first call on a node can take a connection of its own to read the product name.
    (let [size (statement-size)]
      (cluster-lock/with-cluster-lock ::number-entries
        (when-let [ids (seq (change-log.db/unnumbered-ids batch-size))]
          (let [start (max (* 1000 (System/currentTimeMillis))
                           (inc (or (change-log.db/highest-position) 0)))]
            (doseq [statement-ids (partition-all size ids)]
              (change-log.db/set-positions! statement-ids start (first ids)))))))))

;; The numbering of this node: `{:executor ..., :awake-until ...}`. `:awake-until` is an atom that holds when the
;; numbering goes to sleep, in milliseconds since the epoch.
(def ^:private numbering-component
  (system/mutable-component-handle ::numbering (constantly nil)))

(defn- number-while-awake!
  "What the executor runs every 5 seconds. It numbers the entries, unless the numbering is asleep."
  [awake-until]
  (try
    (when (< (System/currentTimeMillis) @awake-until)
      (number-entries!))
    (catch Throwable e
      (log/warn e "Could not number the change log entries."))))

(defn- start-numbering []
  (let [awake-until (atom 0)]
    {:awake-until awake-until
     :executor    (doto (Executors/newSingleThreadScheduledExecutor
                         (reify ThreadFactory
                           (newThread [_ r]
                             (doto (Thread. r "change-log-numbering")
                               (.setDaemon true)))))
                    (.scheduleWithFixedDelay ^Runnable #(number-while-awake! awake-until)
                                             (long interval-ms) (long interval-ms) TimeUnit/MILLISECONDS))}))

(defn- stop-numbering [{:keys [^ScheduledExecutorService executor]}]
  (.shutdownNow executor)
  (when-not (.awaitTermination executor 5 TimeUnit/SECONDS)
    (log/warn "The change log numbering did not stop within 5s.")))

(defn stay-awake!
  "Keeps the numbering awake for the next minute, and starts it on the first call. It cannot start once the global
  system has halted. Then the write goes ahead, and its entry gets a position after the next logged write."
  []
  (try
    (let [{:keys [awake-until]} (system/ensure-started! numbering-component start-numbering stop-numbering)]
      (reset! awake-until (+ (System/currentTimeMillis) awake-ms)))
    (catch Exception e
      (log/debug e "Could not wake the change log numbering.")))
  nil)
