(ns metabase.metabot.tools.subscriptions
  "`create_dashboard_subscription` for the Chat profile, which subscribes a Slack channel that the model names, and
  the subscription code that it shares with the Slack profile's variant."
  (:require
   [metabase.api.common :as api]
   [metabase.channel.settings :as channel.settings]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.create-alert :as tools.create-alert]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.models.interface :as mi]
   [metabase.pulse.api :as pulse.api]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- make-slack-channel
  "Build a pulse channel for Slack delivery."
  [schedule slack-channel]
  (merge {:channel_type :slack
          :enabled      true
          :details      {:channel slack-channel}}
         (metabot.tools.u/schedule->schedule-map schedule)))

(defn- pulse-card
  "The question on a dashcard of the dashboard with `dashboard-id`, in the form that
  [[pulse.api/create-pulse-with-perm-checks!]] takes."
  [dashboard-id {:keys [id card]}]
  (-> card
      (select-keys [:id :name :collection_id :description :display :parameter_mappings])
      (assoc :dashboard_card_id id
             :dashboard_id      dashboard-id
             :include_csv       false
             :include_xls       false)))

(defn- create-pulse!
  "Create the pulse that sends the questions on `dashcards` of `dashboard` to the Slack `channel` on `schedule`, and
  return it."
  [{dashboard-id :id :as dashboard} dashcards channel schedule]
  (tools.create-alert/do-with-refusal
   ::no-subscription-permission
   (tru "You don''t have permission to create a subscription for this dashboard.")
   #(pulse.api/create-pulse-with-perm-checks!
     (map (partial pulse-card dashboard-id) dashcards)
     [(make-slack-channel schedule channel)]
     (-> dashboard
         (select-keys [:collection_id :collection_position :name :parameters])
         (assoc :dashboard_id  dashboard-id
                :creator_id    api/*current-user-id*
                :skip_if_empty false)))))

(defn create-dashboard-subscription!
  "Subscribe the Slack `channel`, named the way Metabase's cached list of channels names it, to the dashboard with
  `dashboard-id` on `schedule`, and return the tool result that reports it.

  Throws the declared not-found error when the dashboard is missing or unreadable, and an unrecoverable error when
  the user can read it but may not subscribe to it."
  [{:keys [dashboard-id channel schedule]}]
  (let [dashboard (tools/with-entity {:kind :dashboard :id dashboard-id}
                    (-> (metabot.db/dashboard dashboard-id)
                        api/read-check
                        (t2/hydrate [:dashcards :card])))
        dashcards (filter (comp int? :id :card) (:dashcards dashboard))]
    (when-not (every? (comp mi/can-read? :card) dashcards)
      (tools/unrecoverable!
       ::dashboard-cards-not-readable
       {:user-message (tru "You can''t subscribe to this dashboard, because you don''t have access to every question on it.")
        :data         {:dashboard-id dashboard-id}}))
    (let [pulse (create-pulse! dashboard dashcards channel schedule)]
      {:output (str "Created subscription " (:id pulse) " to dashboard \"" (:name dashboard) "\" (id " dashboard-id
                    "), posting to " channel ".")})))

(tools/defrecoverable unknown-slack-channel!
  "`slack_channel` names no channel or user in Metabase's cached list of Slack channels and users."
  {:payload [:map {:closed true} [:slack-channel :string]]}
  [{:keys [slack-channel]}]
  {:message  (str "Metabase can't post to " (pr-str slack-channel) ": it isn't a Slack channel or user that"
                  " Metabase knows about. Metabase knows public channels, private channels that the Metabase app"
                  " has been added to, and users. A channel created in the last few hours may not be there yet.")
   :recovery [{:uses #{}
               :text "Ask the user for the channel's exact name, as it appears in Slack."}]})

(def ^:private tool-description
  (str "Create a dashboard subscription that sends regular updates to a Slack channel.\n"
       "\n"
       "Use when a user wants to receive or send regular updates on a dashboard's contents.\n"
       "Requires a valid `dashboard_id`, a `slack_channel` name, and a `schedule`.\n"
       "\n"
       "Delivery is Slack-only, and Slack must be connected in Metabase settings. If the user asks to\n"
       "be emailed a dashboard, tell them this tool can only deliver to Slack."))

(defrecord CreateDashboardSubscriptionTool []
  tools/Tool
  (declaration [_]
    {:name        "create_dashboard_subscription"
     :description tool-description
     :scope       scope/agent-dashboard-subscribe
     :args        [:map {:closed true}
                   [:dashboard_id :int]
                   [:slack_channel [:string {:min 1}]]
                   [:schedule tools.create-alert/schedule-schema]]})

  (handle [_ {:keys [dashboard_id slack_channel schedule]} _ctx]
    (tools.create-alert/check-slack-configured!)
    (create-dashboard-subscription!
     {:dashboard-id dashboard_id
      :channel      (or (:display-name (channel.settings/find-cached-slack-channel-or-username slack_channel))
                        (unknown-slack-channel! {:slack-channel slack_channel}))
      :schedule     schedule})))

(def create-dashboard-subscription-tool
  "`create_dashboard_subscription` for the Chat profile."
  (->CreateDashboardSubscriptionTool))
