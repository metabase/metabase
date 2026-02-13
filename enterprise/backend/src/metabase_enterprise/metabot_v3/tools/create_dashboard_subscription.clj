(ns metabase-enterprise.metabot-v3.tools.create-dashboard-subscription
  (:require
   [clojure.set :as set]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.api.common :as api]
   [metabase.channel.settings :as channel.settings]
   [metabase.permissions.core :as perms]
   ^{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.pulse.core :as pulse]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- schedule->channel-fields
  "Convert a schedule map to the pulse channel schedule fields."
  [{:keys [frequency hour day-of-week day-of-month]}]
  {:schedule_type  frequency
   :schedule_hour  hour
   :schedule_day   (or (some-> day-of-week name (subs 0 3) u/lower-case-en)
                       (some->> day-of-month
                                name
                                u/lower-case-en
                                (re-find #"^(?:first|last)-(mon|tue|wed|thu|fri|sat|sun)")
                                second))
   :schedule_frame (some->> day-of-month name (re-find #"^(?:first|mid|last)"))})

(defn- make-slack-channel
  "Build a pulse channel for Slack delivery."
  [schedule slack-channel]
  (merge {:channel_type :slack
          :enabled      true
          :details      {:channel slack-channel}}
         (schedule->channel-fields schedule)))

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
      (do (pulse/create-pulse! (map pulse/card->ref cards)
                               [(make-slack-channel schedule channel-name)]
                               pulse-data)
          {:output "success"}))))

(defn create-dashboard-subscription
  "Create a dashboard subscription and send it to a slack channel."
  [{:keys [dashboard-id slack-channel] :as args}]
  (perms/check-has-application-permission :subscription false)
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
