(ns metabase-enterprise.metabot-v3.tools.create-alert
  (:require
   [clojure.set :as set]
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
  [{:keys [card-id slack-channel schedule send-condition send-once]
    :or   {send-once false}}]
  (let [card         (some-> (t2/select-one :model/Card card-id) api/read-check)
        channel-name (some->> slack-channel
                              channel.settings/find-cached-slack-channel-or-username
                              :display-name)]
    (cond
      (nil? card)
      {:error "no saved question with this card_id found"}

      (nil? channel-name)
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
          :handlers      [{:channel_type :channel/slack
                           :recipients   [{:type    :notification-recipient/raw-value
                                           :details {:value channel-name}}]}]})
        {:output "success"}))))

(defn create-alert
  "Create an alert (notification when a saved question returns results)."
  [{:keys [card-id send-condition send-once slack-channel]
    :as   args}]
  (cond
    (not (int? card-id))
    {:error "invalid card_id"}

    (and (some? send-once) (not (boolean? send-once)))
    {:error "send_once must be a boolean"}

    (not (#{:has_result :goal_above :goal_below} send-condition))
    {:error (str "unsupported send_condition: " (some-> send-condition name))}

    (not (channel.settings/slack-configured?))
    {:error "slack is not configured. Ask an admin to set up slack notifications in Metabase settings."}

    (empty? slack-channel)
    {:error "slack_channel is required"}

    :else
    (try
      (create-alert* args)
      (catch Exception e
        (-> (metabot-v3.tools.u/handle-agent-error e)
            (set/rename-keys {:output :error}))))))
