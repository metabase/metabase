(ns metabase.models.task-history
  (:require [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase.models.interface :as i]
            [metabase.util :as u]
            [metabase.util
             [i18n :refer [trs]]
             [schema :as su]]
            [schema.core :as s]
            [toucan
             [db :as db]
             [models :as models]]))

(models/defmodel TaskHistory :task_history)

(defn cleanup-task-history!
  "Deletes older TaskHistory rows. Will order TaskHistory by `ended_at` and delete everything after `num-rows-to-keep`.
  This is intended for a quick cleanup of old rows. Returns `true` if something was deleted."
  [num-rows-to-keep]
  ;; Ideally this would be one query, but MySQL does not allow nested queries with a limit. The query below orders the
  ;; tasks by the time they finished, newest first. Then finds the first row after skipping `num-rows-to-keep`. Using
  ;; the date that task finished, it deletes everything after that. As we continue to add TaskHistory entries, this
  ;; ensures we'll have a good amount of history for debugging/troubleshooting, but not grow too large and fill the
  ;; disk.
  (when-let [clean-before-date (db/select-one-field :ended_at TaskHistory {:limit    1
                                                                           :offset   num-rows-to-keep
                                                                           :order-by [[:ended_at :desc]]})]
    (db/simple-delete! TaskHistory :ended_at [:<= clean-before-date])))

(u/strict-extend (class TaskHistory)
  models/IModel
  (merge models/IModelDefaults
         {:types (constantly {:task_details :json})})
  i/IObjectPermissions
  (merge i/IObjectPermissionsDefaults
         {:can-read?  i/superuser?
          :can-write? i/superuser?}))

(s/defn all
  "Return all TaskHistory entries, applying `limit` and `offset` if not nil"
  [limit  :- (s/maybe su/IntGreaterThanZero)
   offset :- (s/maybe su/IntGreaterThanOrEqualToZero)]
  (db/select TaskHistory (merge {:order-by [[:ended_at :desc]]}
                                (when limit
                                  {:limit limit})
                                (when offset
                                  {:offset offset}))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            with-task-history macro                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private TaskHistoryInfo
  "Schema for `info` passed to the `with-task-history` macro."
  {:task                          su/NonBlankString  ; task name, i.e. `send-pulses`. Conventionally lisp-cased
   (s/optional-key :db_id)        (s/maybe s/Int)    ; DB involved, for sync operations or other tasks where this is applicable.
   (s/optional-key :task_details) (s/maybe su/Map)}) ; additional map of details to include in the recorded row

(defn- save-task-history! [start-time-ms info]
  (let [end-time-ms (System/currentTimeMillis)
        duration-ms (- end-time-ms start-time-ms)]
    (try
      (db/insert! TaskHistory
        (assoc info
          :started_at (t/instant start-time-ms)
          :ended_at   (t/instant end-time-ms)
          :duration   duration-ms))
      (catch Throwable e
        (log/warn e (trs "Error saving task history"))))))

(s/defn do-with-task-history
  "Impl for `with-task-history` macro; see documentation below."
  [info :- TaskHistoryInfo, f]
  (let [start-time-ms (System/currentTimeMillis)]
    (try
      (u/prog1 (f)
        (save-task-history! start-time-ms info))
      (catch Throwable e
        (let [info (assoc info :task_details {:status        :failed
                                              :exception     (class e)
                                              :message       (.getMessage e)
                                              :stacktrace    (u/filtered-stacktrace e)
                                              :ex-data       (ex-data e)
                                              :original-info (:task_details info)})]
          (save-task-history! start-time-ms info))
        (throw e)))))

(defmacro with-task-history
  "Execute `body`, recording a TaskHistory entry when the task completes; if it failed to complete, records an entry
  containing information about the Exception. `info` should contain at least a name for the task (conventionally
  lisp-cased) as `:task`; see the `TaskHistoryInfo` schema in this namespace for other optional keys.

    (with-task-history {:task \"send-pulses\"}
      ...)"
  {:style/indent 1}
  [info & body]
  `(do-with-task-history ~info (fn [] ~@body)))
