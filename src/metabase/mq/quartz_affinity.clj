(ns metabase.mq.quartz-affinity
  "Node-affinity for the Quartz-backed queue backend.

  Quartz clustering has no native node-affinity: every node sharing the JDBC job store is an
  interchangeable worker, so a fired queue trigger can land on a node that has no listener for that
  queue. Rather than execute-then-bounce, we make a node simply *not acquire* triggers for queues it
  can't currently handle — they stay `WAITING` in the shared store until a capable node's acquire
  loop takes them.

  The hook is a `DriverDelegate` subclass that overrides just `selectTriggerToAcquire`
  ([[select-trigger-to-acquire]]): it re-issues Quartz's own acquire query with this node's capability
  predicate spliced into the `WHERE` clause, so uncapable queue triggers are never selected. Only the
  queue job-group ([[queue-job-group]]) is gated; every other Quartz job (sync, pulses, …) is acquired
  exactly as before."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.classloader.core :as classloader]
   [metabase.util.log :as log])
  (:import
   (java.math BigDecimal)
   (java.net URL)
   (java.sql Connection PreparedStatement ResultSet)
   (org.quartz TriggerKey)
   (org.quartz.impl.jdbcjobstore Constants StdJDBCConstants)))

(set! *warn-on-reflection* true)

(def queue-job-group
  "Quartz job group every queue job lives in. MUST match `metabase.mq.queue.quartz`'s `job-group`
  (a test asserts they agree)."
  "metabase.mq.queue")

;; A fn returning the set of queue job-names (a Quartz queue job's name is `(name channel)`) this node
;; currently has a listener for — or the sentinel :all to disable filtering. Default :all so that
;; until the mq subsystem wires this up (and as a safe fallback) acquisition behaves exactly like
;; stock Quartz.
(defonce ^:private capability-fn* (atom (constantly :all)))

(defn set-capability-fn!
  "Install the fn the acquisition filter consults for this node's currently-listenable queue names.
  Must return a set of job-name strings, or :all to disable filtering."
  [f]
  (reset! capability-fn* f))

(defn- capable [] (@capability-fn*))

(defn- sql-quote ^String [s]
  (str \' (str/replace (str s) "'" "''") \'))

(defn rewrite-acquisition-sql
  "Splice a capability predicate into acquisition `sql` so this node only acquires queue triggers
  whose `job_name` is in `capable-names` — or none of them when the set is empty. `:all` returns
  `sql` unchanged. Non-queue jobs are never filtered (the `job_group <> queue-job-group` branch is
  always true for them). Capability names are inlined (escaped), so the query's existing `?`
  parameters are untouched."
  ^String [^String sql capable-names]
  (let [clause (cond
                 (= capable-names :all) nil
                 (empty? capable-names) (str "(job_group <> " (sql-quote queue-job-group) ")")
                 :else                  (str "(job_group <> " (sql-quote queue-job-group)
                                             " OR job_name IN ("
                                             (str/join ", " (map sql-quote capable-names)) "))"))]
    (if clause
      (str/replace-first sql #"(?i)\s+order\s+by" (str " AND " clause " ORDER BY"))
      sql)))

(defn select-trigger-to-acquire
  "Re-implementation of Quartz's `StdJDBCDelegate.selectTriggerToAcquire` with this node's queue-affinity
  predicate baked straight into the acquire query's `WHERE`, so a node simply never *acquires* a queue
  trigger it has no listener for. Both affinity delegates call this — `StdJDBCDelegate` (H2/MySQL) and
  `PostgreSQLDelegate` (Postgres) inherit an identical `selectTriggerToAcquire`, so nothing here is
  db-specific.

  `rtp` is the delegate's own table-prefix / sched-name substitution (its protected `rtp`). We run it
  on the stock query *first* and splice the predicate in *after*, because `rtp` is `MessageFormat`-based
  and would otherwise eat the single quotes around our inlined queue names.

  Returns a `java.util.List` of `TriggerKey` (a Clojure vector, which Quartz only iterates) — matching
  the method it overrides."
  ^java.util.List [^Connection conn no-later no-earlier max-count rtp]
  (let [max-count (int (max 1 (long max-count)))
        sql       ^String (rewrite-acquisition-sql (rtp StdJDBCConstants/SELECT_NEXT_TRIGGER_TO_ACQUIRE)
                                                   (capable))]
    (with-open [ps (doto (.prepareStatement conn sql)
                     (.setMaxRows max-count)
                     (.setFetchSize max-count)
                     (.setString 1 Constants/STATE_WAITING)
                     (.setBigDecimal 2 (BigDecimal. (str no-later)))
                     (.setBigDecimal 3 (BigDecimal. (str no-earlier))))
                rs (.executeQuery ^PreparedStatement ps)]
      (loop [acc []]
        (if (and (.next ^ResultSet rs) (< (count acc) max-count))
          (recur (conj acc (TriggerKey. (.getString ^ResultSet rs Constants/COL_TRIGGER_NAME)
                                        (.getString ^ResultSet rs Constants/COL_TRIGGER_GROUP))))
          acc)))))

;;; ---------------------------------------------------------------------------------------------
;;; Delegate installation
;;;
;;; The affinity delegate is a `gen-class` subclass. In the uberjar it is AOT-compiled by the build;
;;; in dev there is no AOT, so we compile it at runtime into a temp dir and add that to the classpath
;;; (Metabase's classloader is dynamic). Either way the class is then loadable by name, which is how
;;; Quartz instantiates a `driverDelegateClass`.

(def ^:private delegate-class-name
  "Affinity `DriverDelegate` subclass to use per app-db type. Postgres must extend `PostgreSQLDelegate`
  (BLOB handling); H2/MySQL extend `StdJDBCDelegate`."
  {:postgres "metabase.mq.QueueAffinityPostgresDelegate"})

(def ^:private default-delegate-class-name "metabase.mq.QueueAffinityStdDelegate")

(def ^:private base-delegate-class-name
  "The plain Quartz delegate to fall back to (no affinity) if the affinity subclass can't be
  loaded/compiled — so the scheduler always starts. Mirrors Metabase's normal per-DB choice."
  {:postgres "org.quartz.impl.jdbcjobstore.PostgreSQLDelegate"})

(def ^:private default-base-delegate-class-name "org.quartz.impl.jdbcjobstore.StdJDBCDelegate")

(def ^:private delegate-ns
  {"metabase.mq.QueueAffinityPostgresDelegate" 'metabase.mq.quartz-affinity-delegate-postgres
   "metabase.mq.QueueAffinityStdDelegate"      'metabase.mq.quartz-affinity-delegate-std})

(def ^:private driver-delegate-property "org.quartz.jobStore.driverDelegateClass")

(defn- class-loadable? [^String class-name]
  (try
    (boolean (Class/forName class-name false (classloader/the-classloader)))
    (catch ClassNotFoundException _ false)))

(defn- compile-delegate! [ns-sym]
  ;; compile into a temp dir added to the (dynamic) classpath, so the gen-class is loadable by name
  (let [dir (io/file (System/getProperty "java.io.tmpdir") "mb-quartz-delegate")]
    (.mkdirs dir)
    (classloader/add-url-to-classpath! ^URL (-> dir .toURI .toURL))
    (binding [*compile-path* (str dir)]
      (compile ns-sym))))

(defn ensure-delegate-loadable!
  "Ensure the affinity `DriverDelegate` subclass for `db-type` is loadable — already AOT-compiled in
  the uberjar, runtime-compiled into the classpath in dev — and return its class name. No global side
  effects beyond adding the compiled class to the classpath (idempotent)."
  [db-type]
  (let [class-name (get delegate-class-name db-type default-delegate-class-name)]
    (when-not (class-loadable? class-name)
      (compile-delegate! (delegate-ns class-name))
      (log/infof "Compiled Quartz queue-affinity delegate %s" class-name))
    class-name))

(defn install-delegate!
  "Ensure the affinity `DriverDelegate` for `db-type` is loadable and set it as Quartz's
  `driverDelegateClass`. Must run before the scheduler initializes. If the affinity delegate can't be
  loaded/compiled for any reason, falls back to the plain per-DB delegate (node affinity disabled) so
  the scheduler still starts. Returns the installed class name."
  [db-type]
  (let [class-name (try
                     (ensure-delegate-loadable! db-type)
                     (catch Throwable t
                       (let [fallback (get base-delegate-class-name db-type default-base-delegate-class-name)]
                         (log/warn t (str "Could not install Quartz queue-affinity delegate; falling back to "
                                          fallback " (queue node-affinity disabled)"))
                         fallback)))]
    (System/setProperty driver-delegate-property class-name)
    class-name))
