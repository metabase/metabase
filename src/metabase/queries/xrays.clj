(ns metabase.queries.xrays
  "The x-rays of Cards and Queries."
  (:require
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [metabase.xrays.related :as xrays.related]))

(set! *warn-on-reflection* true)

(defn definition
  "The breakouts, aggregations, expressions and fields of the query of `card`, nil when the query does not parse."
  [card]
  (try
    (-> card
        :dataset_query
        ((juxt lib/breakouts lib/aggregations lib/expressions lib/fields)))
    (catch Exception e
      (log/debugf "Ignoring Card %s while finding related entities because its query could not be parsed: %s"
                  (:id card) (ex-message e))
      nil)))

(defn related
  "The related entities of `card`."
  [card]
  (let [table             (xrays.related/table-of card)
        similar-questions (xrays.related/similar-questions card)
        similar-metrics   (xrays.related/similar-metrics card)]
    {:table             table
     :metrics           (xrays.related/interesting-mix similar-metrics)
     :segments          (->> table
                             xrays.related/segments-for-table
                             (xrays.related/rank-by-similarity card)
                             xrays.related/interesting-mix)
     :dashboard-mates   (xrays.related/cards-sharing-dashboard card)
     :dashboards        (xrays.related/recommended-dashboards similar-questions)
     :collections       (xrays.related/recommended-collections similar-questions)}))

(defn related-query
  "The related entities of `query`, those of the Card it is the query of."
  [query]
  (related (mi/instance :model/Card query)))
