(ns metabase.query-processor.pivot
  "Pivot table actions for the query processor")

(defn powerset
  "Generate a powerset while maintaining the original ordering as much as possible"
  [xs]
  (for [combo (reverse (range (int (Math/pow 2 (count xs)))))]
    (for [item  (range 0 (count xs))
          :when (not (zero? (bit-and (bit-shift-left 1 item) combo)))]
      (nth xs item))))

(defn- generate-specified-breakouts
  "Generate breakouts specified by pivot_rows"
  [breakouts pivot-rows pivot-cols]
  (let [generator (fn [coll]
                    (for [pivots coll]
                      (map #(nth breakouts %) pivots)))]
    (concat
     [breakouts]
     (generator [pivot-cols])
     (generator (powerset pivot-rows)))))

(defn add-grouping-field
  "Add the grouping field and expression to the query"
  [query breakout index]
  (-> query
      (assoc-in [:query :breakout] breakout)
      ;;TODO: `pivot-grouping` is not "magic" enough to mark it as an internal thing
      (update-in [:query :fields]
                 #(conj % [:expression "pivot-grouping"]))
      ;;TODO: replace this value with a bitmask or something to indicate the source better
      (update-in [:query :expressions]
                 #(assoc % "pivot-grouping" [:abs index]))))

(defn generate-queries
  "Generate the additional queries to perform a generic pivot table"
  [request]
  (let [query     (:query request)
        breakouts (generate-specified-breakouts (:breakout query)
                                                (:pivot_rows request)
                                                (:pivot_cols request))]
    (map (fn [[index breakout]]
           (add-grouping-field request breakout index))
         (map-indexed vector breakouts))))
