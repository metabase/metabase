(ns metabase.metabot.tools.create-dashboard-subscription
  "Create dashboard subscriptions for the Slack profile.

  It subscribes the conversation that the request came from."
  (:require
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.create-alert :as tools.create-alert]
   [metabase.metabot.tools.subscriptions :as tools.subscriptions]))

(set! *warn-on-reflection* true)

(def ^:private tool-description
  (str "Create a recurring subscription that delivers a dashboard's contents to the user's current\n"
       "Slack channel. The destination channel is taken from the conversation: there is nothing to\n"
       "pass for it, and the tool only works from a Slack channel.\n"
       "\n"
       "When the user asks to subscribe to a dashboard, set up scheduled delivery, or receive regular\n"
       "updates for a dashboard, you MUST call this tool; never claim a subscription was created\n"
       "without calling it. If you are missing required information, ask the user for it rather than\n"
       "guessing.\n"
       "\n"
       "`dashboard_id` is the ID of the dashboard, from a prior search result or the conversation\n"
       "context. `schedule` is a frequency (hourly, daily, weekly, monthly) plus that frequency's\n"
       "time fields."))

(defrecord SlackbotCreateDashboardSubscriptionTool []
  tools/Tool
  (declaration [_]
    {:name        "create_dashboard_subscription"
     :description tool-description
     :scope       scope/agent-dashboard-subscribe
     :args        [:map {:closed true}
                   [:dashboard_id :int]
                   [:schedule tools.create-alert/schedule-schema]]})

  (handle [_ {:keys [dashboard_id schedule]} ctx]
    (tools.subscriptions/create-dashboard-subscription!
     {:dashboard-id dashboard_id
      :channel      (tools.create-alert/current-slack-channel ctx)
      :schedule     schedule})))

(def slackbot-create-dashboard-subscription-tool
  "`create_dashboard_subscription` for the Slack profile."
  (->SlackbotCreateDashboardSubscriptionTool))
