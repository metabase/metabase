(ns metabase-enterprise.metabot-v3.tools.create-dashboard-subscription
  (:require
   [metabase.api.common :as api]
   ^{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.pulse.core :as pulse]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn create-dashboard-subscription
  "Create a dashboard subscription."
  [{:keys [dashboard-id email schedule]}]
  (if (int? dashboard-id)
    (let [dashboard (-> (t2/select-one :model/Dashboard :id dashboard-id)
                        (t2/hydrate [:dashcards :card]))
          cards (for [{:keys [id card]} (:dashcards dashboard)
                      :when (-> card :id int?)]
                  (-> card
                      (select-keys [:id :name :collection_id :description :display :parameter_mappings])
                      (assoc :dashboard_card_id id :dashboard_id dashboard-id)))
          recipient-id (t2/select-one-fn :id :model/User :email email)
          recipient {:id recipient-id}
          {:keys [frequency hour day_of_week day_of_month]} schedule
          channel {:channel_type :email
                   :enabled true
                   :recipients [recipient]
                   :schedule_day (or (some-> day_of_week (subs 0 3) u/lower-case-en)
                                     (some->> day_of_month
                                              u/lower-case-en
                                              (re-find #"^(?:first|last)-(mon|tue|wed|thu|fri|sat|sun)")
                                              second))
                   :schedule_frame (some->> day_of_month (re-find #"^(?:first|mid|last)"))
                   :schedule_hour hour
                   :schedule_type frequency}
          pulse-data (-> dashboard
                         (select-keys [:collection_id :collection_position :name :parameters])
                         (assoc :dashboard_id  dashboard-id
                                :creator_id    api/*current-user-id*
                                :skip_if_empty false))]
      {:output
       (cond
         (nil? recipient-id)
         "no user with this email found"

         (nil? dashboard)
         "no dashboard with this dashboard_id found"

         :else
         (do (pulse/create-pulse! (map pulse/card->ref cards) [channel] pulse-data)
             "success"))})
    {:output "invalid dashboard_id"}))
