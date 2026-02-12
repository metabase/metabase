(ns metabase.collections.util
  (:require
   [toucan2.core :as t2]))

(defn annotate-dashboards
  "Populates 'here' on dashboards (`below` is impossible since they can't contain collections)"
  [dashboards]
  (let [dashboard-ids (into #{} (map :id dashboards))
        dashboards-containing-cards (->> (when (seq dashboard-ids)
                                           (t2/query {:select-distinct [:dashboard_id]
                                                      :from :report_card
                                                      :where [:and
                                                              [:= :archived false]
                                                              [:in :dashboard_id dashboard-ids]
                                                              [:exists {:select 1
                                                                        :from :report_dashboardcard
                                                                        :where [:and
                                                                                [:= :report_dashboardcard.card_id :report_card.id]
                                                                                [:= :report_dashboardcard.dashboard_id :report_card.dashboard_id]]}]]}))
                                         (map :dashboard_id)
                                         (into #{}))]
    (for [dashboard dashboards]
      (cond-> dashboard
        (contains? dashboards-containing-cards (:id dashboard))
        (assoc :here #{:card})))))
