(ns metabase.change-log.log
  "The writes to the change log (see `metabase.change-log.core`)."
  (:require
   [metabase.change-log.db :as change-log.db]
   [metabase.change-log.numbering :as change-log.numbering]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def tracked-models
  "The models whose writes the change log records. A model here must derive `:hook/events`."
  #{:model/Card
    :model/Dashboard
    :model/Database
    :model/Field
    :model/FieldUserSettings
    :model/NativeQuerySnippet
    :model/Notification
    :model/NotificationCard
    :model/NotificationHandler
    :model/NotificationRecipient
    :model/NotificationSubscription
    :model/PermissionsGroup
    :model/PermissionsGroupMembership
    :model/Pulse
    :model/PulseCard
    :model/PulseChannel
    :model/PulseChannelRecipient
    :model/Table
    :model/Tenant
    :model/User})

(defn table-of
  "The name of the table of `model`."
  [model]
  (name (t2/table-name model)))

(defn- throw-or-log
  "Reports a mistake in calling code. In dev and test it throws, so that a test catches it. In production it only logs
  a warning, so that the write goes ahead."
  [message]
  (if config/is-prod?
    (log/warn message)
    (throw (ex-info message {}))))

(defn log!
  "Logs `changes`, a seq of `[table-name row-ids action]`, and wakes the numbering. A row key that is not an integer
  goes to [[throw-or-log]], and gets no entry."
  [changes]
  (doseq [[table-name row-ids action] changes
          :let  [n (count (remove integer? row-ids))]
          :when (pos? n)]
    (throw-or-log (format "Not logging %d %s on %s to the change log: row key missing or not an integer. See %s."
                          n action table-name "metabase.change-log.core")))
  (run! change-log.db/insert-entries!
        (partition-all 1000 (for [[table-name row-ids action] changes
                                  id                          row-ids
                                  :when                       (integer? id)]
                              {:table_name table-name, :row_id id, :action action})))
  ;; Tests number the entries themselves.
  (when-not config/is-test?
    (change-log.numbering/stay-awake!)))

(mu/defn log-rows!
  "Logs `action` on the rows of `model` that match `conditions`, for a write that skips the model. `conditions` are
  what `t2/select` takes after the model, usually the write's own. Call it in the write's transaction, before an
  update or a delete and after an insert:

    (t2/with-transaction [_conn]
      (change-log/log-rows! :model/PulseChannelRecipient :delete :pulse_channel_id channel-id)
      (t2/delete! :pulse_channel_recipient :pulse_channel_id channel-id))

  While the log is off, it does nothing, so a write can call it on an EE model without EE. While the log is on, a
  `model` that is not tracked goes to [[throw-or-log]]. It does not log what a delete cascades to: those rows need
  their own call."
  [model  :- :keyword
   action :- [:enum :insert :update :delete]
   & conditions :- [:* [:maybe [:fn {:description "what `t2/select` takes after the model"} some?]]]]
  (when (premium-features/enable-change-log?)
    (if (contains? tracked-models model)
      (log! [[(table-of model) (change-log.db/matching-pks model (vec conditions)) (name action)]])
      (throw-or-log (format "Not logging %s on %s to the change log: the model is not in `metabase.change-log.log/tracked-models`."
                            (name action) model)))))

(methodical/defmulti ignored-columns
  "The columns of `model` that the change log leaves out. An update that sets only these logs nothing.

    (methodical/defmethod change-log/ignored-columns :model/Dashboard [_model]
      #{:last_viewed_at :view_count})"
  {:arglists '([model])}
  identity)

(methodical/defmethod ignored-columns :default [_model] #{})
