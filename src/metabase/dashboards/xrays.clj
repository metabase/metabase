(ns metabase.dashboards.xrays
  "The x-rays of Dashboards."
  (:require
   [metabase.xrays.db :as xrays.db]
   [metabase.xrays.related :as xrays.related]))

(set! *warn-on-reflection* true)

(defn related
  "The related entities of `dashboard`."
  [dashboard]
  (let [cards (map xrays.db/card (xrays.db/card-ids-for-dashboard (:id dashboard)))]
    {:cards (->> cards
                 (mapcat xrays.related/similar-questions)
                 (remove (set cards))
                 distinct
                 xrays.related/filter-visible
                 xrays.related/interesting-mix)}))
