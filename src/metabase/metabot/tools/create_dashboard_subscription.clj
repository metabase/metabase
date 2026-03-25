(ns metabase.metabot.tools.create-dashboard-subscription
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.channel.settings :as channel.settings]
   [metabase.metabot.tools.create-alert :as tools.create-alert]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.pulse.api :as pulse.api]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(defn- make-slack-channel
  "Build a pulse channel for Slack delivery."
  [schedule slack-channel]
  (merge {:channel_type :slack
          :enabled      true
          :details      {:channel slack-channel}}
         (metabot.tools.u/schedule->schedule-map schedule)))

(defn- create-dashboard-subscription*
  "Private helper for create-dashboard-subscription (call that instead)."
  [{:keys [dashboard-id slack-channel schedule]}]
  (let [dashboard (some-> (t2/select-one :model/Dashboard dashboard-id)
                          api/read-check
                          (t2/hydrate [:dashcards :card]))
        cards (for [{:keys [id card]} (:dashcards dashboard)
                    :when (-> card :id int?)]
                (-> card
                    api/read-check
                    (select-keys [:id :name :collection_id :description :display :parameter_mappings])
                    (assoc :dashboard_card_id id :dashboard_id dashboard-id)))
        channel-name (some->> slack-channel
                              channel.settings/find-cached-slack-channel-or-username
                              ;; match existing code which stores display names like "#some-channel"
                              :display-name)
        pulse-data (-> dashboard
                       (select-keys [:collection_id :collection_position :name :parameters])
                       (assoc :dashboard_id  dashboard-id
                              :creator_id    api/*current-user-id*
                              :skip_if_empty false))]
    (cond
      (nil? dashboard)
      {:error "no dashboard with this dashboard_id found"}

      (nil? channel-name)
      {:error "no slack channel found with this name"}

      :else
      (do (pulse.api/create-pulse-with-perm-checks!
           cards
           [(make-slack-channel schedule channel-name)]
           pulse-data)
          {:output "success"}))))

(defn create-dashboard-subscription
  "Create a dashboard subscription and send it to a slack channel."
  [{:keys [dashboard-id slack-channel] :as args}]
  (cond
    (not (int? dashboard-id))
    {:error "invalid dashboard_id"}

    (not (channel.settings/slack-configured?))
    {:error "slack is not configured. Ask an admin to connect slack in Metabase settings."}

    (empty? slack-channel)
    {:error "slack_channel is required"}

    :else
    (try
      (create-dashboard-subscription* args)
      (catch Exception e
        (-> (metabot.tools.u/handle-agent-error e)
            (set/rename-keys {:output :error}))))))

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
      (let [result (create-dashboard-subscription
                    {:dashboard-id  dashboard_id
                     :schedule      schedule
                     :slack-channel slack-channel-id})]
        (if (:error result)
          {:output (:error result)}
          {:output (or (:output result) "Dashboard subscription created successfully.")}))
      (catch Exception e
        (log/error e "Failed to create dashboard subscription")
        {:output (str "Failed to create dashboard subscription: " (or (ex-message e) "Unknown error"))}))))
