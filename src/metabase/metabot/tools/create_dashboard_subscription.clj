(ns metabase.metabot.tools.create-dashboard-subscription
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.channel.settings :as channel.settings]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.create-alert :as tools.create-alert]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.pulse.api :as pulse.api]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

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
  (let [dashboard (some-> (metabot.db/dashboard dashboard-id)
                          api/read-check
                          metabot.db/hydrate-dashcards-with-cards)
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
        (log/errorf "Failed to create dashboard subscription: %s" (ex-message e))
        {:output (str "Failed to create dashboard subscription: " (or (ex-message e) "Unknown error"))}))))
