(ns metabase.models.task-history
  (:require
   [cheshire.generate :refer [add-encoder encode-map]]
   [java-time :as t]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.schema :as su]
   [methodical.core :as methodical]
   [schema.core :as s]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(def TaskHistory
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], now it's a reference to the toucan2 model name.
  We'll keep this till we replace all the symbols in our codebase."
  :model/TaskHistory)

(methodical/defmethod t2/table-name :model/TaskHistory [_model] :task_history)

(doto :model/TaskHistory
  (derive :metabase/model)
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set))

(t2/deftransforms :model/TaskHistory
  {:task_details mi/transform-json})

(s/defn all
  "Return all TaskHistory entries, applying `limit` and `offset` if not nil"
  [limit  :- (s/maybe su/IntGreaterThanZero)
   offset :- (s/maybe su/IntGreaterThanOrEqualToZero)]
  (t2/select TaskHistory (merge {:order-by [[:ended_at :desc]]}
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
      (first (t2/insert-returning-instances! TaskHistory
                                             (assoc info
                                                    :started_at (t/instant start-time-ms)
                                                    :ended_at   (t/instant end-time-ms)
                                                    :duration   duration-ms)))
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

;; TaskHistory can contain an exception for logging purposes, so use the built-in
;; serialization of a `Throwable->map` to make this something that can be JSON encoded.
(add-encoder
 Throwable
 (fn [throwable json-generator]
   (encode-map (Throwable->map throwable) json-generator)))
