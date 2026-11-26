(ns metabase.mq.db
  "Application database queries for the message queue module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn quartz-table
  "The Quartz table `table`, upper case on MySQL and lower case elsewhere, as Quartz's schema creates it."
  [table]
  (if (= :mysql (mdb/db-type)) table (keyword (u/lower-case-en (name table)))))

(mu/defn waiting-queue-triggers-before
  "The `{:trigger_name :job_name}` rows of `trigger-group` triggers in `sched-name`'s Quartz store that are `WAITING`
  and started before `threshold` (epoch ms)."
  [sched-name    :- :string
   trigger-group :- :string
   threshold     :- :int]
  (t2/query {:select [:trigger_name :job_name]
             :from   [(quartz-table :QRTZ_TRIGGERS)]
             :where  [:and
                      [:= :sched_name sched-name]
                      [:= :trigger_group trigger-group]
                      [:= :trigger_state "WAITING"]
                      [:< :start_time threshold]]}))

(mu/defn insert-outbox-row!
  "Insert a `queue_message_outbox` row for `queue-name` with `payload` and return its id."
  [queue-name :- :string
   payload    :- :string]
  (t2/insert-returning-pk! :queue_message_outbox {:queue_name queue-name, :payload payload}))

(mu/defn delete-outbox-rows!
  "Delete the `queue_message_outbox` rows with `ids`, returning the number deleted."
  [ids :- [:sequential ms/PositiveInt]]
  (mdb/sum-batched mdb/delete-partition-size #(t2/delete! :queue_message_outbox :id [:in %]) ids))

(mu/defn due-outbox-rows
  "Up to `limit` `queue_message_outbox` rows after `after-id`, in id order, that are due: never attempted and created
  before `created-before`, or scheduled to retry at or before `now`. Locked with the `for` clause `for-clause`.
"
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

(mu/defn bump-outbox-row!
  "Increment the publish attempts of the `queue_message_outbox` row with `id` and schedule its next attempt,
  returning the number updated."
  [id              :- ms/PositiveInt
   next-attempt-at :- ms/TemporalInstant]
  (t2/update! :queue_message_outbox :id id
              {:publish_attempts [:+ :publish_attempts [:inline 1]]
               :next_attempt_at  next-attempt-at}))
