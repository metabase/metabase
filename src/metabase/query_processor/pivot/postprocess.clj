(ns metabase.query-processor.pivot.postprocess
  "Post-process utils for pivot exports

  The shape returned by the pivot qp is not the same visually as what a pivot table looks like in the app.
  It's all of the same data, but some post-processing logic needs to run on the rows to be able to present them
  visually in the same way as in the app."
  (:require
   [clojure.math.combinatorics :as math.combo]
   [clojure.set :as set]
   [clojure.string :as str]
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

(def NON_PIVOT_ROW_GROUP
  "Pivot query results have a 'pivot-grouping' column. Rows whose pivot-grouping value is 0 are expected results.
  Rows whose pivot-grouping values are greater than 0 represent subtotals, and should not be included in non-pivot result outputs."
  0)

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
  [{measure-indices :pivot-measures :as pivot-spec} :- ::pivot-spec]
  (let [pivot-grouping-key (pivot-grouping-key (:column-titles pivot-spec))]
    (cond-> pivot-spec
      ;; if pivot-measures don't already exist (from the pivot qp), we add them ourselves, assuming lowest ID -> highest ID sort order
      (not (seq measure-indices)) (assoc :pivot-measures (pivot-measures pivot-spec))
      ;; otherwise, we modify indices to skip over whatever the pivot-grouping idx is, so we pull the correct values per row
      (seq measure-indices)       (update :pivot-measures (fn [indices]
                                                            (mapv (fn [idx]
                                                                    (if (>= idx pivot-grouping-key)
                                                                      (inc idx)
                                                                      idx))
                                                                  indices)))
      true                       (assoc :pivot-grouping pivot-grouping-key))))

(mu/defn add-totals-settings :- ::pivot-spec
  "Given a pivot-spec map and `viz-settings`, add the `:row-totals?` and `:col-totals?` keys."
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

(defn- update-set
  [m k v]
  (update m k conj v))

(defn- default-agg-fn
  [agg v]
  (when v
    (if (number? v)
      (+ agg v)
      v)))

(defn- update-aggregate
  "Update the given `measure-aggregations` with `new-values` using the appropriate function in the `agg-fns` map.

  Measure aggregations is a map whose keys are each pivot-measure; often just 1 key, but could be several depending on how the user has set up their measures.
  `new-values` are the values being added and have the same keys as `measure-aggregations`.
  `agg-fns` is also a map of the measure keys indicating the type of aggregation.
  For now (2024-09-10), agg-fn is `+`, which actually works fine for every aggregation type in our implementation. This is because the pivot qp
  returns rows that have already done the aggregation set by the user in the query (eg. count or sum, or whatever), so the post-processing done here
  will always work. For each 'cell', there will only ever be 1 value per measure (the already-aggregated value from the qp)."
  [measure-aggregations new-values agg-fns]
  (into {}
        (map
         (fn [[measure-key agg]]
           (let [agg-fn (get agg-fns measure-key default-agg-fn)
                 new-v  (get new-values measure-key)]
             [measure-key (if new-v
                            (agg-fn agg new-v)
                            agg)])))
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
        total-fn*          (fn [m path]
                             (if (seq path)
                               (update-in m path
                                          #(update-aggregate (or % (zipmap pivot-measures (repeat 0))) measure-vals measures))
                               m))
        total-fn           (fn [m paths]
                             (reduce total-fn* m paths))]
    (-> pivot
        (update :row-count (fn [v] (if v (inc v) 0)))
        (update :data update-in (concat row-path col-path)
                #(update-aggregate (or % (zipmap pivot-measures (repeat 0))) measure-vals measures))
        (update :totals (fn [totals]
                          (-> totals
                              (total-fn [[:grand-total]])
                              (total-fn [row-path])
                              (total-fn [col-path])
                              (total-fn [[:section-totals (first row-path)]])
                              #_(total-fn [(concat [:column-totals (first row-path)] col-path)])
                              (total-fn (map (fn [part]
                                               (concat [:column-totals] part col-path))
                                             (rest (reductions conj [] row-path)))))))
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
  (let [row-path       row-combo
        measure-values (for [col-combo   col-combos
                             measure-key pivot-measures]
                         (fmt (get ordered-formatters measure-key)
                              (get-in data (concat row-path col-combo [measure-key]))))]
    (when (some #(and (some? %) (not= "" %)) measure-values)
      (concat
       (when-not (seq row-formatters) (repeat (count pivot-measures) nil))
       row-combo
       #_(mapv fmt row-formatters row-combo)
       (concat
        measure-values
        (when row-totals?
          (for [measure-key pivot-measures]
            (fmt (get ordered-formatters measure-key)
                 (get-in totals (concat row-path [measure-key]))))))))))

(defn- build-column-totals
  "Build column totals for a section."
  [section-path col-combos pivot-measures totals row-totals? ordered-formatters pivot-rows]
  (let [totals-row (distinct (for [col-combo   col-combos
                                   measure-key pivot-measures]
                               (fmt (get ordered-formatters measure-key)
                                    (get-in totals (concat
                                                    [:column-totals]
                                                    section-path
                                                    col-combo
                                                    [measure-key])))))]
    (when (some #(and (some? %) (not= "" %)) totals-row)
      (concat
       (cons (format "Totals for %s" (fmt (get ordered-formatters (first pivot-rows)) (last section-path)))
             (repeat (dec (count pivot-rows)) nil))
       totals-row
       (when row-totals?
         (for [measure-key pivot-measures]
           (fmt (get ordered-formatters measure-key)
                (get-in totals (concat [:section-totals] section-path [measure-key])))))))))

(defn- build-grand-totals
  "Build grand totals row."
  [{:keys [pivot-cols pivot-rows pivot-measures]} col-combos totals row-totals? ordered-formatters]
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

(defn- append-totals-to-subsections
  [pivot section col-combos ordered-formatters]
  (let [{:keys [config
                totals]}      pivot
        {:keys [pivot-rows
                pivot-measures
                row-totals?]} config]
    (concat
     (reduce
      (fn [section pivot-row-idx]
        (mapcat
         (fn [[k rows]]
           (let [partial-path          (take pivot-row-idx (first rows))
                 subtotal-path         (concat partial-path [k])
                 total-row             (vec (build-column-totals
                                             subtotal-path
                                             col-combos
                                             pivot-measures
                                             totals
                                             row-totals?
                                             ordered-formatters pivot-rows))
                 ;; inside a subsection, we know that the 'parent' subsection values will all be the same
                 ;; so we can just grab it from the first row
                 next-subsection-value (nth (first rows) (dec pivot-row-idx))]
             (vec (concat
                   rows
                   ;; assoc the next subsection's value into the row so it stays grouped in the next reduction
                   [(if (<= (dec pivot-row-idx) 0)
                      total-row
                      (assoc total-row (dec pivot-row-idx) next-subsection-value))]))))
         (group-by (fn [r] (nth r pivot-row-idx)) section)))
      section
      (reverse (range 1 (dec (count pivot-rows)))))
     [(vec (build-column-totals
            [(ffirst section)]
            col-combos
            pivot-measures
            totals
            false #_row-totals?
            ordered-formatters pivot-rows))])))

(defn build-pivot-output
  "Arrange and format the aggregated `pivot` data."
  [pivot ordered-formatters]
  (let [{:keys [config
                data
                totals
                row-values
                column-values]} pivot
        {:keys [pivot-rows
                pivot-cols
                pivot-measures
                column-titles
                row-totals?
                col-totals?]}   config
        row-formatters          (mapv #(get ordered-formatters %) pivot-rows)
        col-formatters          (mapv #(get ordered-formatters %) pivot-cols)
        row-combos              (apply math.combo/cartesian-product (map row-values pivot-rows))
        col-combos              (apply math.combo/cartesian-product (map column-values pivot-cols))
        row-totals?             (and row-totals? (boolean (seq pivot-cols)))
        column-headers          (build-column-headers config col-combos col-formatters)
        headers                 (or (seq (build-headers column-headers config))
                                    [(concat
                                      (map #(get column-titles %) pivot-rows)
                                      (map #(get column-titles %) pivot-measures))])]
    (concat
     headers
     (filter seq
             (apply concat
                    (let [sections-rows
                          (for [section-row-combos (sort-by ffirst (vals (group-by first row-combos)))]
                            (concat
                             (remove nil?
                                     (for [row-combo (sort-by first section-row-combos)]
                                       (build-row row-combo col-combos pivot-measures data totals row-totals? ordered-formatters row-formatters)))))]
                      (mapv
                       (fn [section-rows]
                         (->>
                          ;; section rows are either enriched with column-totals rows or left as is
                          (if col-totals?
                            (append-totals-to-subsections pivot section-rows col-combos ordered-formatters)
                            section-rows)
                          ;; then, we apply the row-formatters to the pivot-rows portion of each row,
                          ;; filtering out any rows that begin with "Totals ..."
                          (mapv
                           (fn [row]
                             (let [[row-part vals-part] (split-at (count pivot-rows) row)]
                               (if (or
                                    (not (seq row-part))
                                    (str/starts-with? (first row-part) "Totals"))
                                 row
                                 (vec (concat (map fmt row-formatters row-part) vals-part))))))))
                       sections-rows))))
     (when col-totals?
       [(build-grand-totals config col-combos totals row-totals? ordered-formatters)]))))
