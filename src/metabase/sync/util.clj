(ns metabase.sync.util
  "Utility functions and macros to abstract away some common patterns and operations across the sync processes, such
  as logging start/end messages."
  (:require [clojure.math.numeric-tower :as math]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [events :as events]
             [util :as u]]
            [metabase.models.table :refer [Table]]
            [metabase.query-processor.interface :as qpi]
            [metabase.sync.interface :as i]
            [toucan.db :as db]))

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


(defn- with-start-and-finish-logging
  "Log MESSAGE about a process starting, then run F, and then log a MESSAGE about it finishing.
   (The final message includes a summary of how long it took to run F.)"
  {:style/indent 1}
  [message f]
  (fn []
    (let [start-time (System/nanoTime)]
      (log/info (u/format-color 'magenta "STARTING: %s" message))
      (f)
      (log/info (u/format-color 'magenta "FINISHED: %s (%s)"
                  message
                  (u/format-nanoseconds (- (System/nanoTime) start-time)))))))


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
    (driver/sync-in-context (driver/->driver database) database
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
                                            (.getStackTrace e)))))))))

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
    (format "%s Database %s '%s'" (name engine) (or id "") database-name))

  i/TableInstance
  (name-for-logging [{schema :schema, id :id, table-name :name}]
    (format "Table %s '%s'" (or id "") (str (when (seq schema) (str schema ".")) table-name)))

  i/FieldInstance
  (name-for-logging [{field-name :name, id :id}]
    (format "Field %s '%s'" (or id "") field-name)))
