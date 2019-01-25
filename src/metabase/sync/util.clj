(ns metabase.sync.util
  "Utility functions and macros to abstract away some common patterns and operations across the sync processes, such
  as logging start/end messages."
  (:require [buddy.core.hash :as buddy-hash]
            [clj-time
             [coerce :as tcoerce]
             [core :as time]]
            [clojure.math.numeric-tower :as math]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [events :as events]
             [util :as u]]
            [metabase.driver.util :as driver.u]
            [metabase.models
             [table :refer [Table]]
             [task-history :refer [TaskHistory]]]
            [metabase.query-processor.interface :as qpi]
            [metabase.sync.interface :as i]
            [metabase.util
             [date :as du]
             [i18n :refer [trs]]
             [schema :as su]]
            [ring.util.codec :as codec]
            [schema.core :as s]
            [taoensso.nippy :as nippy]
            [toucan.db :as db])
  (:import org.joda.time.DateTime))

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
  "Run F in a way that will prevent it from simultaneously being ran more for a single database more than once for a
  given OPERATION. This prevents duplicate sync-like operations from taking place for a given DB, e.g. if a user hits
  the `Sync` button in the admin panel multiple times.

    ;; Only one `sync-db!` for `database-id` will be allowed at any given moment; duplicates will be ignored
    (with-duplicate-ops-prevented :sync database-id
      #(sync-db! database-id))"
  {:style/indent 2}
  [operation database-or-id f]
  (fn []
    (when-not (contains? (@operation->db-ids operation) (u/get-id database-or-id))
      (try
        ;; mark this database as currently syncing so we can prevent duplicate sync attempts (#2337)
        (swap! operation->db-ids update operation #(conj (or % #{}) (u/get-id database-or-id)))
        (log/debug "Sync operations in flight:" (m/filter-vals seq @operation->db-ids))
        ;; do our work
        (f)
        ;; always take the ID out of the set when we are through
        (finally
          (swap! operation->db-ids update operation #(disj % (u/get-id database-or-id))))))))


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
       (events/publish-event! begin-event-name {:database_id (u/get-id database-or-id), :custom_id tracking-hash})
       (f)
       (let [total-time-ms (int (/ (- (System/nanoTime) start-time)
                                   1000000.0))]
         (events/publish-event! end-event-name {:database_id  (u/get-id database-or-id)
                                                :custom_id    tracking-hash
                                                :running_time total-time-ms}))
       nil))))

(defn- with-start-and-finish-logging'
  "Logs start/finish messages using `log-fn`, timing `f`"
  {:style/indent 1}
  [log-fn message f]
  (let [start-time (System/nanoTime)
        _          (log-fn (u/format-color 'magenta "STARTING: %s" message))
        result     (f)]
    (log-fn (u/format-color 'magenta "FINISHED: %s (%s)"
              message
              (du/format-nanoseconds (- (System/nanoTime) start-time))))
    result))

(defn- with-start-and-finish-logging
  "Log MESSAGE about a process starting, then run F, and then log a MESSAGE about it finishing.
   (The final message includes a summary of how long it took to run F.)"
  {:style/indent 1}
  [message f]
  (fn []
    (with-start-and-finish-logging' #(log/info %) message f)))

(defn with-start-and-finish-debug-logging
  "Similar to `with-start-and-finish-logging except invokes `f` and returns its result and logs at the debug level"
  [message f]
  (with-start-and-finish-logging' #(log/debug %) message f))

(defn- with-db-logging-disabled
  "Disable all QP and DB logging when running BODY. (This should be done for *all* sync-like processes to avoid
  cluttering the logs.)"
  {:style/indent 0}
  [f]
  (fn []
    (binding [qpi/*disable-qp-logging* true
              db/*disable-db-logging*  true]
      (f))))

(defn- sync-in-context
  "Pass the sync operation defined by BODY to the DATABASE's driver's implementation of `sync-in-context`.
   This method is used to do things like establish a connection or other driver-specific steps needed for sync
  operations."
  {:style/indent 1}
  [database f]
  (fn []
    (driver/sync-in-context (driver.u/database->driver database) database
      f)))


(defn do-with-error-handling
  "Internal implementation of `with-error-handling`; use that instead of calling this directly."
  ([f]
   (do-with-error-handling "Error running sync step" f))
  ([message f]
   (try (f)
        (catch Throwable e
          (log/error (u/format-color 'red "%s: %s\n%s"
                       message
                       (or (.getMessage e) (class e))
                       (u/pprint-to-str (or (seq (u/filtered-stacktrace e))
                                            (.getStackTrace e)))))
          e))))

(defmacro with-error-handling
  "Execute BODY in a way that catches and logs any Exceptions thrown, and returns `nil` if they do so.
   Pass a MESSAGE to help provide information about what failed for the log message."
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
             (partial do-with-error-handling f))))))))

(defmacro sync-operation
  "Perform the operations in BODY as a sync operation, which wraps the code in several special macros that do things
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
;;; |                                          OTHER SYNC UTILITY FUNCTIONS                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn db->sync-tables
  "Return all the Tables that should go through the sync processes for DATABASE-OR-ID."
  [database-or-id]
  (db/select Table, :db_id (u/get-id database-or-id), :active true, :visibility_type nil))


;; The `name-for-logging` function is used all over the sync code to make sure we have easy access to consistently
;; formatted descriptions of various objects.

(defprotocol ^:private INameForLogging
  (name-for-logging [this]
    "Return an appropriate string for logging an object in sync logging messages.
     Should be something like \"postgres Database 'test-data'\""))

(extend-protocol INameForLogging
  i/DatabaseInstance
  (name-for-logging [{database-name :name, id :id, engine :engine,}]
    (str (trs "{0} Database {1} ''{2}''" (name engine) (or id "") database-name)))

  i/TableInstance
  (name-for-logging [{schema :schema, id :id, table-name :name}]
    (str (trs "Table {0} ''{1}''" (or id "") (str (when (seq schema) (str schema ".")) table-name))))

  i/FieldInstance
  (name-for-logging [{field-name :name, id :id}]
    (str (trs "Field {0} ''{1}''" (or id "") field-name)))

  i/ResultColumnMetadataInstance
  (name-for-logging [{field-name :name}]
    (str (trs "Field ''{0}''" field-name))))

(defn calculate-hash
  "Calculate a cryptographic hash on `clj-data` and return that hash as a string"
  [clj-data]
  (->> clj-data
       ;; Serialize the sorted list to bytes that can be hashed
       nippy/fast-freeze
       buddy-hash/md5
       ;; Convert the hash bytes to a string for storage/comparison with the hash in the database
       codec/base64-encode))

(s/defn calculate-duration-str :- s/Str
  "Given two datetimes, caculate the time between them, return the result as a string"
  [begin-time :- (s/protocol tcoerce/ICoerce)
   end-time :- (s/protocol tcoerce/ICoerce)]
  (-> (du/calculate-duration begin-time end-time)
      ;; Millis -> Nanos
      (* 1000000)
      du/format-nanoseconds))

(def StepSpecificMetadata
  "A step function can return any metadata and is used by the related LogSummaryFunction to provide step-specific
  details about run"
  {s/Keyword s/Any})

(def ^:private TimedSyncMetadata
  "Metadata common to both sync steps and an entire sync/analyze operation run"
  {:start-time DateTime
   :end-time   DateTime})

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

(defn- datetime->str [datetime]
  (du/->iso-8601-datetime datetime "UTC"))

(s/defn run-step-with-metadata :- StepNameWithMetadata
  "Runs `step` on `database returning metadata from the run"
  [database :- i/DatabaseInstance
   {:keys [step-name sync-fn log-summary-fn] :as step} :- StepDefinition]
  (let [start-time (time/now)
        results    (with-start-and-finish-debug-logging (str (trs "step ''{0}'' for {1}"
                                                                  step-name
                                                                  (name-for-logging database)))
                     #(sync-fn database))
        end-time   (time/now)]
    [step-name (assoc results
                 :start-time start-time
                 :end-time end-time
                 :log-summary-fn log-summary-fn)]))

(s/defn ^:private make-log-sync-summary-str
  "The logging logic from `log-sync-summary`. Separated for testing purposes as the `log/debug` macro won't invoke
  this function unless the logging level is at debug (or higher)."
  [operation :- s/Str
   database :- i/DatabaseInstance
   {:keys [start-time end-time steps log-summary-fn]} :- SyncOperationMetadata]
  (str
   (apply format
          (str "\n#################################################################\n"
               "# %s\n"
               "# %s\n"
               "# %s\n"
               "# %s\n")
          (map str [(trs "Completed {0} on {1}" operation (:name database))
                    (trs "Start: {0}" (datetime->str start-time))
                    (trs "End: {0}" (datetime->str end-time))
                    (trs "Duration: {0}" (calculate-duration-str start-time end-time))]))
   (apply str (for [[step-name {:keys [start-time end-time log-summary-fn] :as step-info}] steps]
                (apply format (str "# ---------------------------------------------------------------\n"
                                   "# %s\n"
                                   "# %s\n"
                                   "# %s\n"
                                   "# %s\n"
                                   (when log-summary-fn
                                       (format "# %s\n" (log-summary-fn step-info))))
                       (map str [(trs "Completed step ''{0}''" step-name)
                                 (trs "Start: {0}" (datetime->str start-time))
                                 (trs "End: {0}" (datetime->str end-time))
                                 (trs "Duration: {0}" (calculate-duration-str start-time end-time))]))))
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
  {:task task-name
   :db_id (u/get-id database)
   :started_at (du/->Timestamp start-time)
   :ended_at (du/->Timestamp end-time)
   :duration (du/calculate-duration start-time end-time)})

(s/defn ^:private store-sync-summary!
  [operation :- s/Str
   database  :- i/DatabaseInstance
   {:keys [steps] :as sync-md} :- SyncOperationMetadata]
  (db/insert-many! TaskHistory
    (cons (create-task-history operation database sync-md)
          (for [[step-name step-info] steps
                :let [task-details (dissoc step-info :start-time :end-time :log-summary-fn)]]
            (assoc (create-task-history step-name database step-info)
              :task_details (when (seq task-details)
                              task-details))))))

(s/defn run-sync-operation
  "Run `sync-steps` and log a summary message"
  [operation :- s/Str
   database :- i/DatabaseInstance
   sync-steps :- [StepDefinition]]
  (let [start-time    (time/now)
        step-metadata (mapv #(run-step-with-metadata database %) sync-steps)
        end-time      (time/now)
        sync-metadata {:start-time start-time
                       :end-time   end-time
                       :steps      step-metadata}]
    (store-sync-summary! operation database sync-metadata)
    (log-sync-summary operation database sync-metadata)))

(defn sum-numbers
  "Similar to a 2-arg call to `map`, but will add all numbers that result from the invocations of `f`"
  [f coll]
  (reduce + (for [item coll
                  :let [result (f item)]
                  :when (number? result)]
              result)))
