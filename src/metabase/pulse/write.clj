(ns metabase.pulse.write
  "The write functions of Pulses and their PulseCards, PulseChannels and PulseChannelRecipients, through which every
  writer creates, updates and deletes them."
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.notification.write :as notification.write]
   [metabase.pulse.db :as pulse.db]
   [metabase.pulse.schema :as pulse.schema]
   [metabase.pulse.task.send-pulses-trigger :as task.send-pulses-trigger]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(defn- changed
  "The columns of `changes` whose values differ from those of `row`."
  [row changes]
  (into {} (remove (fn [[k v]] (= v (get row k)))) changes))

(defn- clean-row-or-select
  "`row-or-id` when it is a row the caller loaded, else the row with that id, which `select-row` loads."
  [row-or-id select-row]
  (if (map? row-or-id) row-or-id (select-row row-or-id)))

;;; ------------------------------------------------- PulseChannel --------------------------------------------------

(def ^:private schedule-columns
  "The columns that decide when a PulseChannel is sent."
  #{:schedule_type :schedule_hour :schedule_day :schedule_frame})

(defn validate-email-domains
  "For channels that are being sent to raw email addresses: check that the domains in the emails are allowed by
  the [[metabase-enterprise.advanced-config.settings/subscription-allowed-domains]] Setting, if set. This will no-op
  if `subscription-allowed-domains` is unset or if we do not have a premium token with the `:advanced-config`
  feature."
  [{{:keys [emails]} :details, :keys [recipients], :as pulse-channel}]
  (u/prog1 pulse-channel
    (let [raw-email-recipients (remove :id recipients)
          user-recipients      (filter :id recipients)
          emails               (concat emails (map :email raw-email-recipients))]
      (notification.write/validate-email-domains! emails)
      (when-let [user-ids (not-empty (into #{} (comp (filter some?) (map :id)) user-recipients))]
        (let [user-id->email (pulse.db/user-emails-by-id user-ids)]
          (doseq [{:keys [id email]} user-recipients
                  :let               [correct-email (get user-id->email id)]]
            (when-not correct-email
              (throw (ex-info (tru "User {0} does not exist." id)
                              {:status-code 404})))
            (when (and email
                       (not= email correct-email))
              (throw (ex-info (tru "Wrong email address for User {0}." id)
                              {:status-code 403})))))))))

(defn check-pulse-channel-schedule
  "Throws unless the schedule of `pulse-channel`, whose every column is given, fits its type."
  [pulse-channel]
  (pulse.schema/check-schedule (merge (zipmap schedule-columns (repeat nil)) pulse-channel)))

(defn- check-channel-changes
  "Throws unless `channel`, a PulseChannel as an update leaves it, has valid columns after its `changes`."
  [channel changes]
  (when (some #(contains? changes %) schedule-columns)
    (pulse.schema/check-schedule channel))
  (when (contains? changes :details)
    (validate-email-domains channel)))

(defn- update-send-pulse-triggers!
  "Move the Quartz trigger of `channel`, as it was before an update of `changes`, to its new schedule and enabled
  state."
  [{:keys [pulse_id id] :as channel} changes]
  (let [updated (merge channel changes)]
    (when (some #(contains? changes %) schedule-columns)
      (task.send-pulses-trigger/update-send-pulse-trigger-if-needed! pulse_id channel :remove-pc-ids #{id})
      (task.send-pulses-trigger/update-send-pulse-trigger-if-needed! pulse_id updated :add-pc-ids #{id}))
    (when (contains? changes :enabled)
      (if (:enabled changes)
        (task.send-pulses-trigger/update-send-pulse-trigger-if-needed! pulse_id updated :add-pc-ids #{id})
        (task.send-pulses-trigger/update-send-pulse-trigger-if-needed! pulse_id channel :remove-pc-ids #{id})))))

(declare update-pulse!)

(mu/defn create-pulse-channel!
  "Insert the PulseChannel `row`, whose before-insert hook checks it and whose after-insert hook publishes its create
  event and adds it to the Quartz trigger of its schedule when it is enabled, returning the inserted PulseChannel; for
  `metabase.pulse.models.pulse-channel/create-pulse-channel!`."
  [row :- ::pulse.schema/pulse-channel.update]
  (events/with-batched-events
    (pulse.db/insert-pulse-channel! row)))

(defn- channel-changes
  "The `changes` to `channel` that change it, checked and with the time `now` of the update, or nil when there are none."
  [channel changes now]
  (let [changes (changed channel changes)]
    (when (seq changes)
      (check-channel-changes (merge channel changes) changes)
      (cond-> changes
        (not (contains? changes :updated_at)) (assoc :updated_at now)))))

(mu/defn update-pulse-channels! :- :int
  "Apply `changes` to `channels`, PulseChannels the caller already loaded, in one statement for those the changes update
  alike, publish their update events and move the Quartz trigger of each whose schedule or enabled state changed,
  returning the number of PulseChannels updated; for archiving a Pulse and generic writers."
  [channels :- [:sequential :map]
   changes  :- ::pulse.schema/pulse-channel.changes
   _opts    :- ::pulse.schema/write-opts]
  (let [now   (mi/now)
        plans (into [] (keep (fn [channel] (when-let [final (channel-changes channel changes now)] [channel final])))
                    channels)]
    (when (seq plans)
      (events/with-batched-events
        (doseq [[final group] (group-by second plans)]
          (run! (fn [[channel _]] (update-send-pulse-triggers! channel final)) group)
          (pulse.db/update-pulse-channels! (mapv (comp :id first) group) final)
          (doseq [[channel _] group]
            (events/updated! :model/PulseChannel (merge channel final) channel)))))
    (count plans)))

(mu/defn update-pulse-channel! :- :int
  "Apply `changes` to `channel-or-id`, a PulseChannel the caller already loaded or the id of one, as
  [[update-pulse-channels!]] does, returning the number of PulseChannels updated; for the REST API, unsubscribing and
  `metabase.pulse.models.pulse-channel`."
  [channel-or-id :- [:or ms/PositiveInt :map]
   changes       :- ::pulse.schema/pulse-channel.changes
   opts          :- ::pulse.schema/write-opts]
  (if-let [channel (clean-row-or-select channel-or-id pulse.db/pulse-channel)]
    (update-pulse-channels! [channel] changes opts)
    0))

(defn- prepare-channel-deletion!
  "Archive the Pulse of `channel`, a PulseChannel about to be deleted, when it is the last one and `opts` allow it, and
  remove it from its Quartz trigger."
  [{:keys [pulse_id id] :as channel} opts]
  (when (get opts :archive-parent-pulse? true)
    (when (zero? (pulse.db/other-pulse-channel-count pulse_id id))
      (update-pulse! pulse_id {:archived true} {})))
  (task.send-pulses-trigger/update-send-pulse-trigger-if-needed! pulse_id channel :remove-pc-ids #{id}))

(mu/defn delete-pulse-channels! :- :int
  "Delete the PulseChannels with `ids` and publish their delete events, archiving the Pulse of one that is its last
  channel unless `:archive-parent-pulse?` is false, and removing them from their Quartz triggers, returning the number
  deleted; for the REST API, the send task, a Channel's deactivation and the other write functions here."
  [ids  :- [:maybe [:sequential ms/PositiveInt]]
   opts :- ::pulse.schema/write-opts]
  (let [channels (when (seq ids) (pulse.db/pulse-channels-with-ids ids))]
    (if (empty? channels)
      0
      (events/with-batched-events
        (events/deleting! :model/PulseChannel channels
                          (fn []
                            (run! #(prepare-channel-deletion! % opts) channels)
                            (pulse.db/delete-pulse-channels! (mapv :id channels))))))))

;;; ------------------------------------------- PulseChannelRecipient ----------------------------------------------

(mu/defn create-pulse-channel-recipients!
  "Insert the PulseChannelRecipient `rows`, whose after-insert hook publishes their create events; for
  `metabase.pulse.models.pulse-channel/update-recipients!`."
  [rows :- [:sequential ::pulse.schema/pulse-channel-recipient.update]]
  (events/with-batched-events
    (pulse.db/insert-pulse-channel-recipients! rows)))

(mu/defn update-pulse-channel-recipient! :- :int
  "Apply `changes` to `recipient-or-id`, a PulseChannelRecipient the caller already loaded or the id of one, and publish
  its update event, returning the number updated; for generic writers."
  [recipient-or-id :- [:or ms/PositiveInt :map]
   changes         :- ::pulse.schema/pulse-channel-recipient.update
   _opts           :- ::pulse.schema/write-opts]
  (let [recipient (clean-row-or-select recipient-or-id pulse.db/pulse-channel-recipient)
        changes   (when recipient (changed recipient changes))]
    (if (empty? changes)
      0
      (events/with-batched-events
        (u/prog1 (pulse.db/update-pulse-channel-recipient! (:id recipient) changes)
          (events/updated! :model/PulseChannelRecipient (merge recipient changes) recipient))))))

(defn- delete-channel-of-last-recipient!
  "Delete the PulseChannel of `recipient`, a PulseChannelRecipient about to be deleted, when it is the last recipient
  of a channel without email addresses."
  [{channel-id :pulse_channel_id, recipient-id :id}]
  (when (zero? (pulse.db/other-pulse-channel-recipient-count channel-id recipient-id))
    (when-not (seq (:emails (pulse.db/pulse-channel-details channel-id)))
      (delete-pulse-channels! [channel-id] {}))))

(mu/defn delete-pulse-channel-recipients! :- :int
  "Delete the PulseChannelRecipients with `ids` and publish their delete events, deleting the PulseChannel of the last
  recipient of a channel that has no email addresses, returning the number deleted; for unsubscribing, the
  deactivation of a User and the REST API."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   _opts :- ::pulse.schema/write-opts]
  (let [recipients (when (seq ids) (pulse.db/pulse-channel-recipients-with-ids ids))]
    (if (empty? recipients)
      0
      (events/with-batched-events
        (events/deleting! :model/PulseChannelRecipient recipients
                          (fn []
                            (run! delete-channel-of-last-recipient! recipients)
                            (pulse.db/delete-pulse-channel-recipients! (mapv :id recipients))))))))

(mu/defn remove-pulse-channel-recipients!
  "Delete the PulseChannelRecipients of the Users with `user-ids` on the PulseChannel with `channel-id` and log them in
  the change log, publishing no events and deleting no channel; for `metabase.pulse.models.pulse-channel/update-recipients!`."
  [channel-id :- ms/PositiveInt
   user-ids   :- [:set ::lib.schema.id/user]]
  (pulse.db/delete-pulse-channel-recipients-raw! channel-id user-ids))

;;; ------------------------------------------------- PulseCard -----------------------------------------------------

(mu/defn create-pulse-cards!
  "Insert the PulseCard `rows`, whose after-insert hook publishes their create events; for
  `metabase.pulse.models.pulse-card/bulk-create!` and the Pulse updates."
  [rows :- [:sequential ::pulse.schema/pulse-card.update]]
  (events/with-batched-events
    (pulse.db/insert-pulse-cards! rows)))

(mu/defn update-pulse-card! :- :int
  "Apply `changes` to `card-or-id`, a PulseCard the caller already loaded or the id of one, and publish its update
  event, returning the number updated; for generic writers."
  [card-or-id :- [:or ms/PositiveInt :map]
   changes    :- ::pulse.schema/pulse-card.update
   _opts      :- ::pulse.schema/write-opts]
  (let [pulse-card (clean-row-or-select card-or-id pulse.db/pulse-card)
        changes    (when pulse-card (changed pulse-card changes))]
    (if (empty? changes)
      0
      (events/with-batched-events
        (u/prog1 (pulse.db/update-pulse-card! (:id pulse-card) changes)
          (events/updated! :model/PulseCard (merge pulse-card changes) pulse-card))))))

(mu/defn delete-pulse-cards! :- :int
  "Delete the PulseCards with `ids` and publish their delete events, returning the number deleted; for the DashboardCard
  deletions, the Pulse updates and generic writers."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   _opts :- ::pulse.schema/write-opts]
  (let [pulse-cards (when (seq ids) (pulse.db/pulse-cards-with-ids ids))]
    (if (empty? pulse-cards)
      0
      (events/with-batched-events
        (events/deleting! :model/PulseCard pulse-cards
                          #(pulse.db/delete-pulse-cards! (mapv :id pulse-cards)))))))

(mu/defn delete-pulse-cards-of-pulse! :- :int
  "Delete the PulseCards of the Pulse with `pulse-id` and publish their delete events, returning the number deleted;
  for the Pulse updates."
  [pulse-id :- ::lib.schema.id/pulse]
  (delete-pulse-cards! (mapv :id (pulse.db/pulse-cards-of-pulse pulse-id)) {}))

;;; --------------------------------------------------- Pulse -------------------------------------------------------

(defn- check-dashboard-subscription
  "Throws a 400 when `pulse`, as an update leaves it, is a dashboard subscription with a column of an alert or a
  collection position."
  [{:keys [dashboard_id collection_position alert_condition alert_first_only alert_above_goal]}]
  (when (and dashboard_id (some some? [alert_condition alert_first_only alert_above_goal]))
    (throw (ex-info (tru "A dashboard subscription cannot have the columns of an alert.")
                    {:status-code 400})))
  (when (and dashboard_id (some? collection_position))
    (throw (ex-info (tru "A dashboard subscription cannot have a collection position.")
                    {:status-code 400}))))

(defn- check-pulse-changes
  "Throws unless `changes` to `pulse` are an update a Pulse allows."
  [pulse changes opts]
  (let [merged                (merge pulse changes)
        original-dashboard-id (:dashboard_id pulse)]
    (when (and original-dashboard-id (contains? changes :dashboard_id))
      (throw (ex-info (tru "dashboard ID of a dashboard subscription cannot be modified") {:status-code 400})))
    (when (and original-dashboard-id
               (contains? changes :collection_id)
               (not (:allow-moving-dashboard-subscriptions? opts)))
      (throw (ex-info (tru "collection ID of a dashboard subscription cannot be directly modified") {:status-code 400})))
    (when (contains? changes :collection_id)
      (collection/check-collection-for :model/Pulse merged))
    (when (some #(contains? changes %) [:dashboard_id :collection_position :alert_condition :alert_first_only :alert_above_goal])
      (check-dashboard-subscription merged))))

(defn- archived-directly
  "The `archived_directly` of `pulse`, an update that changes `:archived`, as `changes` and its Collection give it."
  [pulse changes]
  (if (contains? changes :archived_directly)
    (:archived_directly changes)
    (boolean (and (:archived changes) (not (collection/archived? (:collection_id (merge pulse changes))))))))

(defn- pulse-changes
  "The `changes` to `pulse` that change it, checked, with the cause of its archiving and the time `now` of the update, or
  nil when there are none."
  [pulse changes opts now]
  (let [changes (changed pulse changes)]
    (when (seq changes)
      (check-pulse-changes pulse changes opts)
      (cond-> changes
        (contains? changes :archived)         (assoc :archived_directly (archived-directly pulse changes))
        (not (contains? changes :updated_at)) (assoc :updated_at now)))))

(mu/defn create-pulse!
  "Insert `pulse`, whose before-insert hook files and defaults it and whose after-insert hook publishes its create event,
  returning the inserted Pulse; for `metabase.pulse.models.pulse` and the SerDes import."
  [pulse :- ::pulse.schema/pulse.update]
  (events/with-batched-events
    (pulse.db/insert-pulse! pulse)))

(mu/defn update-pulses! :- :int
  "Apply `changes` to `pulses`, Pulses the caller already loaded, in one statement for those the changes update alike,
  publish their update events, and enable or disable the PulseChannels of those whose `:archived` changes, returning
  the number of Pulses updated; for the dashboard subscription sync, the collection archive cascade, the shifts of
  collection positions and generic writers."
  [pulses  :- [:sequential :map]
   changes :- ::pulse.schema/pulse.changes
   opts    :- ::pulse.schema/write-opts]
  (let [now   (mi/now)
        plans (into [] (keep (fn [pulse] (when-let [final (pulse-changes pulse changes opts now)] [pulse final]))) pulses)]
    (when (seq plans)
      (events/with-batched-events
        (doseq [[final group] (group-by second plans)
                :let [ids (mapv (comp :id first) group)]]
          (when (contains? final :archived)
            (update-pulse-channels! (pulse.db/pulse-channels-for-pulses ids) {:enabled (not (:archived final))} {}))
          (pulse.db/update-pulses! ids final)
          (doseq [[pulse _] group]
            (events/updated! :model/Pulse (merge pulse final) pulse)))))
    (count plans)))

(mu/defn update-pulse! :- :int
  "Apply `changes` to `pulse-or-id`, a Pulse the caller already loaded or the id of one, as [[update-pulses!]] does,
  returning the number of Pulses updated; for the REST API and `metabase.pulse.models.pulse`."
  [pulse-or-id :- [:or ::lib.schema.id/pulse :map]
   changes     :- ::pulse.schema/pulse.changes
   opts        :- ::pulse.schema/write-opts]
  (if-let [pulse (clean-row-or-select pulse-or-id pulse.db/pulse)]
    (update-pulses! [pulse] changes opts)
    0))

(mu/defn delete-pulses! :- :int
  "Delete the Pulses with `ids` and their PulseChannels, which removes their Quartz triggers, and publish their delete
  events, returning the number deleted; for the REST API, the Dashboard and Collection deletions and generic writers."
  [ids   :- [:maybe [:sequential ::lib.schema.id/pulse]]
   _opts :- ::pulse.schema/write-opts]
  (let [pulses (when (seq ids) (pulse.db/pulses-with-ids ids))]
    (if (empty? pulses)
      0
      (events/with-batched-events
        (events/deleting! :model/Pulse pulses
                          (fn []
                            (delete-pulse-channels! (mapv :id (pulse.db/pulse-channels-for-pulses (mapv :id pulses)))
                                                    {:archive-parent-pulse? false})
                            (pulse.db/delete-pulses! (mapv :id pulses))))))))

(mu/defn delete-pulse! :- :int
  "Delete the Pulse with `id` and its PulseChannels, publishing its delete event, returning the number deleted."
  [id   :- ::lib.schema.id/pulse
   opts :- ::pulse.schema/write-opts]
  (delete-pulses! [id] opts))

;;; ------------------------------------------------ Generic writers -------------------------------------------------

(defmethod mi/write-fns :model/Pulse
  [_model]
  {:update!     update-pulse!
   :update-all! update-pulses!
   :delete!     delete-pulses!})

(defmethod mi/write-fns :model/PulseChannel
  [_model]
  {:update!     update-pulse-channel!
   :update-all! update-pulse-channels!
   :delete!     delete-pulse-channels!})

(defmethod mi/write-fns :model/PulseChannelRecipient
  [_model]
  {:update! update-pulse-channel-recipient!
   :delete! delete-pulse-channel-recipients!})

(defmethod mi/write-fns :model/PulseCard
  [_model]
  {:update! update-pulse-card!
   :delete! delete-pulse-cards!})
