(ns metabase.pulse.send
  "Code related to sending Pulses (Alerts or Dashboard Subscriptions)."
  (:require
   [metabase.models.interface :as mi]
   [metabase.pulse.models.pulse :as models.pulse]
   [metabase.task-history.core :as task-history]
   [metabase.util.cron :as u.cron]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Creating Notifications To Send                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- alert-or-pulse [pulse]
  (if (:dashboard_id pulse)
    :pulse
    :alert))

(defn- channel-recipients
  [pulse-channel]
  (case (keyword (:channel_type pulse-channel))
    :slack
    [{:type    :notification-recipient/raw-value
      :details {:value (get-in pulse-channel [:details :channel])}}]
    :email
    (for [recipient (:recipients pulse-channel)]
      (if-not (:id recipient)
        {:type :notification-recipient/raw-value
         :details {:value (:email recipient)}}
        {:type :notification-recipient/user
         :user recipient}))
    :http
    []
    (do
      (log/warnf "Unknown channel type %s" (:channel_type pulse-channel))
      [])))

(defn- pc->channel
  "Given a pulse channel, return the channel object.

  Only supports HTTP channels for now, returns a map with type key for slack and email"
  [{channel-type :channel_type :as pulse-channel}]
  (if (= :http (keyword channel-type))
    (t2/select-one :model/Channel :id (:channel_id pulse-channel))
    {:type (keyword "channel" (name channel-type))}))

(defn- get-notification-handler
  [pulse-channel]
  (let [channel      (pc->channel pulse-channel)
        channel-type (:type channel)]
    {:channel_type    channel-type
     :channel         channel
     :recipients      (channel-recipients pulse-channel)
     :attachment_only (boolean (get-in pulse-channel [:details :attachment_only]))}))

(defn- maybe-name [x] (some-> x name))

(defn- notification-info
  [pulse dashboard pulse-channel]
  (if (= :pulse (alert-or-pulse pulse))
    {:id                     (:id pulse)
     :payload_type           :notification/dashboard
     :creator_id             (:creator_id pulse)
     :dashboard_subscription {:id                               (:id pulse)
                              :dashboard_id                     (:id dashboard)
                              :parameters                       (:parameters pulse)
                              :skip_if_empty                    (:skip_if_empty pulse)
                              :disable_links                    (:disable_links pulse)
                              :dashboard_subscription_dashcards (map
                                                                 #(merge {:card_id (:id %)
                                                                          :dashboard_card_id (:dashboard_card_id %)}
                                                                         (select-keys % [:include_xls :include_csv :pivot_results :format_rows]))
                                                                 (:cards pulse))}
     :handlers               [(get-notification-handler pulse-channel)]}
    {:id            (:id pulse)
     :payload_type  :notification/card
     :creator_id    (:creator_id pulse)
     :payload       {:id             (:id pulse)
                     :card_id        (:id (-> pulse :cards first))
                     :send_once      (true? (:alert_first_only pulse))
                     :send_condition (cond
                                       (= "rows" (:alert_condition pulse)) :has_result
                                       (:alert_above_goal pulse)           :goal_above
                                       :else                               :goal_below)}

     :subscriptions [{:type :notification-subscription/cron
                      :cron_schedule (u.cron/schedule-map->cron-string (-> pulse-channel
                                                                           (update :schedule_type maybe-name)
                                                                           (update :schedule_day maybe-name)
                                                                           (update :schedule_frame maybe-name)))}]
     :handlers      [(get-notification-handler pulse-channel)]}))

(def ^:private send-notification! (requiring-resolve 'metabase.notification.core/send-notification!))

(defn- send-pulse!*
  [{:keys [channels channel-ids] :as pulse} dashboard async?]
  (let [;; `channel-ids` is the set of channels to send to now, so only send to those. Note the whole set of channels
        channels (if (seq channel-ids)
                   (filter #((set channel-ids) (:id %)) channels)
                   channels)]
    (doseq [pulse-channel channels]
      (try
        (send-notification! (notification-info pulse dashboard pulse-channel) :notification/sync? (not async?))
        (catch Exception e
          (log/errorf e "[Pulse %d] Error sending to %s channel" (:id pulse) (:channel_type pulse-channel)))))
    nil))

(defn pulse->task-run-info
  "Extract task run info from a pulse for use with [[metabase.task-history.core/with-task-run]].
   - Dashboard subscriptions: entity_type :dashboard
   - Legacy pulses (no dashboard): entity_type :card (first card)
   - Returns nil if neither dashboard_id nor cards are present."
  [{:keys [dashboard_id cards]}]
  (cond
    dashboard_id
    {:run_type    :subscription
     :entity_type :dashboard
     :entity_id   dashboard_id}

    (seq cards)
    {:run_type    :subscription
     :entity_type :card
     :entity_id   (:id (first cards))}

    :else nil))

(defn send-pulse!
  "Execute and Send a `Pulse`, optionally specifying the specific `PulseChannels`.  This includes running each
   `PulseCard`, formatting the content, and sending the content to any specified destination.

  `channel-ids` is the set of channel IDs to send to *now* -- this may be a subset of the full set of channels for
  the Pulse.

   Example:

    (send-pulse! pulse)                    ; Send to all Channels
    (send-pulse! pulse :channel-ids [312]) ; Send only to Channel with :id = 312"
  [{:keys [dashboard_id], :as pulse} & {:keys [channel-ids async?]
                                        :or   {async? false}}]
  {:pre [(map? pulse) (integer? (:creator_id pulse))]}
  ;; with-task-run is a no-op if already nested (e.g., from scheduler)
  (task-history/with-task-run (some-> (pulse->task-run-info pulse)
                                      (assoc :auto-complete (not async?)))
    (let [dashboard (t2/select-one :model/Dashboard :id dashboard_id)
          pulse     (-> (mi/instance :model/Pulse pulse)
                        ;; This is usually already done by this step, in the `send-pulses` task which uses `retrieve-pulse`
                        ;; to fetch the Pulse.
                        models.pulse/hydrate-notification
                        (merge (when channel-ids {:channel-ids channel-ids})))]
      (when (not (:archived dashboard))
        (send-pulse!* pulse dashboard async?)))))
