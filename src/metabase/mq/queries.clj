(ns metabase.mq.queries
  "Application database queries for the message queue module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn waiting-queue-triggers-before
  "The `{:trigger_name :job_name}` rows of `trigger-group` triggers in `sched-name`'s Quartz store that are `WAITING`
  and started before `threshold` (epoch ms)."
  [sched-name trigger-group threshold]
  ;; unquoted upper-case `QRTZ_TRIGGERS` resolves on every app DB; see [[metabase.mq.task.queue-reaper]].
  (t2/query [(str "SELECT trigger_name, job_name FROM QRTZ_TRIGGERS"
                  " WHERE sched_name = ? AND trigger_group = ? AND trigger_state = 'WAITING'"
                  " AND start_time < ?")
             sched-name trigger-group threshold]))

(defn insert-outbox-row!
  "Insert a `queue_message_outbox` row for `queue-name` with `payload` and return its id."
  [queue-name payload]
  (t2/insert-returning-pk! :queue_message_outbox {:queue_name queue-name, :payload payload}))

(defn delete-outbox-rows!
  "Delete the `queue_message_outbox` rows with `ids`."
  [ids]
  (t2/delete! :queue_message_outbox :id [:in ids]))

(defn due-outbox-rows
  "Up to `limit` `queue_message_outbox` rows after `after-id`, in id order, that are due: never attempted and created
  before `created-before`, or scheduled to retry at or before `now`. Locked with the `for` clause `for-clause`."
  [after-id now created-before limit for-clause]
  (t2/query {:select   [:id :queue_name :payload :publish_attempts]
             :from     [:queue_message_outbox]
             :where    [:and
                        [:> :id after-id]
                        [:or
                         [:and [:= :next_attempt_at nil] [:< :created_at created-before]]
                         [:<= :next_attempt_at now]]]
             :order-by [[:id :asc]]
             :limit    limit
             :for      for-clause}))

(defn bump-outbox-row!
  "Increment the publish attempts of the `queue_message_outbox` row with `id` and schedule its next attempt."
  [id next-attempt-at]
  (t2/update! :queue_message_outbox :id id
              {:publish_attempts [:+ :publish_attempts [:inline 1]]
               :next_attempt_at  next-attempt-at}))
