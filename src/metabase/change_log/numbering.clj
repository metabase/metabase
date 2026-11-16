(ns metabase.change-log.numbering
  "Gives `change_log` entries their monotonically increasing `position`.

  Each node numbers on a thread of its own. A logged write wakes it with [[stay-awake!]], and it numbers every 5
  seconds until a minute passes with no logged write. A node that logs nothing runs no query.

  The write is still in its transaction when it wakes the numbering, and the minute gives it time to commit. An entry
  that commits later than that gets its position after the next logged write, on any node."
  (:require
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.change-log.db :as change-log.db]
   [metabase.util.log :as log]))

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
  "Numbers the committed entries that have no position. The first gets the clock in microseconds, or the next free
  position if that is higher, and the rest rise with their ids."
  []
  (when (seq (change-log.db/unnumbered-ids 1))
    (cluster-lock/with-cluster-lock ::number-entries
      (when-let [ids (seq (change-log.db/unnumbered-ids batch-size))]
        (let [start (max (* 1000 (System/currentTimeMillis))
                         (inc (or (change-log.db/highest-position) 0)))]
          (doseq [statement-ids (partition-all (statement-size) ids)]
            (change-log.db/set-positions! statement-ids start (first ids))))))))

(defonce ^{:private true
           :doc     "When the numbering goes to sleep, in milliseconds since the epoch. Nil while it is asleep."}
  awake-until
  (atom nil))

(defn- number-while-awake! []
  (loop []
    (try
      (number-entries!)
      (catch Throwable e
        (log/warn e "Could not number the change log entries.")))
    (let [until @awake-until]
      ;; We go to sleep when the time is up, unless a write moved the time while we looked.
      (when-not (and (<= until (System/currentTimeMillis))
                     (compare-and-set! awake-until until nil))
        (Thread/sleep (long interval-ms))
        (recur)))))

(defn stay-awake!
  "Keeps the numbering awake for the next minute, and wakes it if it is asleep."
  []
  (let [[before] (reset-vals! awake-until (+ (System/currentTimeMillis) awake-ms))]
    (when-not before
      ;; A new thread, so that it numbers outside the transaction of the write that wakes it.
      (doto (Thread. ^Runnable number-while-awake! "change-log-numbering")
        (.setDaemon true)
        (.start)))))
