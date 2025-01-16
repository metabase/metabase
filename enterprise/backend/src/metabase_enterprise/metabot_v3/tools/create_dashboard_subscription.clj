(ns metabase-enterprise.metabot-v3.tools.create-dashboard-subscription
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.models.pulse :as models.pulse]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(defn- channel
  [email {:keys [frequency hour day_of_week day_of_month] :as _schedule}]
  (when-let [recipient-id (t2/select-one-fn :id :model/User :email email)]
    {:channel_type :email
     :enabled true
     :recipients [{:id recipient-id}]
     :schedule_day (or (some-> day_of_week (subs 0 3) u/lower-case-en)
                       (some->> day_of_month
                                u/lower-case-en
                                (re-find #"^(?:first|last)-(mon|tue|wed|thu|fri|sat|sun)")
                                second))
     :schedule_frame (some->> day_of_month (re-find #"^(?:first|mid|last)"))
     :schedule_hour hour
     :schedule_type frequency}))

(defn- check-card-read-permissions
  [card]
  (api/read-check :model/Card (u/the-id card)))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/create-dashboard-subscription
  [_tool-name {:keys [dashboard-id email schedule] :as _arguments} _env]
  (validation/check-has-application-permission :subscription false)
  (let [dashboard (-> (t2/select-one :model/Dashboard :id dashboard-id)
                      (t2/hydrate [:dashcards :card]))
        cards (for [{:keys [id card]} (:dashcards dashboard)]
                (-> card
                    (select-keys [:id :name :collection_id :description :display :parameter_mappings])
                    (assoc :dashboard_card_id id :dashboard_id dashboard-id)))
        _ (run! check-card-read-permissions cards)
        chan (channel email schedule)
        pulse-data (-> dashboard
                       (select-keys [:collection_id :collection_position :name :parameters])
                       (assoc :dashboard_id  dashboard-id
                              :creator_id    api/*current-user-id*
                              :skip_if_empty false))]
    (if chan
      (do (models.pulse/create-pulse! (map models.pulse/card->ref cards) [chan] pulse-data)
          {:output "success"})
      {:output "no user with this email found"})))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/create-alert
  [_tool-name {:keys [report-id email schedule alert_condition alert_first_only alert_above_goal] :as _arguments} _env]
  (let [card (t2/select-one :model/Card :id report-id)
        _ (check-card-read-permissions card)
        alert-card (cond-> card
                     (= alert_condition "rows") (assoc :include_csv true))
        chan (channel email schedule)
        pulse-data {:alert_condition alert_condition
                    :alert_first_only alert_first_only
                    :alert_above_goal alert_above_goal}]
    (if chan
      (do (models.pulse/create-alert! pulse-data api/*current-user-id* (models.pulse/card->ref alert-card) [channel])
          {:output "success"})
      {:output "no user with this email found"})))
