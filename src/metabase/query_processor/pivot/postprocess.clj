(ns metabase.query-processor.pivot.postprocess
  "Post-process utils for pivot exports

  The shape returned by the pivot qp is not the same visually as what a pivot table looks like in the app.
  It's all of the same data, but some post-processing logic needs to run on the rows to be able to present them
  visually in the same way as in the app."
  (:require
   [clojure.math.combinatorics :as math.combo]
   [clojure.set :as set]
   [metabase.query-processor.streaming.common :as common]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

;; I'll do my best to concisely explain what's happening here. Some terms:
;;  - raw pivot rows -> the rows returned by the above 'pivot query processor machinery'.
;;  - pivot-cols/pivot-rows -> vectors of indices into the raw pivot rows where the final pivot row/col values come from
;;    the values from these indices are what make up the header row and header column labels
;;  - pivot-measures -> vector of indices into raw pivot rows where the aggregated value comes from. This
;;    the values from these indices (often just 1 idx) are what end up in the table's 'cells' (the stuff making up the bulk of the table)

;; an example of what a raw pivot row might look like, with header shown for clarity:
;; {:Cat A "AA", :Cat B "BA", :Cat C "CA", :Cat D "DA", :pivot-grouping 0, :Sum of Measure 1}
;; [Cat A Cat B Cat C Cat D pivot-grouping Sum of Measure]
;; [ "AA"  "BA"  "CA"  "DA"              0              1]

;; The 'pivot-grouping' is the giveaway. If you ever see that column, you know you're dealing with raw pivot rows.

;; Most of the post processing functions use a 'pivot-spec' map.
(mr/def ::pivot-spec
  [:map
   [:column-titles  [:sequential [:string]]]
   [:pivot-rows     [:sequential [:int {:min 0}]]]
   [:pivot-cols     [:sequential [:int {:min 0}]]]
   [:pivot-grouping-key {:optional true}
    [:int {:min 0}]]
   [:pivot-measures {:optional true}
    [:sequential [:int {:min 0}]]]])

(defn pivot-grouping-key
  "Get the index into the raw pivot rows for the 'pivot-grouping' column."
  [column-titles]
  ;; a vector is kinda sorta a map of indices->values, so
  ;; we can use map-invert to create the map
  (get (set/map-invert (vec column-titles)) "pivot-grouping"))

(mu/defn- pivot-measures
  "Get the indices into the raw pivot rows corresponding to the pivot table's measure(s)."
  [{:keys [pivot-rows pivot-cols column-titles]} :- ::pivot-spec]
  (-> (set/difference
       ;; every possible idx is just the range over the count of cols
       (set (range (count column-titles)))
       ;; we exclude indices already used in pivot rows and cols, and the pivot-grouping key
       ;; recall that a raw pivot row will always contain this 'pivot-grouping' column, which we don't actually need to use.
       (set (concat pivot-rows pivot-cols [(pivot-grouping-key column-titles)])))
      sort
      vec))

(mu/defn add-pivot-measures :- ::pivot-spec
  "Given a pivot-spec map without the `:pivot-measures` key, determine what key(s) the measures will be and assoc that value into `:pivot-measures`."
  [pivot-spec :- ::pivot-spec]
  (-> pivot-spec
      (assoc :pivot-measures (pivot-measures pivot-spec))
      (assoc :pivot-grouping (pivot-grouping-key (:column-titles pivot-spec)))))

(mu/defn add-totals-settings :- ::pivot-spec
  "Given a pivot-spec map without the `:pivot-measures` key, determine what key(s) the measures will be and assoc that value into `:pivot-measures`."
  [pivot-spec :- ::pivot-spec viz-settings]
  (let [row-totals (if (contains? viz-settings :pivot.show_row_totals)
                     (:pivot.show_row_totals viz-settings)
                     true)
        col-totals (if (contains? viz-settings :pivot.show_column_totals)
                     (:pivot.show_column_totals viz-settings)
                     true)]
    (-> pivot-spec
        (assoc :row-totals? row-totals)
        (assoc :col-totals? col-totals))))

(mu/defn init-pivot
  "Initiate the pivot data structure."
  [pivot-spec :- ::pivot-spec]
  (let [{:keys [pivot-rows pivot-cols pivot-measures]} pivot-spec]
    {:config         pivot-spec
     :data           {}
     :row-values     (zipmap pivot-rows (repeat (sorted-set)))
     :column-values  (zipmap pivot-cols (repeat (sorted-set)))
     :measure-values (zipmap pivot-measures (repeat (sorted-set)))}))

(defn- update-set [m k v]
  (update m k conj v))

(defn- update-aggregate [measure-aggregations new-values agg-fns]
  (into {}
        (map
         (fn [[measure-key agg]]
           (let [agg-fn (get agg-fns measure-key +)
                 new-v  (get new-values measure-key)]
             [measure-key (agg-fn agg new-v)])))
        measure-aggregations))

(defn add-row
  "Aggregate the given `row` into the `pivot` datastructure."
  [pivot row]
  (let [{:keys [pivot-rows
                pivot-cols
                pivot-measures
                measures]} (:config pivot)
        row-path           (mapv row pivot-rows)
        col-path           (mapv row pivot-cols)
        measure-vals       (select-keys row pivot-measures)
        total-fn           (fn [m path]
                             (if (seq path)
                               (update-in m path
                                          #(update-aggregate (or % (zipmap pivot-measures (repeat 0))) measure-vals measures))
                               m))]
    (-> pivot
        (update :row-count (fn [v] (if v (inc v) 0)))
        (update :data update-in (concat row-path col-path)
                #(update-aggregate (or % (zipmap pivot-measures (repeat 0))) measure-vals measures))
        (update :totals (fn [totals]
                          (-> totals
                              (total-fn [:grand-total])
                              (total-fn row-path)
                              (total-fn col-path)
                              (total-fn [:section-totals (first row-path)])
                              (total-fn (concat [:column-totals (first row-path)] col-path)))))
        (update :row-values #(reduce-kv update-set % (select-keys row pivot-rows)))
        (update :column-values #(reduce-kv update-set % (select-keys row pivot-cols))))))

(defn- fmt
  "Format a value using the provided formatter or identity function."
  [formatter value]
  ((or formatter identity) (common/format-value value)))

(defn- build-column-headers
  "Build multi-level column headers."
  [{:keys [pivot-cols pivot-measures column-titles row-totals?]} col-combos col-formatters]
  (concat
   (if (= 1 (count pivot-measures))
     (mapv (fn [col-combo] (mapv fmt col-formatters col-combo)) col-combos)
     (for [col-combo col-combos
           measure-key pivot-measures]
       (conj
        (mapv fmt col-formatters col-combo)
        (get column-titles measure-key))))
   (repeat (count pivot-measures)
           (concat
            (when (and row-totals? (seq pivot-cols)) ["Row totals"])
            (repeat (dec (count pivot-cols)) nil)
            (when (and (seq pivot-cols) (> (count pivot-measures) 1)) [nil])))))

(defn- build-headers
  "Combine row keys with column headers."
  [column-headers {:keys [pivot-cols pivot-rows column-titles]}]
  (map (fn [h]
         (if (and (seq pivot-cols) (not (seq pivot-rows)))
           (concat (map #(get column-titles %) pivot-cols) h)
           (concat (map #(get column-titles %) pivot-rows) h)))
       (let [hs (filter seq column-headers)]
         (when (seq hs)
           (apply map vector hs)))))

(defn- build-row
  "Build a single row of the pivot table."
  [row-combo col-combos pivot-measures data totals row-totals? ordered-formatters row-formatters]
  (let [row-path row-combo]
    (concat
     (when-not (seq row-formatters) (repeat (count pivot-measures) nil))
     (mapv fmt row-formatters row-combo)
     (concat
      (for [col-combo col-combos
            measure-key pivot-measures]
        (fmt (get ordered-formatters measure-key)
             (get-in data (concat row-path col-combo [measure-key]))))
      (when row-totals?
        (for [measure-key pivot-measures]
          (fmt (get ordered-formatters measure-key)
               (get-in totals (concat row-path [measure-key])))))))))

(defn- build-column-totals
  "Build column totals for a section."
  [section col-combos pivot-measures totals row-totals? ordered-formatters pivot-rows]
  (concat
   (cons (format "Totals for %s" (fmt (get ordered-formatters (first pivot-rows)) section))
         (repeat (dec (count pivot-rows)) nil))
   (for [col-combo col-combos
         measure-key pivot-measures]
     (fmt (get ordered-formatters measure-key)
          (get-in totals (concat
                          [:column-totals section]
                          col-combo
                          [measure-key]))))
   (when row-totals?
     (for [measure-key pivot-measures]
       (fmt (get ordered-formatters measure-key)
            (get-in totals [:section-totals section measure-key]))))))

(defn- build-grand-totals
  "Build grand totals row."
  [{:keys [pivot-cols pivot-rows]} col-combos pivot-measures totals row-totals? ordered-formatters]
  (concat
   (if (and (seq pivot-cols) (not (seq pivot-rows)))
     (cons "Grand totals" (repeat (dec (count pivot-cols)) nil))
     (cons "Grand totals" (repeat (dec (count pivot-rows)) nil)))
   (when row-totals?
     (for [col-combo col-combos
           measure-key pivot-measures]
       (fmt (get ordered-formatters measure-key)
            (get-in totals (concat col-combo [measure-key])))))
   (for [measure-key pivot-measures]
     (fmt (get ordered-formatters measure-key)
          (get-in totals [:grand-total measure-key])))))

(defn build-pivot-output
  "Arrange and format the aggregated `pivot` data."
  [pivot ordered-formatters]
  (let [{:keys [config data totals row-values column-values]} pivot
        {:keys [pivot-rows pivot-cols pivot-measures column-titles row-totals? col-totals?]} config
        row-formatters (mapv #(get ordered-formatters %) pivot-rows)
        col-formatters (mapv #(get ordered-formatters %) pivot-cols)
        row-combos (apply math.combo/cartesian-product (map row-values pivot-rows))
        col-combos (apply math.combo/cartesian-product (map column-values pivot-cols))
        row-totals? (and row-totals? (boolean (seq pivot-cols)))
        column-headers (build-column-headers config col-combos col-formatters)
        headers (or (seq (build-headers column-headers config))
                    [(concat
                      (map #(get column-titles %) pivot-rows)
                      (map #(get column-titles %) pivot-measures))])]
    (concat
     headers
     (apply concat
            (for [section-row-combos (sort-by ffirst (vals (group-by first row-combos)))]
              (concat
               (for [row-combo (sort-by first section-row-combos)]
                 (build-row row-combo col-combos pivot-measures data totals row-totals? ordered-formatters row-formatters))
               (when (and col-totals? (> (count pivot-rows) 1))
                 [(build-column-totals (ffirst section-row-combos) col-combos pivot-measures totals row-totals? ordered-formatters pivot-rows)]))))
     (when col-totals?
       [(build-grand-totals config col-combos pivot-measures totals row-totals? ordered-formatters)]))))
