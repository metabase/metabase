(ns metabase.mq.db
  "Application database queries for the message queue module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn waiting-queue-triggers-before :- [:sequential [:map {:closed true} [:trigger_name :string] [:job_name :string]]]
  "The `{:trigger_name :job_name}` rows of `trigger-group` triggers in `sched-name`'s Quartz store that are `WAITING`
  and started before `threshold` (epoch ms)."
  [sched-name    :- :string
   trigger-group :- :string
   threshold     :- :int]
  ;; unquoted upper-case `QRTZ_TRIGGERS` resolves on every app DB; see [[metabase.mq.task.queue-reaper]].
  (t2/query [(str "SELECT trigger_name, job_name FROM QRTZ_TRIGGERS"
                  " WHERE sched_name = ? AND trigger_group = ? AND trigger_state = 'WAITING'"
                  " AND start_time < ?")
             sched-name trigger-group threshold]))

(mu/defn insert-outbox-row! :- ms/PositiveInt
  "Insert a `queue_message_outbox` row for `queue-name` with `payload` and return its id."
  [queue-name :- :string
   payload    :- :string]
  (t2/insert-returning-pk! :queue_message_outbox {:queue_name queue-name, :payload payload}))

(mu/defn delete-outbox-rows! :- :int
  "Delete the `queue_message_outbox` rows with `ids`, returning the number deleted."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :queue_message_outbox :id [:in ids]))

(def ^:private DueOutbox
  "Rows returned by [[due-outbox-rows]]."
  [:map {:closed true}
   [:id :int]
   [:queue_name :string]
   [:payload :string]
   [:publish_attempts :int]])

(mu/defn due-outbox-rows :- [:sequential DueOutbox]
  "Up to `limit` `queue_message_outbox` rows after `after-id`, in id order, that are due: never attempted and created
  before `created-before`, or scheduled to retry at or before `now`. Locked with the `for` clause `for-clause`.
  `now` and `created-before` are `java.sql.Timestamp`s, not `java.time` instants."
  [after-id       :- ms/IntGreaterThanOrEqualToZero
   now            :- ms/TemporalInstant
   created-before :- ms/TemporalInstant
   limit          :- ms/PositiveInt
   for-clause     :- [:sequential :keyword]]
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

(mu/defn bump-outbox-row! :- :int
  "Increment the publish attempts of the `queue_message_outbox` row with `id` and schedule its next attempt,
  returning the number updated. `next-attempt-at` is a `java.sql.Timestamp`, not a `java.time` instant."
  [id              :- ms/PositiveInt
   next-attempt-at :- ms/TemporalInstant]
  (t2/update! :queue_message_outbox :id id
              {:publish_attempts [:+ :publish_attempts [:inline 1]]
               :next_attempt_at  next-attempt-at}))
