(ns metabase.metabot.tools.create-alert
  "Agent tool wrapper for creating alerts on saved questions.
  Gets slack_channel_id from agent context and calls the create-alert tool endpoint directly."
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.channel.settings :as channel.settings]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.notification.api :as notification.api]
   [metabase.util.cron :as u.cron]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- schedule->cron
  "Convert the tool schedule format to a Quartz cron string.
  The schedule comes in as e.g. {:frequency :daily :hour 9} and needs to be
  converted to a Quartz cron string like \"0 0 9 * * ? *\"."
  [schedule]
  (u.cron/schedule-map->cron-string (metabot.tools.u/schedule->schedule-map schedule)))

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
        (-> (metabot.tools.u/handle-agent-error e)
            (set/rename-keys {:output :error}))))))

(def schedule-schema
  "Schedule schema shared with create-dashboard-subscription tool."
  [:or
   [:map {:closed true}
    [:frequency [:= "hourly"]]]
   [:map {:closed true}
    [:frequency [:= "daily"]]
    [:hour [:int {:min 0 :max 23}]]]
   [:map {:closed true}
    [:frequency [:= "weekly"]]
    [:day_of_week [:enum "sunday" "monday" "tuesday" "wednesday" "thursday" "friday" "saturday"]]
    [:hour [:int {:min 0 :max 23}]]]
   [:map {:closed true}
    [:frequency [:= "monthly"]]
    [:day_of_month [:enum "first-calendar-day"
                    "first-sunday" "first-monday" "first-tuesday" "first-wednesday"
                    "first-thursday" "first-friday" "first-saturday"
                    "middle-of-month"
                    "last-calendar-day"
                    "last-sunday" "last-monday" "last-tuesday" "last-wednesday"
                    "last-thursday" "last-friday" "last-saturday"]]
    [:hour [:int {:min 0 :max 23}]]]])

(def ^:private create-alert-system-instructions
  "## Alerts

You can create alerts that notify the user's current Slack channel based on a saved question's results on a
recurring schedule.

### Required information

Before calling the tool, ensure you have ALL of the following:
1. **Card ID** — the ID of a saved question, obtained from a prior search result or conversation context
2. **Send condition** — determines when the alert fires:
   - `has_result` — sends when the question returns any rows
   - `goal_above` — sends when the result exceeds the goal line set on the question
   - `goal_below` — sends when the result drops below the goal line
3. **Schedule** — frequency (hourly, daily, weekly, monthly) with the appropriate time fields
4. **Send once** (optional, defaults to false) — if true, the alert is automatically deleted after it fires once

### Important notes

* Alerts are for **saved questions** (cards), not dashboards. For dashboard delivery, use the dashboard subscription tool.
* `goal_above` and `goal_below` only work on questions that have a goal line configured.
* If the user doesn't specify a send condition, default to `has_result`.

CRITICAL: When a user asks to be alerted or notified about a saved question's results, you MUST call the create_alert tool.
NEVER tell the user you have created an alert without actually calling the create_alert tool. If you cannot call the tool
(e.g. missing required information), explain what is needed instead of pretending the alert was created.")

(def ^:private alert-schema
  [:map {:closed true}
   [:card_id :int]
   [:send_condition [:enum "has_result" "goal_above" "goal_below"]]
   [:schedule schedule-schema]
   [:send_once {:optional true :default false} :boolean]])

(mu/defn ^{:tool-name           "create_alert"
           :scope               scope/agent-alert-create
           :system-instructions create-alert-system-instructions}
  create-alert-tool
  "Create an alert based on a saved question's results on a recurring schedule."
  [{:keys [card_id send_condition schedule send_once]} :- alert-schema]
  (let [slack-channel-id (:slack_channel_id (shared/current-context))]
    (when-not slack-channel-id
      (throw (ex-info "This tool can only be used from a Slack channel"
                      {:agent-error? true})))
    (try
      (let [result (create-alert {:card-id        card_id
                                  :send-condition (keyword send_condition)
                                  :schedule       schedule
                                  :send-once      (boolean send_once)
                                  :slack-channel  slack-channel-id})]
        (if (:error result)
          {:output (:error result)}
          {:output (or (:output result) "Alert created successfully.")}))
      (catch Exception e
        (log/error e "Failed to create alert")
        {:output (str "Failed to create alert: " (or (ex-message e) "Unknown error"))}))))
