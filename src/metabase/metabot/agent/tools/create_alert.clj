(ns metabase.metabot.agent.tools.create-alert
  "Agent tool wrapper for creating alerts on saved questions.
  Gets slack_channel_id from agent context and calls the create-alert tool endpoint directly."
  (:require
   [metabase.metabot.agent.tools.shared :as shared]
   [metabase.metabot.tools.create-alert :as tools.create-alert]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

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
           :system-instructions create-alert-system-instructions}
  create-alert-tool
  "Create an alert based on a saved question's results on a recurring schedule."
  [{:keys [card_id send_condition schedule send_once]} :- alert-schema]
  (let [slack-channel-id (:slack_channel_id (shared/current-context))]
    (when-not slack-channel-id
      (throw (ex-info "This tool can only be used from a Slack channel"
                      {:agent-error? true})))
    (try
      (let [result (tools.create-alert/create-alert
                    {:card-id        card_id
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
