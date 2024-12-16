(ns metabase-enterprise.dashboard-subscription-filters.parameter
  (:require
   [metabase.public-settings.premium-features :refer [defenterprise]]))

(defenterprise the-parameters
  "Enterprise way of getting dashboard filter parameters. Blends parameters from dashboard subscription and the
  dashboard itself."
  :feature :dashboard-subscription-filters
  [dashboard-subscription-params dashboard-params]
  (let [pulse-params-by-id     (group-by :id dashboard-subscription-params)
        dashboard-params-by-id (group-by :id dashboard-params)
        ids                    (distinct (map :id (concat dashboard-subscription-params dashboard-params)))]
    (for [id ids]
      (merge (first (get dashboard-params-by-id id))
             (first (get pulse-params-by-id id))))))
