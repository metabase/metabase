(ns metabase-enterprise.metabot-v3.tools.create-dashboard-subscription
  (:require
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.api.common :as api]
   [metabase.channel.settings :as channel.settings]
   [metabase.pulse.api :as pulse.api]
   [toucan2.core :as t2]))

(defn- make-email-channel
  "Build a pulse channel for email delivery."
  [schedule recipient-id]
  (merge {:channel_type :email
          :enabled      true
          :recipients   [{:id recipient-id}]}
         (metabot-v3.tools.u/schedule->schedule-map schedule)))

(defn- make-slack-channel
  "Build a pulse channel for Slack delivery."
  [schedule slack-channel]
  (merge {:channel_type :slack
          :enabled      true
          :details      {:channel slack-channel}}
         (metabot-v3.tools.u/schedule->schedule-map schedule)))

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
        (-> (metabot-v3.tools.u/handle-agent-error e)
            (set/rename-keys {:output :error}))))))
