(ns metabase-enterprise.dashboard-subscription-filters.pulse
  (:require
   [metabase.public-settings.premium-features :refer [defenterprise]]))

(defenterprise the-parameters
  "Enterprise way of getting dashboard filter parameters. Blends parameters from dashboard subscription and the
  dashboard itself."
  :feature :dashboard-subscription-filters
  [dashboard-subscription-parameters dashboard]
  (let [dashboard-params       (:parameters dashboard)
        pulse-params-by-id     (group-by :id dashboard-subscription-parameters)
        dashboard-params-by-id (group-by :id dashboard-params)
        ids                    (distinct (map :id (concat dashboard-subscription-parameters dashboard-params)))]
    (for [id ids]
      (merge (first (get dashboard-params-by-id id))
             (first (get pulse-params-by-id id))))))
