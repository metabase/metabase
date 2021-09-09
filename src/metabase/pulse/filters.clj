(ns metabase.pulse.filters
  "Utilities for processing dashboard filters for inclusion in dashboard subscriptions."
  (:require [clojure.string :as str]
            [metabase.util :as u]))

(defn merge-filters
  "Returns a definitive list of filters applied to a dashboard subscription, combining the :parameters field on the
  Pulse model with any filters with default values set on the dashboard."
  [subscription dashboard]
  (let [subscription-filters-by-id (into {} (for [filter (:parameters subscription)]
                                              [(:id filter) filter]))
        dashboard-filters-by-id    (into {} (for [filter (:parameters dashboard)]
                                              (when (:default filter)
                                                [(:id filter) filter])))]
    (vals (merge dashboard-filters-by-id subscription-filters-by-id))))

(defn value-string
  "Returns the value of a filter as a comma-separated string"
  [filter]
  (let [values (u/one-or-many (or (:value filter) (:default filter)))]
    (str/join ", " values)))
