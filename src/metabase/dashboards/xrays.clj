(ns metabase.dashboards.xrays
  "The x-rays of Dashboards."
  (:require
   [metabase.xrays.related :as xrays.related]))

(set! *warn-on-reflection* true)

(defn related
  "The related entities of `dashboard`."
  [dashboard]
  (let [cards (xrays.related/dashboard-cards dashboard)]
    {:cards (->> cards
                 (mapcat xrays.related/similar-questions)
                 (remove (set cards))
                 distinct
                 xrays.related/filter-visible
                 xrays.related/interesting-mix)}))
