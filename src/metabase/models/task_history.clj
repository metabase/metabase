(ns metabase.models.task-history
  (:require
   [cheshire.generate :refer [add-encoder encode-map]]
   [java-time.api :as t]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util :as u]
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

(def ^:private task-history-status #{:started :success :failed})

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
  {:task_details mi/transform-json
   :status       mi/transform-keyword})

(mu/defn all
  "Return all TaskHistory entries, applying `limit` and `offset` if not nil"
  [limit  :- [:maybe ms/PositiveInt]
   offset :- [:maybe ms/IntGreaterThanOrEqualToZero]]
  (t2/select TaskHistory (merge {:order-by [[:started_at :desc]]}
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
   [:task                             ms/NonBlankString] ; task name, i.e. `send-pulses`. Conventionally lisp-cased
   [:db_id           {:optional true} [:maybe :int]]     ; DB involved, for sync operations or other tasks where this is applicable.
   ;; a function that takes the result of the task and returns a map of additional info to update task history when the task succeeds
   [:on-success-info {:optional true} [:maybe [:=> [:cat :any] :map]]]
   [:task_details    {:optional true} [:maybe :map]]])   ; additional map of details to include in the recorded row

(def ^:private ns->ms #(int (/ % 1e6)))

(defn- update-task-history!
  [th-id startime-ns info]
  (let [updated-info (merge {:ended_at (t/instant)
                             :duration (ns->ms (- (System/nanoTime) startime-ns))}
                            info)]
    (t2/update! :model/TaskHistory th-id updated-info)))

(mu/defn do-with-task-history
  "Impl for `with-task-history` macro; see documentation below."
  [info :- TaskHistoryInfo f]
  (let [on-success-info (:on-success-info info)
        info            (dissoc info :on-success-info)
        start-time-ns   (System/nanoTime)
        th-id           (t2/insert-returning-pk! :model/TaskHistory
                                                 (assoc info
                                                        :status     :started
                                                        :started_at (t/instant)))]
    (try
      (u/prog1 (f)
        (update-task-history! th-id start-time-ns (cond-> {:status :success}
                                                    (some? on-success-info)
                                                    (merge (on-success-info <>)))))
      (catch Throwable e
        (update-task-history! th-id start-time-ns {:task_details {:status        :failed
                                                                  :exception     (class e)
                                                                  :message       (.getMessage e)
                                                                  :stacktrace    (u/filtered-stacktrace e)
                                                                  :ex-data       (ex-data e)
                                                                  :original-info (:task_details info)}
                                                   :status       :failed})
        (throw e)))))

(defmacro with-task-history
  "Record a TaskHistory before executing the body, updating TaskHistory accordingly when the body completes.
  `info` should contain at least a name for the task (conventionally
  lisp-cased) as `:task`; see the `TaskHistoryInfo` schema in this namespace for other optional keys.

    (with-task-history {:task \"send-pulses\"
                        :db_id 1
                        :on-success-info (fn [thunk-result] {:status :failed})}
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
