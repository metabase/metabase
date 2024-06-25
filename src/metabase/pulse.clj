(ns metabase.pulse
  "Public API for sending Pulses."
  (:require
   [metabase.api.common :as api]
   [metabase.channel.core :as channel]
   [metabase.events :as events]
   [metabase.models.dashboard :as dashboard :refer [Dashboard]]
   [metabase.models.dashboard-card :as dashboard-card]
   [metabase.models.database :refer [Database]]
   [metabase.models.interface :as mi]
   [metabase.models.pulse :as pulse :refer [Pulse]]
   [metabase.models.serialization :as serdes]
   [metabase.pulse.parameters :as pulse-params]
   [metabase.pulse.util :as pu]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.server.middleware.session :as mw.session]
   [metabase.shared.parameters.parameters :as shared.params]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.retry :as retry]
   [metabase.util.ui-logic :as ui-logic]
   [metabase.util.urls :as urls]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Creating Notifications To Send                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- alert-or-pulse [pulse]
  (if (:dashboard_id pulse)
    :pulse
    :alert))

(defn- get-notification-info
  [pulse parts channel]
  (let [alert? (nil? (:dashboard_id pulse))]
    (merge {:payload-type (if alert?
                            :notification/alert
                            :notification/dashboard-subscription)
            :payload      (if alert? (first parts) parts)
            :pulse        pulse
            :channel      channel}
           (if alert?
             {:card  (t2/select-one :model/Card (-> parts first :card :id))}
             {:dashboard (t2/select-one :model/Dashboard (:dashboard_id pulse))}))))

(defn- channels-to-channel-recipients
  [channel]
  (if (= :slack (keyword (:channel_type channel)))
    [(get-in channel [:details :channel])]
    (for [recipient (:recipients channel)]
      (if-not (:id recipient)
        {:kind :external-email
         :email (:email recipient)}
        {:kind :user
         :user recipient}))))

(defn- channel-send!
  [& args]
  (try
    (apply channel/send! args)
    (catch Exception e
      ;; Token errors have already been logged and we should not retry.
      (when-not (and (= :channel/slack (first args))
                     (contains? (:errors (ex-data e)) :slack-token))
        (throw e)))))

(defn- send-retrying!
  [& args]
  (try
    (apply (retry/decorate channel-send!) args)
    (catch Throwable e
      (log/error e "Error sending notification!"))))

(defn- send-pulse!*
  [{:keys [channels channel-ids] pulse-id :id :as pulse} dashboard]
  (let [parts                  (execute-pulse pulse dashboard)
        ;; `channel-ids` is the set of channels to send to now, so only send to those. Note the whole set of channels
        channels               (if (seq channel-ids)
                                 (filter #((set channel-ids) (:id %)) channels)
                                 channels)]
    (if (should-send-notification? pulse parts)
      (let [event-type (if (= :pulse (alert-or-pulse pulse))
                         :event/subscription-send
                         :event/alert-send)]
        (events/publish-event! event-type {:id      (:id pulse)
                                           :user-id (:creator_id pulse)
                                           :object  {:recipients (map :recipients (:channels pulse))
                                                     :filters    (:parameters pulse)}})
        (u/prog1 (doseq [channel channels]
                   (try
                     (let [channel-type (if (= :email (keyword (:channel_type channel)))
                                          :channel/email
                                          :channel/slack)
                           messages     (channel/render-notification channel-type
                                                                     (get-notification-info pulse parts channel)
                                                                     (channels-to-channel-recipients channel))]
                       (doseq [message messages]
                         (send-retrying! channel-type message)))
                     (catch Exception e
                       (log/errorf e "Error sending %s %d to channel %s" (alert-or-pulse pulse) (:id pulse) (:channel_type channel)))))
          (when (:alert_first_only pulse)
            (t2/delete! Pulse :id pulse-id))))
      (log/infof "Skipping sending %s %d" (alert-or-pulse pulse) (:id pulse)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Sending Notifications                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn send-pulse!
  "Execute and Send a `Pulse`, optionally specifying the specific `PulseChannels`.  This includes running each
   `PulseCard`, formatting the content, and sending the content to any specified destination.

  `channel-ids` is the set of channel IDs to send to *now* -- this may be a subset of the full set of channels for
  the Pulse.

   Example:

    (send-pulse! pulse)                    ; Send to all Channels
    (send-pulse! pulse :channel-ids [312]) ; Send only to Channel with :id = 312"
  [{:keys [dashboard_id], :as pulse} & {:keys [channel-ids]}]
  {:pre [(map? pulse) (integer? (:creator_id pulse))]}
  (let [dashboard (t2/select-one Dashboard :id dashboard_id)
        pulse     (-> (mi/instance Pulse pulse)
                      ;; This is usually already done by this step, in the `send-pulses` task which uses `retrieve-pulse`
                      ;; to fetch the Pulse.
                      pulse/hydrate-notification
                      (merge (when channel-ids {:channel-ids channel-ids})))]
    (when (not (:archived dashboard))
      (send-pulse!* pulse dashboard))))
