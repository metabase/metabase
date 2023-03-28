(ns metabase.models.task-history
  (:require
   [cheshire.core :as json]
   [cheshire.generate :refer [add-encoder encode-map]]
   [java-time :as t]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.common :refer [*current-user-id*]]
   [metabase.models.database :refer [Database]]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan.models :as models]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(models/defmodel TaskHistory :task_history)

(doto TaskHistory
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set))

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

;;; Permissions to read or write Task. If `advanced-permissions` is enabled it requires superusers or non-admins with
;;; monitoring permissions, Otherwise it requires superusers.
(defmethod mi/perms-objects-set TaskHistory
  [_task _read-or-write]
  #{(if (premium-features/enable-advanced-permissions?)
      (perms/application-perms-path :monitoring)
      "/")})

(defn- task-details-for-snowplow
  "Ensure task_details is less than 2048 characters.

  2048 is the length limit for task_details in our snowplow schema, if exceeds this limit,
  the event will be considered a bad rows and ignored.

  Most of the times it's < 200 characters, but there are cases task-details contains an exception.
  In those case, we want to make sure the stacktrace are ignored from the task-details.

  Return nil if After trying to strip out the stacktraces and the stringified task-details
  still has more than 2048 chars."
  [task-details]
  (let [;; task-details is {:throwable e} during sync
        ;; check [[metabase.sync.util/run-step-with-metadata]]
        task-details (cond-> task-details
                       (some? (:throwable task-details))
                       (update :throwable dissoc :trace :via)

                       ;; if task-history is created via `with-task-history
                       ;; the exception is manually caught and includes a stacktrace
                       true
                       (dissoc :stacktrace)

                       true
                       (dissoc :trace :via))
        as-string     (json/generate-string task-details)]
    (if (>= (count as-string) 2048)
      nil
      as-string)))

(defn- task->snowplow-event
  [task]
  (let [task-details (:task_details task)]
    (merge {:task_id      (:id task)
            :task_name    (:task task)
            :duration     (:duration task)
            :task_details (task-details-for-snowplow task-details)
            :started_at   (u.date/format-rfc3339 (:started_at task))
            :ended_at     (u.date/format-rfc3339 (:ended_at task))}
           (when-let [db-id (:db_id task)]
             {:db_id     db-id
              :db_engine (t2/select-one-fn :engine Database :id db-id)}))))

(defn- post-insert
  [task]
  (u/prog1 task
    (snowplow/track-event! ::snowplow/new-task-history *current-user-id* (task->snowplow-event <>))))

(mi/define-methods
 TaskHistory
 {:types      (constantly {:task_details :json})
  :post-insert post-insert})

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
