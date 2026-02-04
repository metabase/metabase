(ns metabase.task-history.models.task-history
  (:require
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [clojure.tools.logging]
   [clojure.tools.logging.impl]
   [java-time.api :as t]
   [metabase.config.core :as config]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.task-history.models.task-run :as task-run]
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
  (when-let [clean-before-date (t2/select-one-fn :ended_at :model/TaskHistory {:limit    1
                                                                               :offset   num-rows-to-keep
                                                                               :order-by [[:ended_at :desc]]})]
    (t2/delete! (t2/table-name :model/TaskHistory) :ended_at [:<= clean-before-date])))

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

(t2/deftransforms :model/TaskHistory
  {:task_details mi/transform-json-eliding
   :logs         mi/transform-json
   :status       mi/transform-keyword})

(defn- params->where
  [{:keys [status task]}]
  (when (or status task)
    {:where (cond-> [:and]
              task   (conj [:= :task task])
              status (conj [:= :status (name status)]))}))

(def FilterParams
  "Schema for filter for task history."
  [:map
   [:status {:optional true} (into [:enum] task-history-status)]
   [:task {:optional true} [:string {:min 1}]]])

(defn- params->order-by
  [{col :sort_column
    dir :sort_direction}]
  {:order-by [[col dir]]})

(def ^:private available-sort-columns
  #{:duration :ended_at :started_at})

(def SortParams
  "Sorting map schema."
  [:map
   [:sort_column    {:default :started_at} (into [:enum] available-sort-columns)]
   [:sort_direction {:default :desc}       [:enum :asc :desc]]])

(mu/defn all
  "Return all TaskHistory entries, filtered if `filter` is provided, applying `limit` and `offset` if not nil."
  [limit  :- [:maybe ms/PositiveInt]
   offset :- [:maybe ms/IntGreaterThanOrEqualToZero]
   params :- [:maybe [:merge FilterParams SortParams]]]
  (t2/select :model/TaskHistory (merge (params->where params)
                                       (params->order-by params)
                                       (when limit
                                         {:limit limit})
                                       (when offset
                                         {:offset offset}))))

(mu/defn total
  "Return count of all, or filtered if `filter` is provided, task history entries."
  [params :- FilterParams]
  (t2/count :model/TaskHistory ((fnil identity {}) (params->where params))))

(defn unique-tasks
  "Return _vector_ of all unique tasks' names in alphabetical order."
  []
  (vec (t2/select-fn-vec :task [:model/TaskHistory :task] {:group-by [:task]
                                                           :order-by [:task]})))

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
   [:on-success-info {:optional true} [:maybe [:=> [:cat TaskHistoryCallBackInfo :any] :map]]]
   [:on-fail-info    {:optional true} [:maybe [:=> [:cat TaskHistoryCallBackInfo :any] :map]]]
   [:task_details    {:optional true} [:maybe :map]]])   ; additional map of details to include in the recorded row

(defn- ns->ms [nanoseconds]
  (long (/ nanoseconds 1e6)))

(defn- update-task-history!
  [th-id startime-ns info]
  (let [updated-info (merge {:ended_at (t/instant)
                             :duration (ns->ms (- (System/nanoTime) startime-ns))}
                            info)]
    (t2/update! :model/TaskHistory th-id updated-info)))

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

(mu/defn do-with-task-history
  "Impl for `with-task-history` macro; see documentation below."
  [info :- TaskHistoryInfo f]
  (let [on-success-info (or (:on-success-info info) (fn [& args] (first args)))
        on-fail-info    (or (:on-fail-info info) (fn [& args] (first args)))
        info            (dissoc info :on-success-info :on-fail-info)
        start-time-ns   (System/nanoTime)
        run-id          (task-run/current-run-id)
        th-id           (t2/insert-returning-pk! :model/TaskHistory
                                                 (cond-> (assoc info
                                                                :status     :started
                                                                :started_at (t/instant))
                                                   run-id (assoc :run_id run-id)))
        logs-atom       (log-capture-atom)]
    (binding [clojure.tools.logging/*logger-factory*
              (log-capture-factory clojure.tools.logging/*logger-factory* logs-atom)]
      (try
        (u/prog1 (f)
          (update-task-history! th-id start-time-ns (on-success-info {:status       :success
                                                                      :task_details (:task_details info)
                                                                      :logs         (log-capture-entries @logs-atom)}
                                                                     <>)))
        (catch Throwable e
          (update-task-history! th-id start-time-ns
                                (on-fail-info {:task_details {:status        :failed
                                                              :exception     (class e)
                                                              :message       (.getMessage e)
                                                              :stacktrace    (u/filtered-stacktrace e)
                                                              :ex-data       (ex-data e)
                                                              :original-info (:task_details info)}
                                               :logs         (log-capture-entries @logs-atom)
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
