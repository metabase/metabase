(ns metabase.models.task-history
  (:require
   [cheshire.generate :refer [add-encoder encode-map]]
   [java-time.api :as t]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
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

;;; Permissions to read or write Task. If `advanced-permissions` is enabled it requires superusers or non-admins with
;;; monitoring permissions, Otherwise it requires superusers.
(defmethod mi/perms-objects-set TaskHistory
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
  (when-let [clean-before-date (t2/select-one-fn :ended_at TaskHistory {:limit    1
                                                                        :offset   num-rows-to-keep
                                                                        :order-by [[:ended_at :desc]]})]
    (t2/delete! (t2/table-name TaskHistory) :ended_at [:<= clean-before-date])))

(t2/deftransforms :model/TaskHistory
  {:task_details mi/transform-json})

(mu/defn all
  "Return all TaskHistory entries, applying `limit` and `offset` if not nil"
  [limit  :- [:maybe ms/PositiveInt]
   offset :- [:maybe ms/IntGreaterThanOrEqualToZero]]
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
  [:map {:closed true}
   [:task                          ms/NonBlankString] ; task name, i.e. `send-pulses`. Conventionally lisp-cased
   [:db_id        {:optional true} [:maybe :int]]     ; DB involved, for sync operations or other tasks where this is applicable.
   [:task_details {:optional true} [:maybe :map]]])   ; additional map of details to include in the recorded row

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
        (log/warn e "Error saving task history")))))

(mu/defn do-with-task-history
  "Impl for `with-task-history` macro; see documentation below."
  [info :- TaskHistoryInfo f]
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
