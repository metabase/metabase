(ns metabase.pulse.filters
  "Utilities for processing dashboard filters for inclusion in dashboard subscriptions."
  (:require [clojure.string :as str]
            [metabase.config :as config]
            [metabase.util :as u]
            [metabase.util.urls :as url]))

(defn merge-filters
  "Returns a definitive list of filters applied to a dashboard subscription, combining the :parameters field on the
  subscription with any filters with default values set on the dashboard.

  Only default dashboard subscriptions are allowed for non-EE builds."
  [subscription dashboard]
  (let [subscription-filters       (if config/ee-available?
                                     (:parameters subscription)
                                     [])
        subscription-filters-by-id (into {} (for [filter subscription-filters]
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

(defn dashboard-url
  "Given a dashboard and subscription, returns a URL for the dashboard with filters included"
  [subscription dashboard]
  (let [base-url       (url/dashboard-url (:id dashboard))
        merged-filters (merge-filters subscription dashboard)
        url-params     (flatten
                        (for [filter merged-filters]
                          (for [value (u/one-or-many (or (:value filter) (:default filter)))]
                            (str (:slug filter) "=" value))))]
    (str base-url "?" (str/join "&" url-params))))

;; TODO
(defn humanize-filter
  "Given a filter, returns a best-effort human-readable string representation of the filter name and value"
  [filter]
  "")
