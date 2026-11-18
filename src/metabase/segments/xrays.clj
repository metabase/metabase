(ns metabase.segments.xrays
  "The x-rays of Segments."
  (:require
   [metabase.segments.schema :as segments.schema]
   [metabase.util.malli :as mu]
   [metabase.xrays.db :as xrays.db]
   [metabase.xrays.related :as xrays.related]))

(set! *warn-on-reflection* true)

(mu/defn definition
  "The filters of the first stage of the definition of `segment`, nil when it has none."
  [segment :- [:map [:definition [:maybe ::segments.schema/definition]]]]
  (-> segment :definition :stages first :filters not-empty))

(defn related
  "The related entities of `segment`."
  [segment]
  (let [table (xrays.db/table (:table_id segment))]
    {:table       table
     :metrics     (xrays.related/metrics-for-table table)
     :segments    (->> table
                       xrays.related/segments-for-table
                       (xrays.related/rank-by-similarity segment)
                       xrays.related/interesting-mix)
     :linked-from (xrays.related/linked-from table)}))
