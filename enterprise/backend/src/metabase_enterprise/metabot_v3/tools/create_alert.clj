(ns metabase-enterprise.metabot-v3.tools.create-alert
  (:require
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.api.common :as api]
   [metabase.channel.settings :as channel.settings]
   [metabase.notification.api :as notification.api]
   [metabase.util.cron :as u.cron]
   [toucan2.core :as t2]))

(defn- schedule->cron
  "Convert the tool schedule format to a Quartz cron string.
  The schedule comes in as e.g. {:frequency :daily :hour 9} and needs to be
  converted to a Quartz cron string like \"0 0 9 * * ? *\"."
  [schedule]
  (u.cron/schedule-map->cron-string (metabot-v3.tools.u/schedule->schedule-map schedule)))

(defn- create-alert*
  "Private helper for create-alert (call that instead)."
  [{:keys [card-id channel-type email slack-channel schedule send-condition send-once]
    :or   {send-once false}}]
  (let [card              (some-> (t2/select-one :model/Card card-id) api/read-check)
        recipient-id      (when (= channel-type :email)
                            (t2/select-one-fn :id :model/User :email email))
        channel-name      (when (= channel-type :slack)
                            (some->> slack-channel
                                     channel.settings/find-cached-slack-channel-or-username
                                     :display-name))
        handler+recipient (case channel-type
                            :email {:channel_type :channel/email
                                    :recipients   [{:type    :notification-recipient/user
                                                    :user_id recipient-id}]}
                            :slack {:channel_type :channel/slack
                                    :recipients   [{:type    :notification-recipient/raw-value
                                                    :details {:value channel-name}}]})]
    (cond
      (nil? card)
      {:error "no saved question with this card_id found"}

      (and (= channel-type :email) (nil? recipient-id))
      {:error "no user with this email found"}

      (and (= channel-type :slack) (nil? channel-name))
      {:error "no slack channel found with this name"}

      :else
      (do
        (notification.api/create-notification!
         {:payload_type  :notification/card
          :active        true
          :creator_id    api/*current-user-id*
          :payload       {:card_id        card-id
                          :send_condition send-condition
                          :send_once      send-once}
          :subscriptions [{:type          :notification-subscription/cron
                           :cron_schedule (schedule->cron schedule)}]
          :handlers      [handler+recipient]})
        {:output "success"}))))

(defn create-alert
  "Create an alert (notification when a saved question returns results)."
  [{:keys [card-id channel-type send-condition send-once slack-channel]
    :as   args}]
  (cond
    (not (int? card-id))
    {:error "invalid card_id"}

    (and (some? send-once) (not (boolean? send-once)))
    {:error "send_once must be a boolean"}

    (not (#{:email :slack} channel-type))
    {:error (str "unsupported channel_type: " (some-> channel-type name))}

    (not (#{:has_result :goal_above :goal_below} send-condition))
    {:error (str "unsupported send_condition: " (some-> send-condition name))}

    (and (= channel-type :email) (not (channel.settings/email-configured?)))
    {:error "email is not configured. Ask an admin to set up email in Metabase settings."}

    (and (= channel-type :slack) (not (channel.settings/slack-configured?)))
    {:error "slack is not configured. Ask an admin to set up slack notifications in Metabase settings."}

    (and (= channel-type :email) (empty? (:email args)))
    {:error "email is required when channel_type is email"}

    (and (= channel-type :slack) (empty? slack-channel))
    {:error "slack_channel is required when channel_type is slack"}

    :else
    (create-alert* args)))
