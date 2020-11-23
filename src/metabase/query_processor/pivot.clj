(ns metabase.query-processor.pivot
  "Pivot table actions for the query processor")

(defn powerset
  "Generate the set of all subsets"
  [items]
  (reduce (fn [s x]
            (clojure.set/union s (map #(conj % x) s)))
          (hash-set #{})
          items))

(defn- generate-breakouts
  "Generate the combinatorial breakouts for a given query pivot table query"
  [breakouts]
  (powerset (set breakouts)))

(defn generate-queries
  "Generate the additional queries to perform a generic pivot table"
  [request]
  (let [query     (:query request)
        breakouts (generate-breakouts (:breakout query))]
    (map (fn [breakout]
           {:breakout (vec breakout)
            :query    (assoc query :breakout (vec breakout))}) breakouts)))