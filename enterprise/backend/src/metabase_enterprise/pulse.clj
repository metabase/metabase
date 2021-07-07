(ns metabase-enterprise.pulse
  (:require [metabase-enterprise.enhancements.ee-strategy-impl :as ee-strategy-impl]
            [metabase.public-settings.metastore :as settings.metastore]
            [metabase.pulse.interface :as i])
  (:import metabase.pulse.interface.SubscriptionParameters))

(def parameters-impl
  "Blend parameters from dashboard subscription and the dashboard itself"
  (reify
    i/SubscriptionParameters
    (the-parameters [_ pulse dashboard]
      (let [pulse-params           (:parameters pulse)
            dashboard-params       (:parameters dashboard)
            pulse-params-by-id     (group-by :id pulse-params)
            dashboard-params-by-id (group-by :id dashboard-params)
            ids                    (distinct (map :id (concat pulse-params dashboard-params)))]
        (for [id ids]
          (merge (first (get dashboard-params-by-id id))
                 (first (get pulse-params-by-id id))))))))

(def ee-strategy-parameters-impl
  "Enterprise way of getting dashboard filter parameters"
  (ee-strategy-impl/reify-ee-strategy-impl #'settings.metastore/enable-enhancements? parameters-impl i/default-parameters-impl
    i/SubscriptionParameters))
