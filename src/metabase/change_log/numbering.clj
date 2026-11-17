(ns metabase.change-log.numbering
  "Gives `change_log` entries their monotonically increasing `position`.

  Each node numbers on a thread of its own. The first logged write starts it, and the global system stops it. A logged
  write keeps it awake with [[stay-awake!]] when its transaction commits: it numbers every 5 seconds until a minute
  passes with no logged write. A node that logs nothing runs no query."
  (:require
   [metabase.app-db.cluster-lock :as cluster-lock]
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
  "How many entries one UPDATE numbers: 1,000, or one on MariaDB. There an update of many rows can wait for rows that
  open transactions inserted (`ids-out-of-order-test`)."
  []
  (if (change-log.db/mariadb?) 1 1000))

(defn- number-entries!
  "Numbers up to 10,000 committed entries that have no position, and returns how many. The first gets the clock in
  microseconds, or the next free position if that is higher, and the rest rise with their ids."
  []
  (if (seq (change-log.db/unnumbered-ids 1))
    (cluster-lock/with-cluster-lock ::number-entries
      (let [ids (change-log.db/unnumbered-ids batch-size)]
        (when (seq ids)
          (let [start (max (* 1000 (System/currentTimeMillis))
                           (inc (or (change-log.db/highest-position) 0)))]
            (doseq [statement-ids (partition-all (statement-size) ids)]
              (change-log.db/set-positions! statement-ids start (first ids)))))
        (count ids)))
    0))

;; The numbering of this node: `{:executor ..., :awake-until ...}`. `:awake-until` is an atom that holds when the
;; numbering goes to sleep, in milliseconds since the epoch.
(def ^:private numbering-component
  (system/mutable-component-handle ::numbering (constantly nil)))

(defn- number-while-awake!
  "What the executor runs every 5 seconds. It numbers the entries, unless the numbering is asleep."
  [awake-until]
  (try
    (when (< (System/currentTimeMillis) @awake-until)
      ;; A full batch means that more entries may wait, as after the delete of a large database.
      (while (= batch-size (number-entries!))))
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
  system has halted. Then the entry gets a position after the next logged write."
  []
  (try
    (let [{:keys [awake-until]} (system/ensure-started! numbering-component start-numbering stop-numbering)]
      (reset! awake-until (+ (System/currentTimeMillis) awake-ms)))
    (catch Exception e
      (log/debug e "Could not wake the change log numbering.")))
  nil)
