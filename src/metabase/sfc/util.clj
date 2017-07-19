(ns metabase.sfc.util
  "Utility functions and macros to abstract away some common patterns and operations across the SFC process, such as logging start/end messages "
  (:require [clojure.tools.logging :as log]
            [metabase
             [events :as events]
             [util :as u]]
            [metabase.models.table :refer [Table]]
            [metabase.query-processor.interface :as i]
            [toucan.db :as db]))

(defn do-with-start-and-finish-logging
  "Implementation of `with-start-and-finish-logging`. Don't use this directly, prefer that instead."
  [message f]
  (let [start-time (System/nanoTime)]
    (log/info (u/format-color 'magenta "STARTING: %s" message))
    (f)
    (log/info (u/format-color 'magenta "FINSISHED: %s (%s)" message (u/format-nanoseconds (- (System/nanoTime) start-time))))))

(defmacro with-start-and-finish-logging
  "Log MESSAGE about a process starting, then run F, and then log a MESSAGE about it finishing.
   (The final message includes a summary of how long it took to run F.)"
  {:style/indent 1}
  [message & body]
  `(do-with-start-and-finish-logging ~message (fn [] ~@body)))


(defn do-with-sfc-events
  "Impl for `with-sfc-events`. Don't use this directly; use that instead."
  ;; we can do everyone a favor and infer the name of the individual begin and sync events
  ([event-name-prefix database-id f]
   (do-with-sfc-events
    (keyword (str (name event-name-prefix) "-begin"))
    (keyword (str (name event-name-prefix) "-end"))
    database-id
    f))
  ([begin-event-name end-event-name database-id f]
   (let [start-time    (System/nanoTime)
         tracking-hash (str (java.util.UUID/randomUUID))]
     (events/publish-event! begin-event-name {:database_id database-id, :custom_id tracking-hash})
     (f)
     (let [total-time-ms (int (/ (- (System/nanoTime) start-time)
                                 1000000.0))]
       (events/publish-event! end-event-name {:database_id  database-id
                                              :custom_id    tracking-hash
                                              :running_time total-time-ms})))))

(defmacro with-sfc-events
  "Publish events related to beginning and ending a sync-like process, e.g. `:sync-database` or `:cache-values`, for a DATABASE-ID.
   BODY is executed between the logging of the two events."
  {:style/indent 2}
  [event-name-prefix database-id & body]
  `(do-with-sfc-events ~event-name-prefix ~database-id (fn [] ~@body)))


(defmacro with-logging-disabled
  "Disable all QP and DB logging when running BODY. (This should be done for *all* sync-like processes to avoid cluttering the logs.)"
  {:style/indent 0}
  [& body]
  `(binding [i/*disable-qp-logging*  true
             db/*disable-db-logging* true]
     ~@body))


;; This looks something like {:sync #{1 2}, :cache #{2 3}} when populated.
;; Key is a type of sync operation, e.g. `:sync` or `:cache`; vals are sets of DB IDs undergoing that operation.
(defonce ^:private operation->db-ids (atom {}))

(defn do-with-duplicate-ops-prevented
  "Implementation for `with-duplicate-ops-prevented`; prefer that instead."
  [operation database-id f]
  (println "Current operations:" @operation->db-ids) ; NOCOMMIT
  (when-not (contains? (@operation->db-ids operation) database-id)
    (try
      ;; mark this database as currently syncing so we can prevent duplicate sync attempts (#2337)
      (swap! operation->db-ids update operation #(conj (or % #{}) database-id))
      ;; do our work
      (f)
      ;; always cleanup our tracking when we are through
      (finally
        (swap! operation->db-ids update operation #(disj % database-id))))))

(defmacro with-duplicate-ops-prevented
  "Run BODY in a way that will prevent it from simultaneously being ran more for a single database more than once for a given OPERATION.
   This prevents duplicate sync-like operations from taking place for a given DB, e.g. if a user hits the `Sync` button in the admin panel multiple times.

     ;; Only one `sync-db!` for `database-id` will be allowed at any given moment; duplicates will be ignored
     (with-duplicate-ops-prevented :sync database-id
       (sync-db! database-id))"
  {:style/indent 2}
  [operation database-id & body]
  `(do-with-duplicate-ops-prevented ~operation ~database-id (fn [] ~@body)))


(defmacro with-emoji-progress-bar
  "Run BODY with access to a function that makes using our amazing emoji-progress-bar easy like Sunday morning.
   Calling the function will return the approprate string output for logging and automatically increment an internal counter as needed.

     (with-emoji-progress-bar [progress-bar 10]
       (dotimes [i 10]
         (println (progress-bar))))"
  {:style/indent 1}
  [[emoji-progress-fn-binding total-count] & body]
  `(let [finished-count#            (atom 0)
         total-count#               ~total-count
         ~emoji-progress-fn-binding (fn [] (u/emoji-progress-bar (swap! finished-count# inc) total-count#))]
     ~@body))


(defn db->sfc-tables
  "Return all the Tables that should go the SFC process for DATABASE-OR-ID."
  [database-or-id]
  (db/select Table, :db_id (u/get-id database-or-id), :active true, :visibility_type nil))
