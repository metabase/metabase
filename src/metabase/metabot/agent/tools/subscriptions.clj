(ns metabase.metabot.agent.tools.subscriptions
  "Dashboard subscription tool wrapper."
  (:require
   [metabase.metabot.tools.create-dashboard-subscription :as subscription-tools]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private schema
  [:map {:closed true}
   [:dashboard_id :int]
   [:email {:optional true} [:maybe :string]]
   [:slack_channel {:optional true} [:maybe :string]]
   [:schedule [:map
               [:frequency [:enum "hourly" "daily" "weekly" "monthly"]]
               [:hour {:optional true} [:maybe :int]]
               [:day_of_week {:optional true} [:maybe :string]]
               [:day_of_month {:optional true} [:maybe :string]]]]])

(defn create-dashboard-subscription-tool "create-dashboard-subscription-tool" []
  {:tool-name "create_dashboard_subscription"
   :doc       "Create a dashboard subscription to send regular updates via email or Slack.

  Use when a user wants to receive or send regular updates on a dashboard's contents.
  Requires a valid dashboard ID, either an email address or a Slack channel name, and a schedule.

  Do NOT infer email addresses from usernames or other information.
  If the email address is incomplete or missing a part like the TLD,
  ask the user for clarification before proceeding."
   :schema    [:=> [:cat schema] :any]
   :fn        (fn [{:keys [dashboard_id email slack_channel schedule]}]
                (try
                  (subscription-tools/create-dashboard-subscription
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
                    (log/error e "Error creating dashboard subscription")
                    (if (:agent-error? (ex-data e))
                      {:output (ex-message e)}
                      {:output (str "Failed to create dashboard subscription: " (or (ex-message e) "Unknown error"))}))))})
