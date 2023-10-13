(ns metabase.sync.util
  "Utility functions and macros to abstract away some common patterns and operations across the sync processes, such
  as logging start/end messages."
  (:require
   [clojure.math.numeric-tower :as math]
   [clojure.string :as str]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.events :as events]
   [metabase.models.database :refer [Database]]
   [metabase.models.field :refer [Field]]
   [metabase.models.interface :as mi]
   [metabase.models.table :refer [Table]]
   [metabase.models.task-history :refer [TaskHistory]]
   [metabase.query-processor.interface :as qp.i]
   [metabase.sync.interface :as i]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan.db :as db]
   [toucan2.core :as t2])
  (:import
   (java.time.temporal Temporal)))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          SYNC OPERATION "MIDDLEWARE"                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

;; When using the `sync-operation` macro below the BODY of the macro will be executed in the context of several
;; different functions below that do things like prevent duplicate operations from being ran simultaneously and taking
;; care of things like event publishing, error handling, and logging.
;;
;; These basically operate in a middleware pattern, where the various different steps take a function, and return a
;; new function that will execute the original in whatever context or with whatever side effects appropriate for that
;; step.


;; This looks something like {:sync #{1 2}, :cache #{2 3}} when populated.
;; Key is a type of sync operation, e.g. `:sync` or `:cache`; vals are sets of DB IDs undergoing that operation.
;;
;; TODO - as @salsakran mentioned it would be nice to do this via the DB so we could better support multi-instance
;; setups in the future
(defonce ^:private operation->db-ids (atom {}))

(defn with-duplicate-ops-prevented
  "Run `f` in a way that will prevent it from simultaneously being ran more for a single database more than once for a
  given `operation`. This prevents duplicate sync-like operations from taking place for a given DB, e.g. if a user
  hits the `Sync` button in the admin panel multiple times.

    ;; Only one `sync-db!` for `database-id` will be allowed at any given moment; duplicates will be ignored
    (with-duplicate-ops-prevented :sync database-id
      #(sync-db! database-id))"
  {:style/indent 2}
  [operation database-or-id f]
  (fn []
    (when-not (contains? (@operation->db-ids operation) (u/the-id database-or-id))
      (try
        ;; mark this database as currently syncing so we can prevent duplicate sync attempts (#2337)
        (swap! operation->db-ids update operation #(conj (or % #{}) (u/the-id database-or-id)))
        (log/debug "Sync operations in flight:" (m/filter-vals seq @operation->db-ids))
        ;; do our work
        (f)
        ;; always take the ID out of the set when we are through
        (finally
          (swap! operation->db-ids update operation #(disj % (u/the-id database-or-id))))))))


(defn- with-sync-events
  "Publish events related to beginning and ending a sync-like process, e.g. `:sync-database` or `:cache-values`, for a
  DATABASE-ID. F is executed between the logging of the two events."
  ;; we can do everyone a favor and infer the name of the individual begin and sync events
  ([event-name-prefix database-or-id f]
   (with-sync-events
    (keyword (str (name event-name-prefix) "-begin"))
    (keyword (str (name event-name-prefix) "-end"))
    database-or-id
    f))
  ([begin-event-name end-event-name database-or-id f]
   (fn []
     (let [start-time    (System/nanoTime)
           tracking-hash (str (java.util.UUID/randomUUID))]
       (events/publish-event! begin-event-name {:database_id (u/the-id database-or-id), :custom_id tracking-hash})
       (let [return        (f)
             total-time-ms (int (/ (- (System/nanoTime) start-time)
                                   1000000.0))]
         (events/publish-event! end-event-name {:database_id  (u/the-id database-or-id)
                                                :custom_id    tracking-hash
                                                :running_time total-time-ms})
         return)))))

(defn- with-start-and-finish-logging*
  "Logs start/finish messages using `log-fn`, timing `f`"
  {:style/indent 1}
  [log-fn message f]
  (let [start-time (System/nanoTime)
        _          (log-fn (u/format-color 'magenta "STARTING: %s" message))
        result     (f)]
    (log-fn (u/format-color 'magenta "FINISHED: %s (%s)"
              message
              (u/format-nanoseconds (- (System/nanoTime) start-time))))
    result))

(defn- with-start-and-finish-logging
  "Log MESSAGE about a process starting, then run F, and then log a MESSAGE about it finishing.
   (The final message includes a summary of how long it took to run F.)"
  {:style/indent 1}
  [message f]
  (fn []
    (with-start-and-finish-logging* #(log/info %) message f)))

(defn with-start-and-finish-debug-logging
  "Similar to `with-start-and-finish-logging except invokes `f` and returns its result and logs at the debug level"
  [message f]
  (with-start-and-finish-logging* #(log/info %) message f))

(defn- with-db-logging-disabled
  "Disable all QP and DB logging when running BODY. (This should be done for *all* sync-like processes to avoid
  cluttering the logs.)"
  {:style/indent 0}
  [f]
  (fn []
    (binding [qp.i/*disable-qp-logging* true
              db/*disable-db-logging*  true]
      (f))))

(defn- sync-in-context
  "Pass the sync operation defined by `body` to the `database`'s driver's implementation of `sync-in-context`.
  This method is used to do things like establish a connection or other driver-specific steps needed for sync
  operations."
  {:style/indent 1}
  [database f]
  (fn []
    (driver/sync-in-context (driver.u/database->driver database) database
      f)))

(def ^:private exception-classes-not-to-retry
  ;;TODO: future, expand this to `driver` level, where the drivers themselves can add to the
  ;; list of exception classes (like, driver-specific exceptions)
  [java.net.ConnectException java.net.NoRouteToHostException java.net.UnknownHostException
   com.mchange.v2.resourcepool.CannotAcquireResourceException
   javax.net.ssl.SSLHandshakeException])

(def ^:dynamic *log-exceptions-and-continue?*
  "Whether to log exceptions during a sync step and proceed with the rest of the sync process. This is the default
  behavior. You can disable this for debugging or test purposes."
  true)

(defn do-with-error-handling
  "Internal implementation of `with-error-handling`; use that instead of calling this directly."
  ([f]
   (do-with-error-handling (trs "Error running sync step") f))

  ([message f]
   (try
     (f)
     (catch Throwable e
       (if *log-exceptions-and-continue?*
         (do
           (log/warn e message)
           e)
         (throw (ex-info (format "%s: %s" message (ex-message e)) {} e)))))))

(defmacro with-error-handling
  "Execute `body` in a way that catches and logs any Exceptions thrown, and returns `nil` if they do so. Pass a
  `message` to help provide information about what failed for the log message.

  The exception classes in `exception-classes-not-to-retry` are a list of classes tested against exceptions thrown.
  If there is a match found, the sync is aborted as that error is not considered recoverable for this sync run."
  {:style/indent 1}
  [message & body]
  `(do-with-error-handling ~message (fn [] ~@body)))

(defn do-sync-operation
  "Internal implementation of `sync-operation`; use that instead of calling this directly."
  [operation database message f]
  ((with-duplicate-ops-prevented operation database
     (with-sync-events operation database
       (with-start-and-finish-logging message
         (with-db-logging-disabled
           (sync-in-context database
             (partial do-with-error-handling (trs "Error in sync step {0}" message) f))))))))

(defmacro sync-operation
  "Perform the operations in `body` as a sync operation, which wraps the code in several special macros that do things
  like error handling, logging, duplicate operation prevention, and event publishing. Intended for use with the
  various top-level sync operations, such as `sync-metadata` or `analyze`."
  {:style/indent 3}
  [operation database message & body]
  `(do-sync-operation ~operation ~database ~message (fn [] ~@body)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              EMOJI PROGRESS METER                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;; This is primarily provided because it makes sync more fun to look at. The functions below make it fairly simple to
;; log a progress bar with a corresponding emoji when iterating over a sequence of objects during sync, e.g. syncing
;; all the Tables in a given Database.

(def ^:private ^:const ^Integer emoji-meter-width 50)

(def ^:private progress-emoji
  ["😱"   ; face screaming in fear
   "😢"   ; crying face
   "😞"   ; disappointed face
   "😒"   ; unamused face
   "😕"   ; confused face
   "😐"   ; neutral face
   "😬"   ; grimacing face
   "😌"   ; relieved face
   "😏"   ; smirking face
   "😋"   ; face savouring delicious food
   "😊"   ; smiling face with smiling eyes
   "😍"   ; smiling face with heart shaped eyes
   "😎"]) ; smiling face with sunglasses

(defn- percent-done->emoji [percent-done]
  (progress-emoji (int (math/round (* percent-done (dec (count progress-emoji)))))))

(defn emoji-progress-bar
  "Create a string that shows progress for something, e.g. a database sync process.

     (emoji-progress-bar 10 40)
       -> \"[************······································] 😒   25%"
  [completed total log-every-n]
  (let [percent-done (float (/ completed total))
        filleds      (int (* percent-done emoji-meter-width))
        blanks       (- emoji-meter-width filleds)]
    (when (or (zero? (mod completed log-every-n))
              (= completed total))
      (str "["
           (str/join (repeat filleds "*"))
           (str/join (repeat blanks "·"))
           (format "] %s  %3.0f%%" (u/emoji (percent-done->emoji percent-done)) (* percent-done 100.0))))))

(defmacro with-emoji-progress-bar
  "Run BODY with access to a function that makes using our amazing emoji-progress-bar easy like Sunday morning.
  Calling the function will return the approprate string output for logging and automatically increment an internal
  counter as needed.

    (with-emoji-progress-bar [progress-bar 10]
      (dotimes [i 10]
        (println (progress-bar))))"
  {:style/indent 1}
  [[emoji-progress-fn-binding total-count] & body]
  `(let [finished-count#            (atom 0)
         total-count#               ~total-count
         log-every-n#               (Math/ceil (/ total-count# 10))
         ~emoji-progress-fn-binding (fn [] (emoji-progress-bar (swap! finished-count# inc) total-count# log-every-n#))]
     ~@body))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            INITIAL SYNC STATUS                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;; If this is the first sync of a database, we need to update the `initial_sync_status` field on individual tables
;; when they have finished syncing, as well as the corresponding field on the database itself when the entire sync
;; is complete (excluding analysis). This powers a UX that displays the progress of the initial sync to the admin who
;; added the database, and enables individual tables when they become usable for queries.

(defn set-initial-table-sync-complete!
  "Marks initial sync as complete for this table so that it becomes usable in the UI, if not already set"
  [table]
  (when (not= (:initial_sync_status table) "complete")
    (t2/update! Table (u/the-id table) {:initial_sync_status "complete"})))

(defn set-initial-database-sync-complete!
  "Marks initial sync as complete for this database so that this is reflected in the UI, if not already set"
  [database]
  (when (not= (:initial_sync_status database) "complete")
    (t2/update! Database (u/the-id database) {:initial_sync_status "complete"})))

(defn set-initial-database-sync-aborted!
  "Marks initial sync as aborted for this database so that an error can be displayed on the UI"
  [database]
  (when (not= (:initial_sync_status database) "complete")
    (t2/update! Database (u/the-id database) {:initial_sync_status "aborted"})))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          OTHER SYNC UTILITY FUNCTIONS                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn db->sync-tables
  "Return all the Tables that should go through the sync processes for `database-or-id`."
  [database-or-id]
  (t2/select Table, :db_id (u/the-id database-or-id), :active true, :visibility_type nil))

(defmulti name-for-logging
  "Return an appropriate string for logging an object in sync logging messages. Should be something like

    \"postgres Database 'test-data'\"

  This function is used all over the sync code to make sure we have easy access to consistently formatted descriptions
  of various objects."
  {:arglists '([instance])}
  mi/model)

(defmethod name-for-logging Database
  [{database-name :name, id :id, engine :engine,}]
  (trs "{0} Database {1} ''{2}''" (name engine) (str (or id "")) database-name))

(defmethod name-for-logging Table [{schema :schema, id :id, table-name :name}]
  (trs "Table {0} ''{1}''" (or id "") (str (when (seq schema) (str schema ".")) table-name)))

(defmethod name-for-logging Field [{field-name :name, id :id}]
  (trs "Field {0} ''{1}''" (or id "") field-name))

;;; this is used for result metadata stuff.
(defmethod name-for-logging :default [{field-name :name}]
  (trs "Field ''{0}''" field-name))

(s/defn calculate-duration-str :- s/Str
  "Given two datetimes, caculate the time between them, return the result as a string"
  [begin-time :- Temporal, end-time :- Temporal]
  (u/format-nanoseconds (.toNanos (t/duration begin-time end-time))))

(def StepSpecificMetadata
  "A step function can return any metadata and is used by the related LogSummaryFunction to provide step-specific
  details about run"
  {s/Keyword s/Any})

(def ^:private TimedSyncMetadata
  "Metadata common to both sync steps and an entire sync/analyze operation run"
  {:start-time Temporal
   :end-time   Temporal})

(def StepRunMetadata
  "Map with metadata about the step. Contains both generic information like `start-time` and `end-time` and step
  specific information"
  (merge TimedSyncMetadata
         {:log-summary-fn (s/maybe (s/=> s/Str StepRunMetadata))}
         StepSpecificMetadata))

(def StepNameWithMetadata
  "Pair with the step name and metadata about the completed step run"
  [(s/one s/Str "step name") (s/one StepRunMetadata "step metadata")])

(def SyncOperationMetadata
  "Timing and step information for the entire sync or analyze run"
  (assoc TimedSyncMetadata :steps [StepNameWithMetadata]))

(def LogSummaryFunction
  "A log summary function takes a `StepRunMetadata` and returns a string with a step-specific log message"
  (s/=> s/Str StepRunMetadata))

(def StepDefinition
  "Defines a step. `:sync-fn` runs the step, returns a map that contains step specific metadata. `log-summary-fn`
  takes that metadata and turns it into a string for logging"
  {:sync-fn        (s/=> StepRunMetadata i/DatabaseInstance)
   :step-name      s/Str
   :log-summary-fn (s/maybe LogSummaryFunction)})

(defn create-sync-step
  "Creates and returns a step suitable for `run-step-with-metadata`. See `StepDefinition` for more info."
  ([step-name sync-fn]
   (create-sync-step step-name sync-fn nil))
  ([step-name sync-fn log-summary-fn]
   {:sync-fn        sync-fn
    :step-name      step-name
    :log-summary-fn (when log-summary-fn
                      (comp str log-summary-fn))}))

(s/defn run-step-with-metadata :- StepNameWithMetadata
  "Runs `step` on `database` returning metadata from the run"
  [database :- i/DatabaseInstance
   {:keys [step-name sync-fn log-summary-fn] :as _step} :- StepDefinition]
  (let [start-time (t/zoned-date-time)
        results    (with-start-and-finish-debug-logging (trs "step ''{0}'' for {1}"
                                                             step-name
                                                             (name-for-logging database))
                     (fn [& args]
                       (try
                         (apply sync-fn database args)
                         (catch Throwable e
                           (if *log-exceptions-and-continue?*
                             (do
                               (log/warn e (trs "Error running step ''{0}'' for {1}" step-name (name-for-logging database)))
                               {:throwable e})
                             (throw (ex-info (format "Error in sync step %s: %s" step-name (ex-message e)) {} e)))))))
        end-time   (t/zoned-date-time)]
    [step-name (assoc results
                      :start-time start-time
                      :end-time end-time
                      :log-summary-fn log-summary-fn)]))

(s/defn ^:private make-log-sync-summary-str
  "The logging logic from `log-sync-summary`. Separated for testing purposes as the `log/debug` macro won't invoke
  this function unless the logging level is at debug (or higher)."
  [operation :- s/Str
   database :- i/DatabaseInstance
   {:keys [start-time end-time steps]} :- SyncOperationMetadata]
  (str
   (apply format
          (str "\n#################################################################\n"
               "# %s\n"
               "# %s\n"
               "# %s\n"
               "# %s\n")
          [(trs "Completed {0} on {1}" operation (:name database))
           (trs "Start: {0}" (u.date/format start-time))
           (trs "End: {0}" (u.date/format end-time))
           (trs "Duration: {0}" (calculate-duration-str start-time end-time))])
   (apply str (for [[step-name {:keys [start-time end-time log-summary-fn] :as step-info}] steps]
                (apply format (str "# ---------------------------------------------------------------\n"
                                   "# %s\n"
                                   "# %s\n"
                                   "# %s\n"
                                   "# %s\n"
                                   (when log-summary-fn
                                       (format "# %s\n" (log-summary-fn step-info))))
                       [(trs "Completed step ''{0}''" step-name)
                        (trs "Start: {0}" (u.date/format start-time))
                        (trs "End: {0}" (u.date/format end-time))
                        (trs "Duration: {0}" (calculate-duration-str start-time end-time))])))
   "#################################################################\n"))

(s/defn ^:private  log-sync-summary
  "Log a sync/analyze summary message with info from each step"
  [operation :- s/Str
   database :- i/DatabaseInstance
   sync-metadata :- SyncOperationMetadata]
  ;; Note this needs to either stay nested in the `debug` macro call or be guarded by an log/enabled?
  ;; call. Constructing the log below requires some work, no need to incur that cost debug logging isn't enabled
  (log/debug (make-log-sync-summary-str operation database sync-metadata)))

(def ^:private SyncOperationOrStepRunMetadata
  (s/conditional
   #(contains? % :steps)
   SyncOperationMetadata
   :else
   StepRunMetadata))

(s/defn ^:private create-task-history
  [task-name :- su/NonBlankString
   database  :- i/DatabaseInstance
   {:keys [start-time end-time]} :- SyncOperationOrStepRunMetadata]
  {:task       task-name
   :db_id      (u/the-id database)
   :started_at start-time
   :ended_at   end-time
   :duration   (.toMillis (t/duration start-time end-time))})

(s/defn ^:private store-sync-summary!
  [operation :- s/Str
   database  :- i/DatabaseInstance
   {:keys [steps] :as sync-md} :- SyncOperationMetadata]
  (try
    (->> (for [[step-name step-info] steps
               :let                  [task-details (dissoc step-info :start-time :end-time :log-summary-fn)]]
           (assoc (create-task-history step-name database step-info)
                  :task_details (when (seq task-details)
                                  task-details)))
         (cons (create-task-history operation database sync-md))
         ;; can't do `(t2/insert-returning-instances!)` with a seq because of this bug https://github.com/camsaul/toucan2/issues/130
         (map #(t2/insert-returning-pks! TaskHistory %))
         (map first)
         doall)
    (catch Throwable e
      (log/warn e (trs "Error saving task history")))))

(defn abandon-sync?
  "Given the results of a sync step, returns true if a non-recoverable exception occurred"
  [step-results]
  (when (contains? step-results :throwable)
    (let [caught-exception (:throwable step-results)
          exception-classes (u/full-exception-chain caught-exception)]
      (some true? (for [ex      exception-classes
                        test-ex exception-classes-not-to-retry]
                    (= (.. ^Object ex getClass getName) (.. ^Class test-ex getName)))))))

(s/defn run-sync-operation
  "Run `sync-steps` and log a summary message"
  [operation :- s/Str
   database :- i/DatabaseInstance
   sync-steps :- [StepDefinition]]
  (let [start-time    (t/zoned-date-time)
        step-metadata (loop [[step-defn & rest-defns] sync-steps
                             result                   []]
                        (let [[step-name r] (run-step-with-metadata database step-defn)
                              new-result    (conj result [step-name r])]
                          (cond (abandon-sync? r) new-result
                                (not (seq rest-defns)) new-result
                                :else (recur rest-defns new-result))))
        end-time      (t/zoned-date-time)
        sync-metadata {:start-time start-time
                       :end-time   end-time
                       :steps      step-metadata}]
    (store-sync-summary! operation database sync-metadata)
    (log-sync-summary operation database sync-metadata)
    sync-metadata))

(defn sum-numbers
  "Similar to a 2-arg call to `map`, but will add all numbers that result from the invocations of `f`. Used mainly for
  logging purposes, such as to count and log the number of Fields updated by a sync operation. See also
  `sum-for`, a `for`-style macro version."
  [f coll]
  (reduce + (for [item coll
                  :let [result (f item)]
                  :when (number? result)]
              result)))

(defn sum-for*
  "Impl for `sum-for` macro; see its docstring;"
  [results]
  (reduce + (filter number? results)))

(defmacro sum-for
  "Basically the same as `for`, but sums the results of each iteration of `body` that returned a number. See also
  `sum-numbers`.

  As an added bonus, unlike normal `for`, this wraps `body` in an implicit `do`, so you can have more than one form
  inside the loop. Nice"
  {:style/indent 1}
  [[item-binding coll & more-for-bindings] & body]
  `(sum-for* (for [~item-binding ~coll
                   ~@more-for-bindings]
               (do ~@body))))
