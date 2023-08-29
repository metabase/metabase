(ns metabase-enterprise.dashboard-subscription-filters.pulse
  (:require
   [metabase.public-settings.premium-features :refer [defenterprise]]))

(defenterprise the-parameters
  "Enterprise way of getting dashboard filter parameters. Blends parameters from dashboard subscription and the
  dashboard itself."
  :feature :dashboard-subscription-filters
  [pulse dashboard]
  (let [pulse-params           (:parameters pulse)
        dashboard-params       (:parameters dashboard)
        pulse-params-by-id     (group-by :id pulse-params)
        dashboard-params-by-id (group-by :id dashboard-params)
        default-pulse?         (some (comp nil? :value) pulse-params)
        selected-params        (concat pulse-params (when default-pulse? dashboard-params))
        selected-ids           (distinct (map :id selected-params))]
    (for [id selected-ids]
      (merge (first (get dashboard-params-by-id id))
             (first (get pulse-params-by-id id))))))
