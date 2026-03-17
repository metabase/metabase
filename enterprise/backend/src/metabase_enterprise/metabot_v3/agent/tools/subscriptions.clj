(ns metabase-enterprise.metabot-v3.agent.tools.subscriptions
  "Dashboard subscription tool wrapper."
  (:require
   [metabase-enterprise.metabot-v3.tools.create-dashboard-subscription :as subscription-tools]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn ^{:tool-name "create_dashboard_subscription"}
  create-dashboard-subscription-tool
  "Create a dashboard subscription to send regular email updates.

  Use when a user wants to receive or send regular updates on a dashboard's contents.
  Requires a valid dashboard ID, email address, and schedule.

  Do NOT infer email addresses from usernames or other information.
  If the email address is incomplete or missing a part like the TLD,
  ask the user for clarification before proceeding."
  [{:keys [dashboard_id email schedule]}
   :- [:map {:closed true}
       [:dashboard_id :int]
       [:email :string]
       [:schedule [:map
                   [:frequency [:enum "hourly" "daily" "weekly" "monthly"]]
                   [:hour {:optional true} [:maybe :int]]
                   [:day_of_week {:optional true} [:maybe :string]]
                   [:day_of_month {:optional true} [:maybe :string]]]]]]
  (try
    (subscription-tools/create-dashboard-subscription
     {:dashboard-id dashboard_id
      :email        email
      :schedule     (-> schedule
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
        {:output (str "Failed to create dashboard subscription: " (or (ex-message e) "Unknown error"))}))))
