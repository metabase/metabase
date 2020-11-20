(ns metabase.query-processor.pivot
  "Pivot table actions for the query processor"
  (:require [metabase.util.i18n :refer [trs]]))

(defn- generate-breakouts
  "Generate the combinatorial breakouts for a given query pivot table query"
  [breakouts]
  (when (not= 3 (count breakouts))
    (throw (ex-info (trs "A pivot table query requires three breakouts") {:breakout breakouts})))

  [(take 1 breakouts) (take 2 breakouts) (take-last 2 breakouts) []])

(defn generate-queries
  "Generate the additional queries to perform a generic pivot table"
  [request]
  (let [query     (:query request)
        breakouts (generate-breakouts (:breakout query))]
    (map (fn [breakout]
           {:breakout breakout
            :query    (assoc query :breakout breakout)}) breakouts)))