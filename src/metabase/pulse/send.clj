(ns metabase.pulse.send
  "Code related to sending Pulses (Alerts or Dashboard Subscriptions)."
  (:require
   [metabase.api.common :as api]
   [metabase.events :as events]
   [metabase.models.dashboard :as dashboard :refer [Dashboard]]
   [metabase.models.dashboard-card :as dashboard-card]
   [metabase.models.database :refer [Database]]
   [metabase.models.interface :as mi]
   [metabase.models.params.shared :as shared.params]
   [metabase.models.pulse :as models.pulse :refer [Pulse]]
   [metabase.models.serialization :as serdes]
   [metabase.models.task-history :as task-history]
   [metabase.pulse.parameters :as pulse-params]
   [metabase.pulse.util :as pu]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.server.middleware.session :as mw.session]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.retry :as retry]
   [metabase.util.ui-logic :as ui-logic]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn virtual-card-of-type?
  "Check if dashcard is a virtual with type `ttype`, if `true` returns the dashcard, else returns `nil`.

  There are currently 4 types of virtual card: \"text\", \"action\", \"link\", \"placeholder\"."
  [dashcard ttype]
  (when (= ttype (get-in dashcard [:visualization_settings :virtual_card :display]))
    dashcard))

(defn- database-id [card]
  (or (:database_id card)
      (get-in card [:dataset_query :database])))

(mu/defn defaulted-timezone :- :string
  "Returns the timezone ID for the given `card`. Either the report timezone (if applicable) or the JVM timezone."
  [card :- (ms/InstanceOf :model/Card)]
  (or (some->> card database-id (t2/select-one Database :id) qp.timezone/results-timezone-id)
      (qp.timezone/system-timezone-id)))

(defn- are-all-parts-empty?
  "Do none of the cards have any results?"
  [results]
  (every? pu/is-card-empty? results))

(defn- goal-met? [{:keys [alert_above_goal], :as pulse} [first-result]]
  (let [goal-comparison      (if alert_above_goal >= <)
        goal-val             (ui-logic/find-goal-value first-result)
        comparison-col-rowfn (ui-logic/make-goal-comparison-rowfn (:card first-result)
                                                                  (get-in first-result [:result :data]))]

    (when-not (and goal-val comparison-col-rowfn)
      (throw (ex-info (tru "Unable to compare results to goal for alert.")
                      {:pulse  pulse
                       :result first-result})))
    (boolean
     (some (fn [row]
             (goal-comparison (comparison-col-rowfn row) goal-val))
           (get-in first-result [:result :data :rows])))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Creating Notifications To Send                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- alert-or-pulse [pulse]
  (if (:dashboard_id pulse)
    :pulse
    :alert))

(defmulti ^:private should-send-notification?
  "Returns true if given the pulse type and resultset a new notification (pulse or alert) should be sent"
  (fn [pulse _parts] (alert-or-pulse pulse)))

(defmethod should-send-notification? :alert
  [{:keys [alert_condition] :as alert} part]
  (cond
    (= "rows" alert_condition)
    (not (are-all-parts-empty? [part]))

    (= "goal" alert_condition)
    (goal-met? alert [part])

    :else
    (let [^String error-text (tru "Unrecognized alert with condition ''{0}''" alert_condition)]
      (throw (IllegalArgumentException. error-text)))))

(defmethod should-send-notification? :pulse
  [pulse parts]
  (if (:skip_if_empty pulse)
    (not (are-all-parts-empty? parts))
    true))

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

(defn- should-retry-sending?
  [exception channel-type]
  (not (and (= :channel/slack channel-type)
            (contains? (:errors (ex-data exception)) :slack-token))))

(defn- format-channel
  [{:keys [type id]}]
  (if id
    (str (name type) " " id)
    (name type)))

(defn- channel-send!
  [& args]
  (apply (requiring-resolve 'metabase.channel.core/send!) args))

(defn- send-retrying!
  [pulse-id channel message]
  (try
    (let [;; once we upgraded to retry 2.x, we can use (.. retry getMetrics getNumberOfTotalCalls) instead of tracking
          ;; this manually
          retry-config (retry/retry-configuration)
          retry-errors (volatile! [])
          retry-report (fn []
                         {:attempted_retries (count @retry-errors)
                          :retry_errors       @retry-errors})
          send!        (fn []
                         (try
                           (channel-send! channel message)
                           (catch Exception e
                             (vswap! retry-errors conj e)
                             ;; Token errors have already been logged and we should not retry.
                             (when (should-retry-sending? e (:type channel))
                               (log/warnf e "[Pulse %d] Failed to send to channel %s , retrying..." pulse-id (format-channel channel))
                               (throw e)))))]
      (task-history/with-task-history {:task            "channel-send"
                                       :on-success-info (fn [update-map _result]
                                                          (cond-> update-map
                                                            (seq @retry-errors)
                                                            (update :task_details merge (retry-report))))
                                       :on-fail-info    (fn [update-map _result]
                                                          (update update-map :task_details #(merge % (retry-report))))
                                       :task_details    {:retry_config retry-config
                                                         :channel_type (:type channel)
                                                         :channel_id   (:id channel)
                                                         :pulse_id     pulse-id}}
        ((retry/decorate send! (retry/random-exponential-backoff-retry (str (random-uuid)) retry-config)))
        (log/debugf "[Pulse %d] Sent to channel %s with %d retries" pulse-id (format-channel channel) (count @retry-errors))))
    (catch Throwable e
      (log/errorf e "[Pulse %d] Error sending notification!" pulse-id))))

(defn- channel-render-notification
  [& args]
  (apply (requiring-resolve 'metabase.channel.core/render-notification) args))

(defn- notification-payload
  [& args]
  (apply (requiring-resolve 'metabase.notification.core/notification-payload) args))

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
    [:channel/email :notification/dashboard-subscription]
    {:channel_type :channel/email
     :details      {:type    :email/mustache-resource
                    :subject "{{payload.dashboard.name}}"
                    :path    "metabase/email/dashboard_subscription_new"}}

    [:channel/email :notification/alert]
    {:channel_type :channel/email
     :details      {:type    :email/mustache-resource
                    :subject "{{computed.subject}}"
                    :path    "metabase/email/alert"}}
    nil))

(defn- notification-info
  [pulse dashboard pulse-channel]
  (if (= :pulse (alert-or-pulse pulse))
    {:payload_type           :notification/dashboard-subscription
     :creator_id             (:creator_id pulse)
     :dashboard_subscription {:dashboard_id  (:id dashboard)
                              :parameters    (:parameters pulse)
                              :skip_if_empty (:skip_if_empty pulse)}}
    {:payload_type :notification/alert
     :card_id      (some :id (:cards pulse))
     :alert        {:schedule (select-keys pulse-channel [:schedule_type :schedule_hour :schedule_day :schedule_frame])
                    :id       (:id pulse)}
     :creator_id   (:creator_id pulse)}))

(defn- send-pulse!*
  [{:keys [channels channel-ids] pulse-id :id :as pulse} dashboard]
  (let [;; `channel-ids` is the set of channels to send to now, so only send to those. Note the whole set of channels
        channels   (if (seq channel-ids)
                     (filter #((set channel-ids) (:id %)) channels)
                     channels)]
    (doseq [pulse-channel channels]
      (try
        (let [channel              (pc->channel pulse-channel)
              payload-type         (if (= :pulse (alert-or-pulse pulse))
                                     :notification/dashboard-subscription
                                     :notification/alert)
              notification-payload (notification-payload (notification-info pulse dashboard pulse-channel))
              messages             (channel-render-notification
                                    (:type channel)
                                    notification-payload
                                    (get-template (:type channel) payload-type)
                                    (channel-recipients pulse-channel))]
          (if (should-send-notification? pulse (-> notification-payload :payload :result))
            (do
             (events/publish-event! (if (= :pulse (alert-or-pulse pulse))
                                      :event/subscription-send
                                      :event/alert-send)
                                    {:id      (:id pulse)
                                     :user-id (:creator_id pulse)
                                     :object  {:recipients (map :recipients (:channels pulse))
                                               :filters    (:parameters pulse)}})
             (log/debugf "[Pulse %d] Rendered %d messages for channel %s"
                         pulse-id
                         (count messages)
                         (format-channel channel))
             (doseq [message messages]
               (log/debugf "[Pulse %d] Sending to channel %s"
                           pulse-id
                           (:channel_type pulse-channel))
               (send-retrying! pulse-id channel message))
             (when (:alert_first_only pulse)
               (t2/delete! Pulse :id pulse-id)))
            (log/infof "Skipping sending %s %d" (alert-or-pulse pulse) (:id pulse))))
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
  [{:keys [dashboard_id], :as pulse} & {:keys [channel-ids]}]
  {:pre [(map? pulse) (integer? (:creator_id pulse))]}
  (let [dashboard (t2/select-one Dashboard :id dashboard_id)
        pulse     (-> (mi/instance Pulse pulse)
                      ;; This is usually already done by this step, in the `send-pulses` task which uses `retrieve-pulse`
                      ;; to fetch the Pulse.
                      models.pulse/hydrate-notification
                      (merge (when channel-ids {:channel-ids channel-ids})))]
    (when (not (:archived dashboard))
      (send-pulse!* pulse dashboard))))

#_(ngoc/with-tc
    (mapv send-pulse! (t2/select :model/Pulse 8)))

#_(t2/select-one :model/Pulse :dashboard_id 12 :archived false)
