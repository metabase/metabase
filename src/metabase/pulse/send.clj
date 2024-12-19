(ns metabase.pulse.send
  "Code related to sending Pulses (Alerts or Dashboard Subscriptions)."
  (:require
   [metabase.models.interface :as mi]
   [metabase.models.pulse :as models.pulse]
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
    [(get-in pulse-channel [:details :channel])]
    :email
    (for [recipient (:recipients pulse-channel)]
      (if-not (:id recipient)
        {:kind :external-email
         :email (:email recipient)}
        {:kind :user
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

(defn- get-template
  [channel-type payload-type]
  (case [channel-type payload-type]
    [:channel/email :notification/dashboard]
    {:channel_type :channel/email
     :details      {:type    :email/handlebars-resource
                    :subject "{{payload.dashboard.name}}"
                    :path    "metabase/email/dashboard_subscription.hbs"}}

    [:channel/email :notification/card]
    {:channel_type :channel/email
     :details      {:type    :email/handlebars-resource
                    :subject "{{computed.subject}}"
                    :path    "metabase/email/alert.hbs"}}
    nil))

(defn- get-notification-handler
  [pulse-channel payload-type]
  (let [channel      (pc->channel pulse-channel)
        channel-type (:type channel)]
    {:channel_type channel-type
     :channel      channel
     :template     (get-template channel-type payload-type)
     :recipients   (channel-recipients pulse-channel)}))

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
                              :dashboard_subscription_dashcards (map
                                                                 #(merge {:card_id (:id %)}
                                                                         (select-keys % [:include_xls :include_csv :pivot_results :format_rows]))
                                                                 (:cards pulse))}
     :handlers               [(get-notification-handler pulse-channel :notification/dashboard)]}
    {:id           (:id pulse)
     :payload_type :notification/card
     :creator_id   (:creator_id pulse)
     :alert        (merge (assoc (select-keys pulse [:id :alert_condition :alert_above_goal :alert_first_only])
                                 :card_id (some :id (:cards pulse))
                                 :schedule (select-keys pulse-channel [:schedule_type :schedule_hour :schedule_day :schedule_frame]))
                          (select-keys (-> pulse :cards first) [:include_xls :include_csv :pivot_results :format_rows]))
     :handlers     [(get-notification-handler pulse-channel :notification/card)]}))

(def ^:private send-notification! (requiring-resolve 'metabase.notification.core/send-notification!))

(defn- send-pulse!*
  [{:keys [channels channel-ids] :as pulse} dashboard async?]
  (let [;; `channel-ids` is the set of channels to send to now, so only send to those. Note the whole set of channels
        channels   (if (seq channel-ids)
                     (filter #((set channel-ids) (:id %)) channels)
                     channels)]
    (doseq [pulse-channel channels]
      (try
        (send-notification! (notification-info pulse dashboard pulse-channel) :notification/sync? (not async?))
        (catch Exception e
          (log/errorf e "[Pulse %d] Error sending to %s channel" (:id pulse) (:channel_type pulse-channel)))))
    nil))

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
  (let [dashboard (t2/select-one :model/Dashboard :id dashboard_id)
        pulse     (-> (mi/instance :model/Pulse pulse)
                      ;; This is usually already done by this step, in the `send-pulses` task which uses `retrieve-pulse`
                      ;; to fetch the Pulse.
                      models.pulse/hydrate-notification
                      (merge (when channel-ids {:channel-ids channel-ids})))]
    (when (not (:archived dashboard))
      (send-pulse!* pulse dashboard async?))))
