(ns metabase-enterprise.pulse
  "TODO -- this should be moved to `metabase-enterprise.<feature>.pulse` once we figure out which feature this belongs
  to."
  (:require [metabase.public-settings.premium-features :refer [defenterprise]]))

(defenterprise the-parameters
  "Enterprise way of getting dashboard filter parameters. Blends parameters from dashboard subscription and the
  dashboard itself."
  :feature :any
  [pulse dashboard]
  (let [pulse-params           (:parameters pulse)
        dashboard-params       (:parameters dashboard)
        pulse-params-by-id     (group-by :id pulse-params)
        dashboard-params-by-id (group-by :id dashboard-params)
        ids                    (distinct (map :id (concat pulse-params dashboard-params)))]
    (for [id ids]
      (merge (first (get dashboard-params-by-id id))
             (first (get pulse-params-by-id id))))))
