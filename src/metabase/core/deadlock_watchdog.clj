(ns metabase.core.deadlock-watchdog
  "A background check for stuck JVM threads, run every [[core.settings/deadlock-watchdog-interval-seconds]]. It looks
  for two different things:

  - A deadlock: a cycle of threads each waiting for a lock another holds, so none of them can ever run again. One
    ERROR event per cycle, with each thread's name, state, held locks and top frames; then, on the second consecutive
    check that finds a deadlock, exit the JVM with code 3 (unless [[core.settings/deadlock-watchdog-exit]] is false).
  - A long block: a single thread that has been `BLOCKED` on the same monitor for longer than
    [[default-long-block-threshold-ms]]. Its owner is still runnable, so this may be legitimate; warn, naming the
    owner, and never exit."
  (:require
   [clojure.string :as str]
   [metabase.config.core :as config]
   [metabase.core.settings :as core.settings]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.lang.management ManagementFactory MonitorInfo ThreadInfo ThreadMXBean)
   (java.util.concurrent ScheduledThreadPoolExecutor ThreadFactory TimeUnit)))

(set! *warn-on-reflection* true)

;; distinct from init failure's 1, so the reason is visible in the container's last state
(def ^:private exit-code 3)

(def ^:private max-frames 12)

(def ^:private relog-interval-ms
  "How long after logging a deadlock cycle or a long block it is logged again if it persists."
  (* 5 60 1000))

(def ^:private default-long-block-threshold-ms
  "How long a thread may stay `BLOCKED` on one monitor before the watchdog warns about it."
  (* 300 1000))

(def ^:private halt-fallback-ms
  "How long the orderly exit gets before the JVM is halted."
  30000)

(def ^:private initial-state
  {:cycles      {}   ; #{thread-id} -> ms the cycle was last logged
   :consecutive 0    ; consecutive checks that found a deadlock
   :blocked     {}}) ; thread-id -> {:lock lock-name, :blocked-count n, :since ms, :warned-at ms}

(def ^:private BlockedEntry
  [:map {:closed true}
   [:lock :string]
   [:blocked-count :int]
   [:since :int]
   [:warned-at {:optional true} :int]])

(def ^:private State
  [:map {:closed true}
   [:cycles [:map-of [:set :int] :int]]
   [:consecutive :int]
   [:blocked [:map-of :int BlockedEntry]]])

(def ^:private Opts
  [:map {:closed true}
   [:thread-bean (ms/InstanceOfClass ThreadMXBean)]
   [:now :int]
   [:exit? :boolean]
   [:exit! fn?]
   [:long-block-threshold-ms {:optional true} :int]])

;;; Describing threads

(defn- thread-info ^ThreadInfo [^ThreadMXBean thread-bean thread-id]
  (first (.getThreadInfo thread-bean (long-array [thread-id]) (int max-frames))))

(defn- frame-lines [^ThreadInfo info]
  (for [^StackTraceElement frame (take max-frames (.getStackTrace info))]
    (str "    at " frame)))

(defn- thread-description [^ThreadInfo info]
  (str/join "\n"
            (concat
             [(format "Thread \"%s\" (id %d) %s%s"
                      (.getThreadName info)
                      (.getThreadId info)
                      (.getThreadState info)
                      (if-let [lock (.getLockName info)]
                        (format " waiting on %s owned by \"%s\" (id %d)"
                                lock (.getLockOwnerName info) (.getLockOwnerId info))
                        ""))
              (str "  holds monitors: "
                   (or (not-empty (str/join ", " (for [^MonitorInfo m (.getLockedMonitors info)]
                                                   (format "%s (at %s)" m (.getLockedStackFrame m)))))
                       "none"))
              (str "  holds synchronizers: "
                   (or (not-empty (str/join ", " (map str (.getLockedSynchronizers info))))
                       "none"))]
             (frame-lines info))))

;;; Deadlock cycles

(defn- cycle-of
  "The ids of the deadlock cycle `thread-id` is part of: follow the lock-owner links until they come back round."
  [id->info thread-id]
  (loop [id  thread-id
         ids #{}]
    (if (or (contains? ids id) (nil? (id->info id)))
      ids
      (recur (.getLockOwnerId ^ThreadInfo (id->info id)) (conj ids id)))))

(defn- log-cycle! [id->info ids]
  (log/error (str/join "\n"
                       (cons (format "Deadlock detected: %d threads are deadlocked and will never make progress"
                                     (count ids))
                             (map (comp thread-description id->info) (sort ids))))))

(defn- check-deadlocks! [state {:keys [^ThreadMXBean thread-bean now exit? exit!]}]
  (if-let [ids (.findDeadlockedThreads thread-bean)]
    (let [id->info    (into {} (for [^ThreadInfo info (.getThreadInfo thread-bean ids true true (int max-frames))
                                     :when info]
                                 [(.getThreadId info) info]))
          cycles      (into #{} (map #(cycle-of id->info %)) (keys id->info))
          consecutive (inc (:consecutive state))
          state       (reduce (fn [state cycle]
                                (let [last-logged (get-in state [:cycles cycle])]
                                  (if (or (nil? last-logged) (>= (- now last-logged) relog-interval-ms))
                                    (do (log-cycle! id->info cycle)
                                        (assoc-in state [:cycles cycle] now))
                                    state)))
                              (assoc state :consecutive consecutive :cycles (select-keys (:cycles state) cycles))
                              cycles)]
      ;; exactly once: later checks during the exit must not start more exit threads
      (when (and exit? (= consecutive 2))
        (log/errorf "Deadlock watchdog: the deadlock persists; exiting with code %d so the process can be restarted"
                    exit-code)
        (exit! exit-code))
      state)
    (assoc state :consecutive 0 :cycles {})))

;;; Long monitor waits

(defn- blocked-threads
  "thread-id -> `{:lock lock-name, :blocked-count n}` for every thread currently `BLOCKED` entering a monitor."
  [^ThreadMXBean thread-bean]
  (into {} (for [^ThreadInfo info (.getThreadInfo thread-bean (.getAllThreadIds thread-bean) (int 0))
                 :when (and info (= Thread$State/BLOCKED (.getThreadState info)) (.getLockName info))]
             [(.getThreadId info) {:lock (.getLockName info), :blocked-count (.getBlockedCount info)}])))

(defn- warn-long-block! [^ThreadMXBean thread-bean thread-id lock blocked-ms]
  (when-let [info (thread-info thread-bean thread-id)]
    (let [owner-id (.getLockOwnerId info)
          owner    (when (pos? owner-id) (thread-info thread-bean owner-id))]
      (log/warn (str/join "\n"
                          (concat
                           [(format "Thread \"%s\" (id %d) has been BLOCKED on %s for %d s, owned by \"%s\" (id %d)"
                                    (.getThreadName info) thread-id lock (quot blocked-ms 1000)
                                    (.getLockOwnerName info) owner-id)]
                           (frame-lines info)
                           (when owner
                             [(str "The owner, " (thread-description owner))])))))))

(defn- check-long-blocks! [state {:keys [thread-bean now long-block-threshold-ms]
                                  :or   {long-block-threshold-ms default-long-block-threshold-ms}}]
  (let [blocked (into {}
                      (for [[thread-id current] (blocked-threads thread-bean)
                            :let [previous (get-in state [:blocked thread-id])]]
                        ;; the blocked count only advances when the thread enters BLOCKED again, so an unchanged
                        ;; count on the same lock means one uninterrupted wait rather than repeated short ones
                        [thread-id (if (= current (select-keys previous [:lock :blocked-count]))
                                     previous
                                     (assoc current :since now))]))
        blocked (into {}
                      (for [[thread-id {:keys [lock since warned-at] :as entry}] blocked
                            :let [blocked-ms (- now since)
                                  warn?      (and (> blocked-ms long-block-threshold-ms)
                                                  (or (nil? warned-at) (>= (- now warned-at) relog-interval-ms)))]]
                        (do (when warn?
                              (warn-long-block! thread-bean thread-id lock blocked-ms))
                            [thread-id (cond-> entry warn? (assoc :warned-at now))])))]
    (assoc state :blocked blocked)))

;;; One check

(mu/defn- tick! :- State
  "Run one watchdog check over `state` and return the new state. `:exit!` is called with the exit code once a
  deadlock has been seen on two consecutive checks and `:exit?` is true."
  [state :- State
   opts  :- Opts]
  (-> state
      (check-deadlocks! opts)
      (check-long-blocks! opts)))

;;; Exiting

(defn- start-daemon-thread! [^String thread-name f]
  (doto (Thread. ^Runnable f thread-name)
    (.setDaemon true)
    (.start)))

(defn- exit-jvm!
  "Exit on fresh threads: the orderly exit first, then a halt if the JVM is still up after [[halt-fallback-ms]]."
  [code]
  ;; The orderly exit runs the shutdown hooks; one that needs the deadlocked lock would hang there, and the watchdog
  ;; thread itself must not be the one stuck in System/exit.
  (start-daemon-thread! "deadlock-watchdog-exit" (fn [] (System/exit code)))
  (start-daemon-thread! "deadlock-watchdog-halt"
                        (fn []
                          (Thread/sleep (long halt-fallback-ms))
                          (log/errorf "Deadlock watchdog: orderly exit did not finish in %d s; halting"
                                      (quot halt-fallback-ms 1000))
                          (.halt (Runtime/getRuntime) code))))

;;; Lifecycle

(defonce ^:private executor-atom (atom nil))

(defn- daemon-executor ^ScheduledThreadPoolExecutor []
  (ScheduledThreadPoolExecutor. 1
                                (reify ThreadFactory
                                  (newThread [_ r]
                                    (doto (Thread. r "deadlock-watchdog")
                                      (.setDaemon true))))))

(defn- check-fn
  "The scheduled check. `state` is only ever touched from the executor's single thread."
  ^Runnable [thread-bean exit?]
  (let [state (atom initial-state)]
    (fn []
      (try
        (reset! state (tick! @state {:thread-bean thread-bean
                                     :now         (System/currentTimeMillis)
                                     :exit?       exit?
                                     :exit!       exit-jvm!}))
        (catch Throwable e
          (log/warn e "Deadlock watchdog check failed"))))))

(defn start!
  "Start the watchdog unless it is already running or we are under test."
  []
  (when-not (or config/is-test? @executor-atom)
    ;; Both settings are env-only, so read them once here rather than on every tick: reading a setting later may
    ;; touch the settings cache and the application database, which a deadlock can involve.
    (let [interval-s (core.settings/deadlock-watchdog-interval-seconds)
          exit?      (core.settings/deadlock-watchdog-exit)
          executor   (daemon-executor)]
      (.scheduleAtFixedRate executor
                            (check-fn (ManagementFactory/getThreadMXBean) exit?)
                            (long interval-s)
                            (long interval-s)
                            TimeUnit/SECONDS)
      (reset! executor-atom executor)
      (log/infof "Deadlock watchdog started: checking every %d s, exit on a persistent deadlock: %s"
                 interval-s exit?))))

(defn stop!
  "Stop the watchdog if it is running."
  []
  (when-let [^ScheduledThreadPoolExecutor executor @executor-atom]
    (.shutdownNow executor)
    (reset! executor-atom nil)))
