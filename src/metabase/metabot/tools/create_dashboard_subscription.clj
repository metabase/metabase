(ns metabase.metabot.tools.create-dashboard-subscription
  (:require
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.create-alert :as tools.create-alert]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.subscriptions :as tools.subscriptions]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.util.malli :as mu]))

(mu/defn ^{:tool-name "create_dashboard_subscription"
           :scope     scope/agent-dashboard-subscribe}
  slackbot-create-dashboard-subscription-tool
  "Create a recurring subscription that delivers a dashboard's contents to the user's current
  Slack channel. The destination channel is taken from the conversation — there is nothing to
  pass for it, and the tool only works from a Slack channel.

  When the user asks to subscribe to a dashboard, set up scheduled delivery, or receive regular
  updates for a dashboard, you MUST call this tool; never claim a subscription was created
  without calling it. If you are missing required information, ask the user for it rather than
  guessing.

  `dashboard_id` is the id of the dashboard, from a prior search result or the conversation
  context. `schedule` is a frequency (hourly, daily, weekly, monthly) plus that frequency's
  time fields."
  [{:keys [dashboard_id schedule]} :- [:map {:closed true}
                                       [:dashboard_id :int]
                                       [:schedule tools.create-alert/schedule-schema]]]
  (let [slack-channel-id (:slack_channel_id (shared/current-context))]
    (try
      (when-not slack-channel-id
        (throw (ex-info "This tool can only be used from a Slack channel"
                        {:agent-error? true})))
      (let [result (tools.subscriptions/create-dashboard-subscription
                    {:dashboard-id  dashboard_id
                     :schedule      schedule
                     :slack-channel slack-channel-id})]
        (if (:error result)
          {:output (:error result)}
          {:output (or (:output result) "Dashboard subscription created successfully.")}))
      (catch Exception e
        (metabot.tools.u/handle-agent-or-api-error e)))))
