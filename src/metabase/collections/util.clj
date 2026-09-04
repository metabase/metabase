(ns metabase.collections.util
  (:require
   [metabase.collections.db :as collections.db]))

(defn annotate-dashboards
  "Populates 'here' on dashboards (`below` is impossible since they can't contain collections)"
  [dashboards]
  (let [dashboard-ids (into #{} (map :id dashboards))
        dashboards-containing-cards (->> (when (seq dashboard-ids)
                                           (collections.db/dashboard-ids-with-cards dashboard-ids))
                                         (map :dashboard_id)
                                         (into #{}))]
    (for [dashboard dashboards]
      (cond-> dashboard
        (contains? dashboards-containing-cards (:id dashboard))
        (assoc :here #{:card})))))
