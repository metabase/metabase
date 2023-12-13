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
   [metabase.models.field :refer [Field]]
   [metabase.models.interface :as mi]
   [metabase.models.task-history :refer [TaskHistory]]
   [metabase.query-processor.interface :as qp.i]
   [metabase.sync.interface :as i]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.time.temporal Temporal)))

(set! *warn-on-reflection* true)

(derive ::event :metabase/event)

(def ^:private sync-event-topics
  #{:event/sync-begin
    :event/sync-end
    :event/analyze-begin
    :event/analyze-end
    :event/refingerprint-begin
    :event/refingerprint-end
    :event/cache-field-values-begin
    :event/cache-field-values-end
    :event/sync-metadata-begin
    :event/sync-metadata-end})

(doseq [topic sync-event-topics]
  (derive topic ::event))

(def ^:private Topic
  [:and
   events/Topic
   [:fn
    {:error/message "Sync event deriving from :metabase.sync.util/event"}
    #(isa? % ::event)]])

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

(mu/defn ^:private with-sync-events
  "Publish events related to beginning and ending a sync-like process, e.g. `:sync-database` or `:cache-values`, for a
  `database-id`. `f` is executed between the logging of the two events."
  {:style/indent [:form]}
  ;; we can do everyone a favor and infer the name of the individual begin and sync events
  ([event-name-prefix database-or-id f]
   (letfn [(event-keyword [prefix suffix]
             (keyword (or (namespace event-name-prefix) "event")
                      (str (name prefix) suffix)))]
     (with-sync-events
      (event-keyword event-name-prefix "-begin")
      (event-keyword event-name-prefix "-end")
      database-or-id
      f)))

  ([begin-event-name :- Topic
    end-event-name   :- Topic
    database-or-id
    f]
   (fn []
     (let [start-time    (System/nanoTime)
           tracking-hash (str (random-uuid))]
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
  {:style/indent [:form]}
  [log-fn message f]
  (let [start-time (System/nanoTime)
        _          (log-fn (u/format-color 'magenta "STARTING: %s" message))
        result     (f)]
    (log-fn (u/format-color 'magenta "FINISHED: %s (%s)"
              message
              (u/format-nanoseconds (- (System/nanoTime) start-time))))
    result))

(defn- with-start-and-finish-logging
  "Log `message` about a process starting, then run `f`, and then log a `message` about it finishing.
   (The final message includes a summary of how long it took to run `f`.)"
  {:style/indent [:form]}
  [message f]
  (fn []
    (with-start-and-finish-logging* #(log/info %) message f)))

(defn with-start-and-finish-debug-logging
  "Similar to `with-start-and-finish-logging except invokes `f` and returns its result and logs at the debug level"
  {:style/indent [:form]}
  [message f]
  (with-start-and-finish-logging* #(log/info %) message f))

(defn- with-db-logging-disabled
  "Disable all QP and DB logging when running BODY. (This should be done for *all* sync-like processes to avoid
  cluttering the logs.)"
  {:style/indent [:form]}
  [f]
  (fn []
    (binding [qp.i/*disable-qp-logging* true]
      (f))))

(defn- sync-in-context
  "Pass the sync operation defined by `body` to the `database`'s driver's implementation of `sync-in-context`.
  This method is used to do things like establish a connection or other driver-specific steps needed for sync
  operations."
  [database f]
  (fn []
    (driver/sync-in-context (driver.u/database->driver database) database
      f)))

;; TODO: future, expand this to `driver` level, where the drivers themselves can add to the
;; list of exception classes (like, driver-specific exceptions)
(doseq [klass [java.net.ConnectException
               java.net.NoRouteToHostException
               java.net.UnknownHostException
               com.mchange.v2.resourcepool.CannotAcquireResourceException
               javax.net.ssl.SSLHandshakeException]]
  (derive klass ::exception-class-not-to-retry))

(def ^:dynamic *log-exceptions-and-continue?*
  "Whether to log exceptions during a sync step and proceed with the rest of the sync process. This is the default
  behavior. You can disable this for debugging or test purposes."
  true)

(defn do-with-error-handling
  "Internal implementation of [[with-error-handling]]; use that instead of calling this directly."
  ([f]
   (do-with-error-handling "Error running sync step" f))

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

  The exception classes deriving from `:metabase.sync.util/exception-class-not-to-retry` are a list of classes tested
  against exceptions thrown. If there is a match found, the sync is aborted as that error is not considered
  recoverable for this sync run."
  {:style/indent 1}
  [message & body]
  `(do-with-error-handling ~message (fn [] ~@body)))

(mu/defn do-sync-operation
  "Internal implementation of [[sync-operation]]; use that instead of calling this directly."
  [operation :- :keyword ; something like `:sync-metadata` or `:refingerprint`
   database  :- (ms/InstanceOf :model/Database)
   message   :- ms/NonBlankString
   f         :- fn?]
  ((with-duplicate-ops-prevented operation database
     (with-sync-events operation database
       (with-start-and-finish-logging message
         (with-db-logging-disabled
           (sync-in-context database
             (partial do-with-error-handling (format "Error in sync step %s" message) f))))))))

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
    (t2/update! :model/Table (u/the-id table) {:initial_sync_status "complete"})))

(defn set-initial-database-sync-complete!
  "Marks initial sync as complete for this database so that this is reflected in the UI, if not already set"
  [database]
  (when (not= (:initial_sync_status database) "complete")
    (t2/update! :model/Database (u/the-id database) {:initial_sync_status "complete"})))

(defn set-initial-database-sync-aborted!
  "Marks initial sync as aborted for this database so that an error can be displayed on the UI"
  [database]
  (when (not= (:initial_sync_status database) "complete")
    (t2/update! :model/Database (u/the-id database) {:initial_sync_status "aborted"})))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          OTHER SYNC UTILITY FUNCTIONS                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn db->sync-tables
  "Return all the Tables that should go through the sync processes for `database-or-id`."
  [database-or-id]
  (t2/select :model/Table, :db_id (u/the-id database-or-id), :active true, :visibility_type nil))

(defmulti name-for-logging
  "Return an appropriate string for logging an object in sync logging messages. Should be something like

    \"postgres Database 'test-data'\"

  This function is used all over the sync code to make sure we have easy access to consistently formatted descriptions
  of various objects."
  {:arglists '([instance])}
  mi/model)

(defmethod name-for-logging :model/Database
  [{database-name :name, id :id, engine :engine,}]
  (format "%s Database %s ''%s ''" (name engine) (str (or id "")) database-name))

(defmethod name-for-logging :model/Table [{schema :schema, id :id, table-name :name}]
  (format "Table %s ''%s ''" (or (str id) "") (str (when (seq schema) (str schema ".")) table-name)))

(defmethod name-for-logging Field [{field-name :name, id :id}]
  (format "Field %s ''%s''" (or (str id) "") field-name))

;;; this is used for result metadata stuff.
(defmethod name-for-logging :default [{field-name :name}]
  (format "Field ''%s''" field-name))

(mu/defn calculate-duration-str :- :string
  "Given two datetimes, caculate the time between them, return the result as a string"
  [begin-time :- (ms/InstanceOfClass Temporal)
   end-time   :- (ms/InstanceOfClass Temporal)]
  (u/format-nanoseconds (.toNanos (t/duration begin-time end-time))))

(def ^:private TimedSyncMetadata
  "Metadata common to both sync steps and an entire sync/analyze operation run"
  [:map
   [:start-time (ms/InstanceOfClass Temporal)]
   [:end-time   (ms/InstanceOfClass Temporal)]])

(mr/def ::StepRunMetadata
  [:merge
   TimedSyncMetadata
   [:map
    [:log-summary-fn [:maybe [:=> [:cat :string] [:ref ::StepRunMetadata]]]]]])

(def ^:private StepRunMetadata
  "Map with metadata about the step. Contains both generic information like `start-time` and `end-time` and step
  specific information"
  [:ref ::StepRunMetadata])

(mr/def ::StepNameWithMetadata
  [:tuple
   ;; step name
   :string
   ;; step metadata
   StepRunMetadata])

(def StepNameWithMetadata
  "Pair with the step name and metadata about the completed step run"
  [:ref ::StepNameWithMetadata])

(def ^:private SyncOperationMetadata
  "Timing and step information for the entire sync or analyze run"
  [:merge
   TimedSyncMetadata
   [:map
    [:steps [:maybe [:sequential StepNameWithMetadata]]]]])

(def ^:private LogSummaryFunction
  "A log summary function takes a `StepRunMetadata` and returns a string with a step-specific log message"
  [:=> [:cat :string] StepRunMetadata])

(def ^:private StepDefinition
  "Defines a step. `:sync-fn` runs the step, returns a map that contains step specific metadata. `log-summary-fn`
  takes that metadata and turns it into a string for logging"
  [:map
   [:sync-fn        [:=> [:cat StepRunMetadata] i/DatabaseInstance]]
   [:step-name      :string]
   [:log-summary-fn [:maybe LogSummaryFunction]]])

(defn create-sync-step
  "Creates and returns a step suitable for `run-step-with-metadata`. See `StepDefinition` for more info."
  ([step-name sync-fn]
   (create-sync-step step-name sync-fn nil))
  ([step-name sync-fn log-summary-fn]
   {:sync-fn        sync-fn
    :step-name      step-name
    :log-summary-fn (when log-summary-fn
                      (comp str log-summary-fn))}))

(mu/defn run-step-with-metadata :- StepNameWithMetadata
  "Runs `step` on `database` returning metadata from the run"
  [database :- i/DatabaseInstance
   {:keys [step-name sync-fn log-summary-fn] :as _step} :- StepDefinition]
  (let [start-time (t/zoned-date-time)
        results    (with-start-and-finish-debug-logging (format "step ''%s'' for %s"
                                                                step-name
                                                                (name-for-logging database))
                     (fn [& args]
                       (try
                         (apply sync-fn database args)
                         (catch Throwable e
                           (if *log-exceptions-and-continue?*
                             (do
                               (log/warn e (format "Error running step ''%s'' for %s" step-name (name-for-logging database)))
                               {:throwable e})
                             (throw (ex-info (format "Error in sync step %s: %s" step-name (ex-message e)) {} e)))))))
        end-time   (t/zoned-date-time)]
    [step-name (assoc results
                      :start-time start-time
                      :end-time end-time
                      :log-summary-fn log-summary-fn)]))

(mu/defn ^:private make-log-sync-summary-str
  "The logging logic from `log-sync-summary`. Separated for testing purposes as the `log/debug` macro won't invoke
  this function unless the logging level is at debug (or higher)."
  [operation :- :string
   database :- i/DatabaseInstance
   {:keys [start-time end-time steps]} :- SyncOperationMetadata]
  (str
   (apply format
          (str "\n#################################################################\n"
               "# %s\n"
               "# %s\n"
               "# %s\n"
               "# %s\n")
          [(format "Completed %s on %s" operation (:name database))
           (format "Start: %s" (u.date/format start-time))
           (format "End: %s" (u.date/format end-time))
           (format "Duration: %s" (calculate-duration-str start-time end-time))])
   (apply str (for [[step-name {:keys [start-time end-time log-summary-fn] :as step-info}] steps]
                (apply format (str "# ---------------------------------------------------------------\n"
                                   "# %s\n"
                                   "# %s\n"
                                   "# %s\n"
                                   "# %s\n"
                                   (when log-summary-fn
                                       (format "# %s\n" (log-summary-fn step-info))))
                       [(format "Completed step ''%s''" step-name)
                        (format "Start: %s" (u.date/format start-time))
                        (format "End: %s" (u.date/format end-time))
                        (format "Duration: %s" (calculate-duration-str start-time end-time))])))
   "#################################################################\n"))

(mu/defn ^:private  log-sync-summary
  "Log a sync/analyze summary message with info from each step"
  [operation :- :string
   database :- i/DatabaseInstance
   sync-metadata :- SyncOperationMetadata]
  ;; Note this needs to either stay nested in the `debug` macro call or be guarded by an log/enabled?
  ;; call. Constructing the log below requires some work, no need to incur that cost debug logging isn't enabled
  (log/debug (make-log-sync-summary-str operation database sync-metadata)))

(def ^:private SyncOperationOrStepRunMetadata
  [:multi
   {:dispatch
    #(contains? % :steps)}
   [true  SyncOperationMetadata]
   [false StepRunMetadata]])

(mu/defn ^:private create-task-history
  [task-name :- ms/NonBlankString
   database  :- i/DatabaseInstance
   {:keys [start-time end-time]} :- SyncOperationOrStepRunMetadata]
  {:task       task-name
   :db_id      (u/the-id database)
   :started_at start-time
   :ended_at   end-time
   :duration   (.toMillis (t/duration start-time end-time))})

(mu/defn ^:private store-sync-summary!
  [operation :- :string
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
      (log/warn e  "Error saving task history"))))

(defn- do-not-retry-exception? [e]
  (or (isa? (class e) ::exception-class-not-to-retry)
      (some-> (ex-cause e) recur)))

(defn abandon-sync?
  "Given the results of a sync step, returns truthy if a non-recoverable exception occurred"
  [step-results]
  (when-let [caught-exception (:throwable step-results)]
    (do-not-retry-exception? caught-exception)))

(mu/defn run-sync-operation
  "Run `sync-steps` and log a summary message"
  [operation :- :string
   database :- i/DatabaseInstance
   sync-steps :- [:maybe [:sequential StepDefinition]]]
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
