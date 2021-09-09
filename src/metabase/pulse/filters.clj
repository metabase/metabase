(ns metabase.pulse.filters
  "Utilities for processing dashboard filters for inclusion in dashboard subscriptions.")

(defn merge-filters
  "Returns a definitive list of filters applied to a dashboard subscription, combining the :parameters field on the
  Pulse model with any filters with default values set on the dashboard."
  [subscription dashboard]
  (let [subscription-filters-by-id (into {} (for [filter (:parameters subscription)]
                                              [(:id filter) filter]))
        dashboard-filters-by-id    (into {} (for [filter (:parameters dashboard)]
                                              (if (:default filter)
                                                [(:id filter) filter])))]
    (vals (merge subscription-filters-by-id dashboard-filters-by-id))))
