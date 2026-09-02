(ns metabase.metabot.tools.subscriptions
  "Dashboard subscription tool wrapper."
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.channel.settings :as channel.settings]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.pulse.api :as pulse.api]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

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

(def ^:private subscription-schema
  [:map {:closed true}
   [:dashboard_id :int]
   [:email {:optional true} [:maybe :string]]
   [:slack_channel {:optional true} [:maybe :string]]
   [:schedule [:map
               [:frequency [:enum "hourly" "daily" "weekly" "monthly"]]
               [:hour {:optional true} [:maybe :int]]
               [:day_of_week {:optional true} [:maybe :string]]
               [:day_of_month {:optional true} [:maybe :string]]]]])

(mu/defn ^{:tool-name "create_dashboard_subscription"
           :scope     scope/agent-dashboard-subscribe}
  create-dashboard-subscription-tool
  "Create a dashboard subscription that sends regular updates to a Slack channel.

  Use when a user wants to receive or send regular updates on a dashboard's contents.
  Requires a valid `dashboard_id`, a `slack_channel` name, and a `schedule`.

  Delivery is Slack-only: the `email` argument is not implemented and is ignored, and Slack must
  be connected in Metabase settings. A call without `slack_channel` fails, so if the user asks to
  be emailed a dashboard, tell them this tool can only deliver to Slack rather than accepting an
  email address."
  [{:keys [dashboard_id email slack_channel schedule]} :- subscription-schema]
  (try
    (create-dashboard-subscription
     {:dashboard-id  dashboard_id
      :email         email
      :slack-channel slack_channel
      :schedule      (-> schedule
                         (update :frequency keyword)
                         (cond->
                          (:day_of_week schedule)  (-> (assoc :day-of-week (keyword (:day_of_week schedule)))
                                                       (dissoc :day_of_week))
                          (:day_of_month schedule) (-> (assoc :day-of-month (keyword (:day_of_month schedule)))
                                                       (dissoc :day_of_month))))})
    (catch Exception e
      (log/errorf "Error creating dashboard subscription: %s" (ex-message e))
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to create dashboard subscription: " (or (ex-message e) "Unknown error"))}))))
