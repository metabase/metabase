(ns metabase.task-history.models.task-history
  (:require
   [clojure.string :as str]
   ;; installs a capturing LoggerFactory via *logger-factory*; util.log doesn't expose the factory plumbing
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [clojure.tools.logging]
   [clojure.tools.logging.impl]
   [java-time.api :as t]
   [metabase.config.core :as config]
   [metabase.logger.core :as logger]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.task-history.db :as task-history.db]
   [metabase.task-history.models.task-run :as task-run]
   [metabase.task-history.schema :as task-history.schema]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import (clojure.lang PersistentQueue)
           (java.time Clock)
           (org.apache.commons.lang3.exception ExceptionUtils)))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(methodical/defmethod t2/table-name :model/TaskHistory [_model] :task_history)

(doto :model/TaskHistory
  (derive :metabase/model)
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set))

;;; Permissions to read or write Task. If `advanced-permissions` is enabled it requires superusers or non-admins with
;;; monitoring permissions, Otherwise it requires superusers.
(defmethod mi/perms-objects-set :model/TaskHistory
  [_task _read-or-write]
  #{(if (premium-features/enable-advanced-permissions?)
      (perms/application-perms-path :monitoring)
      "/")})

(defn cleanup-task-history!
  "Deletes older TaskHistory rows. Will order TaskHistory by `ended_at` and delete everything after `num-rows-to-keep`.
  This is intended for a quick cleanup of old rows. Returns `true` if something was deleted."
  [num-rows-to-keep]
  ;; Ideally this would be one query, but MySQL does not allow nested queries with a limit. The query below orders the
  ;; tasks by the time they finished, newest first. Then finds the first row after skipping `num-rows-to-keep`. Using
  ;; the date that task finished, it deletes everything after that. As we continue to add TaskHistory entries, this
  ;; ensures we'll have a good amount of history for debugging/troubleshooting, but not grow too large and fill the
  ;; disk.
  (when-let [clean-before-date (task-history.db/nth-newest-task-history-ended-at num-rows-to-keep)]
    (task-history.db/delete-task-history-ended-before! clean-before-date)))

(def ^:private task-history-status #{:started :success :failed :unknown})

(defn- assert-task-history-status
  [status]
  (assert (task-history-status (keyword status)) "Invalid task history status"))

(t2/define-after-insert :model/TaskHistory
  [task-history]
  (assert-task-history-status (:status task-history))
  task-history)

(t2/define-before-update :model/TaskHistory
  [task-history]
  (assert-task-history-status (:status task-history))
  task-history)

(defn- logs-out
  "`:logs` is a JSON array of captured entries, or, for a task run with debug log capture, the plain-text log itself."
  [s]
  (if (and (string? s) (str/starts-with? s "["))
    (mi/json-out-with-keywordization s)
    s))

(t2/deftransforms :model/TaskHistory
  {:task_details mi/transform-json-eliding
   :logs         {:in mi/json-in, :out logs-out}
   :status       mi/transform-keyword})

(def FilterParams
  "Schema for filter for task history."
  [:map {:closed true}
   [:status {:optional true} (into [:enum] task-history-status)]
   [:task {:optional true} [:string {:min 1}]]])

(def ^:private available-sort-columns
  #{:started_at :ended_at :duration :task :status :db_name :db_engine})

(def SortParams
  "Sorting map schema."
  [:map {:closed true}
   [:sort_column    {:default :started_at} (into [:enum] available-sort-columns)]
   [:sort_direction {:default :desc}       [:enum :asc :desc]]])

(def FilterAndSortParams
  "The query params of `GET /api/task`: [[FilterParams]] and [[SortParams]] together. `:merge` merges the two maps'
  properties, so the result is closed like both of its halves."
  [:merge FilterParams SortParams])

(mu/defn all
  "Return all TaskHistory entries, filtered if `filter` is provided, applying `limit` and `offset` if not nil."
  [limit  :- [:maybe ms/PositiveInt]
   offset :- [:maybe ms/IntGreaterThanOrEqualToZero]
   {:keys [status task sort_column sort_direction]} :- [:maybe FilterAndSortParams]]
  (task-history.db/task-histories status task (or sort_column :started_at) (or sort_direction :desc) limit offset))

(mu/defn total
  "Return count of all, or filtered if `filter` is provided, task history entries."
  [{:keys [status task]} :- [:maybe FilterAndSortParams]]
  (task-history.db/task-history-count status task))

(defn unique-tasks
  "Return _vector_ of all unique tasks' names in alphabetical order."
  []
  (vec (task-history.db/distinct-task-names)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            with-task-history macro                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private TaskHistoryCallBackInfo
  [:map {:closed true}
   [:status                        (into [:enum] task-history-status)]
   [:task_details {:optional true} [:maybe :map]]])

(def ^:private TaskHistoryInfo
  "Schema for `info` passed to the `with-task-history` macro."
  [:map {:closed true}
   [:task                             ms/NonBlankString] ; task name, i.e. `send-pulses`. Conventionally lisp-cased
   [:db_id           {:optional true} [:maybe :int]]     ; DB involved, for sync operations or other tasks where this is applicable.
   [:on-success-info {:optional true} [:maybe [:=> [:cat TaskHistoryCallBackInfo :any]
                                               ::task-history.schema/task-history.update]]]
   [:on-fail-info    {:optional true} [:maybe [:=> [:cat TaskHistoryCallBackInfo (ms/InstanceOfClass Throwable)]
                                               ::task-history.schema/task-history.update]]]
   [:task_details    {:optional true} [:maybe ::task-history.schema/task-history.task-details]]]) ; additional map of details to include in the recorded row

(defn- ns->ms [nanoseconds]
  (long (/ nanoseconds 1e6)))

(defn- update-task-history!
  [th-id startime-ns info]
  (let [updated-info (merge {:ended_at (t/instant)
                             :duration (ns->ms (- (System/nanoTime) startime-ns))}
                            info)]
    (task-history.db/update-task-history! th-id updated-info)))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic ^Clock *log-capture-clock*
  "The java.time.Clock used for captured log message `:timestamp` values. Can be overridden for tests."
  (Clock/systemUTC))

(def ^:private log-capture-truncation-threshold 100)

(defn- log-capture-atom []
  (atom {:queue PersistentQueue/EMPTY
         :trunc {:start-timestamp nil, :last-timestamp nil :levels {}}}))

(defn- elide-string
  "Elides the string to the specified length, adding '...' if it exceeds that length."
  [s max-length]
  (if (> (count s) max-length)
    (str (subs s 0 (- max-length 3)) "...")
    s))

(defn- format-timestamp
  "Format a timestamp from the clock as an ISO instant string."
  [^Clock clock]
  (t/format :iso-instant (t/instant clock)))

(defn- log-capture-entries [{:keys [queue trunc]}]
  (if (nil? (:last-timestamp trunc))
    (vec queue)
    (into [{:level     :info
            :timestamp (:last-timestamp trunc)
            :fqns      "metabase.task-history"
            :msg       (format "[truncated] %d messages" (apply + (vals (:levels trunc))))
            :trunc     trunc}]
          queue)))

(defn- log-capture-entry [fqns level msg ^Throwable e]
  (cond->
   {:level     level
    :timestamp (format-timestamp *log-capture-clock*)
    :fqns      (str fqns)
    :msg       (elide-string (str msg) 4000)
    :process_uuid config/local-process-uuid}
    e (assoc :exception
             (take 20 (map #(elide-string (str %) 500)
                           (seq (ExceptionUtils/getStackFrames e)))))))

(defn- add-log-capture-entry [{:keys [queue, trunc]} entry]
  (if (< (count queue) log-capture-truncation-threshold)
    {:queue (conj queue entry), :trunc trunc}
    (let [removed                           (peek queue)
          {:keys [start-timestamp, levels]} trunc]
      {:queue (conj (pop queue) entry)
       :trunc {:levels          (update levels (:level removed) (fnil inc 0))
               :start-timestamp (or start-timestamp (:timestamp removed))
               :last-timestamp  (:timestamp removed)}})))

(defn- log-capture-factory [base-factory logs-atom]
  (reify clojure.tools.logging.impl/LoggerFactory
    (name [_] "metabase.task_history")
    (get-logger [_ logger-ns]
      (let [base-logger (clojure.tools.logging.impl/get-logger base-factory logger-ns)]
        (reify clojure.tools.logging.impl/Logger
          (enabled? [_ level] (clojure.tools.logging.impl/enabled? base-logger level))
          (write! [_ level ex msg]
            (case level
              (:fatal :error :warn :info)
              (swap! logs-atom add-log-capture-entry (log-capture-entry logger-ns level msg ex))
              nil)
            (clojure.tools.logging.impl/write! base-logger level ex msg)))))))

;;; Debug log capture: a user-triggered sync/scan runs inside [[with-debug-log-capture]], which raises the relevant
;;; loggers to DEBUG or TRACE and stores every line the task's thread logs, as plain text in `:logs`, instead of the 100-entry
;;; summary above. One byte budget is shared by all the tasks of the capture.

(def ^:private debug-log-max-bytes (* 10 1024 1024))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic ^:private *debug-capture*
  "`{:remaining (atom bytes), :dropped (atom lines)}` while inside [[with-debug-log-capture]]."
  nil)

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic ^:private ^StringBuilder *debug-task-log*
  "The buffer of the innermost task on this thread, while a debug capture is active."
  nil)

(defonce ^:private debug-capture-running? (atom false))

(defn debug-log-capture-active?
  "Whether a debug log capture is running on this instance. Only one runs at a time."
  []
  @debug-capture-running?)

(defn- redact
  "Connection details and JDBC specs get logged at TRACE. Mask the values of their secret-looking keys, in Clojure
  map, JSON, and `key=value` spellings, and basic-auth headers like the server log does."
  [^String line]
  (-> line
      (str/replace #":basic-auth \[[^\]]*\]" ":basic-auth [redacted]")
      (str/replace #"(?i)((?:password|passwd|secret|token|private[-_]?key|access[-_]?key)[\w-]*\"?\s*[=:]?\s*)(\"[^\"]*\"|\S+)"
                   "$1[redacted]")))

(defn- capture-debug-line! [^String line]
  (when-let [^StringBuilder sb *debug-task-log*]
    (let [{:keys [remaining dropped]} *debug-capture*
          ^String line                (redact line)
          n                           (alength (.getBytes line "UTF-8"))]
      (if (>= (swap! remaining - n) 0)
        (.append sb line)
        (swap! dropped inc)))))

(defn- debug-task-log-text [^StringBuilder sb]
  (let [dropped @(:dropped *debug-capture*)]
    (cond-> (str sb)
      (pos? dropped) (str (format "Debug log limit of %d MB reached; %d lines were dropped.%n"
                                  (quot debug-log-max-bytes (* 1024 1024)) dropped)))))

(defn do-with-debug-log-capture
  "Impl for [[with-debug-log-capture]]."
  [logger-names level f]
  (when-not (compare-and-set! debug-capture-running? false true)
    (throw (ex-info "A debug log capture is already running." {:status-code 409})))
  (try
    (binding [*debug-capture* {:remaining (atom debug-log-max-bytes), :dropped (atom 0)}]
      (logger/do-with-level-capture logger-names level capture-debug-line! f))
    (finally
      (reset! debug-capture-running? false))))

(defmacro with-debug-log-capture
  "Run `body` with the loggers named by `logger-names` raised to `level` (`:debug` or `:trace`), storing every line
  logged by the tasks inside it as plain text in their `:logs`, up to 10 MB in total. The server log is not affected.
  Only one capture runs at a time; a second one fails with a 409."
  {:style/indent 2}
  [logger-names level & body]
  `(do-with-debug-log-capture ~logger-names ~level (fn [] ~@body)))

(mu/defn do-with-task-history
  "Impl for `with-task-history` macro; see documentation below."
  [info :- TaskHistoryInfo
   f    :- ifn?]
  (let [on-success-info (or (:on-success-info info) (fn [& args] (first args)))
        on-fail-info    (or (:on-fail-info info) (fn [& args] (first args)))
        info            (dissoc info :on-success-info :on-fail-info)
        start-time-ns   (System/nanoTime)
        run-id          (task-run/current-run-id)
        th-id           (task-history.db/insert-task-history!
                         (cond-> (assoc info
                                        :status     :started
                                        :started_at (t/instant))
                           run-id (assoc :run_id run-id)))
        debug?          (some? *debug-capture*)
        logs-atom       (log-capture-atom)
        debug-log       (when debug? (StringBuilder.))
        logs            (fn []
                          (if debug?
                            (debug-task-log-text debug-log)
                            (log-capture-entries @logs-atom)))]
    (binding [clojure.tools.logging/*logger-factory* (if debug?
                                                       clojure.tools.logging/*logger-factory*
                                                       (log-capture-factory clojure.tools.logging/*logger-factory* logs-atom))
              *debug-task-log*                       debug-log]
      (try
        (u/prog1 (f)
          (update-task-history! th-id start-time-ns (on-success-info {:status       :success
                                                                      :task_details (:task_details info)
                                                                      :logs         (logs)}
                                                                     <>)))
        (catch Throwable e
          (update-task-history! th-id start-time-ns
                                (on-fail-info {:task_details {:status        :failed
                                                              :exception     (class e)
                                                              :message       (.getMessage e)
                                                              :stacktrace    (u/filtered-stacktrace e)
                                                              :ex-data       (ex-data e)
                                                              :original-info (:task_details info)}
                                               :logs         (logs)
                                               :status       :failed}
                                              e))
          (throw e))))))

(defmacro with-task-history
  "Record a TaskHistory before executing the body, updating TaskHistory accordingly when the body completes.
  `info` should contain at least a name for the task (conventionally lisp-cased) as `:task`;
  see the `TaskHistoryInfo` schema in this namespace for other optional keys.

    (with-task-history {:task \"send-pulses\"
                        :db_id 1
                        :on-success-info (fn [info thunk-result] (assoc-in info [:task-details :thunk-result] thunk-result)})
                        :on-fail-info (fn [info e] (assoc-in info [:task-details :exception-class] (class e)))}
      ...)

  Optionally takes:
    - on-success-info: a function that takes the updated task history and the result of the task,
      returns a map of task history info to update when the task succeeds.
    - on-fail-info: a function that takes the updated task history and the exception thrown by the task,
      returns a map of task history info to update when the task fails."
  {:style/indent 1}
  [info & body]
  `(do-with-task-history ~info (fn [] ~@body)))

;; TaskHistory can contain an exception for logging purposes, so use the built-in
;; serialization of a `Throwable->map` to make this something that can be JSON encoded.
(json/add-encoder
 Throwable
 (fn [throwable json-generator]
   (json/generate-map (Throwable->map throwable) json-generator)))
