(ns metabase.metabot.agent.tools.create-dashboard-subscription
  "Agent tool wrapper for creating dashboard subscriptions.
  Gets slack_channel_id from agent context and calls the create-dashboard-subscription tool endpoint directly."
  (:require
   [metabase.metabot.agent.tools.create-alert :as tools.create-alert]
   [metabase.metabot.agent.tools.shared :as shared]
   [metabase.metabot.tools.create-dashboard-subscription :as tools.create-dashboard-subscription]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private create-dashboard-subscription-system-instructions
  "## Dashboard Subscriptions

You can create dashboard subscriptions that deliver dashboard contents to the user's current slack channel on a
recurring schedule.

### CRITICAL: You MUST call the create_dashboard_subscription tool

When a user asks to subscribe to a dashboard, set up scheduled delivery, or receive regular updates for a dashboard,
you MUST call the create_dashboard_subscription tool. Never tell the user you have created a subscription without
actually calling the tool. If you cannot call the tool (e.g. missing required information), explain what is needed
instead of pretending the subscription was created.

### Required information

Before calling the tool, ensure you have ALL of the following:
1. **Dashboard ID** — obtained from a prior search result or conversation context
2. **Schedule** — frequency (hourly, daily, weekly, monthly) with the appropriate time fields

If any required information is missing, ask the user for it rather than assuming or fabricating values.")

(mu/defn ^{:tool-name           "create_dashboard_subscription"
           :system-instructions create-dashboard-subscription-system-instructions}
  slackbot-create-dashboard-subscription-tool
  "Create a recurring subscription that delivers a dashboard's contents to a Slack channel."
  [{:keys [dashboard_id schedule]} :- [:map {:closed true}
                                       [:dashboard_id :int]
                                       [:schedule tools.create-alert/schedule-schema]]]
  (let [slack-channel-id (:slack_channel_id (shared/current-context))]
    (when-not slack-channel-id
      (throw (ex-info "This tool can only be used from a Slack channel"
                      {:agent-error? true})))
    (try
      (let [result (tools.create-dashboard-subscription/create-dashboard-subscription
                    {:dashboard-id  dashboard_id
                     :schedule      schedule
                     :slack-channel slack-channel-id})]
        (if (:error result)
          {:output (:error result)}
          {:output (or (:output result) "Dashboard subscription created successfully.")}))
      (catch Exception e
        (log/error e "Failed to create dashboard subscription")
        {:output (str "Failed to create dashboard subscription: " (or (ex-message e) "Unknown error"))}))))
