(ns metabase.query-processor.pivot.postprocess
  "Post-process utils for pivot exports

  The shape returned by the pivot qp is not the same visually as what a pivot table looks like in the app.
  It's all of the same data, but some post-processing logic needs to run on the rows to be able to present them
  visually in the same way as in the app."
  (:refer-clojure :exclude [run!])
  (:require
   [clojure.set :as set]
   [metabase.formatter :as formatter]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.pivot.core :as pivot]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

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

(mr/def ::pivot-spec
  [:map
   [:column-titles  [:sequential [:string]]]
   [:pivot-rows     [:sequential [:int {:min 0}]]]
   [:pivot-cols     [:sequential [:int {:min 0}]]]
   [:pivot-grouping-key {:optional true}
    [:int {:min 0}]]
   [:pivot-measures {:optional true}
    [:sequential [:int {:min 0}]]]])

(def NON_PIVOT_ROW_GROUP
  "Pivot query results have a 'pivot-grouping' column. Rows whose pivot-grouping value is 0 are expected results.
  Rows whose pivot-grouping values are greater than 0 represent subtotals, and should not be included in non-pivot result outputs."
  0)

(defn pivot-grouping-key
  "Get the index into the raw pivot rows for the 'pivot-grouping' column."
  [column-titles]
  ;; A vector is kinda sorta a map of indices->values, so we can use map-invert to create the map
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

;; TODO: Better way to manage column settings similar to the FE?
(defn- merge-column-settings
  "Correlates column viz settings with columns by name in order to produce column settings closer
  to what the FE gets."
  [cols settings]
  (let [col-settings (::mb.viz/column-settings settings)]
    (map
     (fn [col]
       (merge
        {:column col}
        (get col-settings {::mb.viz/column-name (:name col)})))
     cols)))

(defn- column-split->indexes
  [column-split columns-without-pivot-group]
  (letfn [(find-index [col-name]
            (u/index-of (fn [col] (= (:name col) col-name))
                        columns-without-pivot-group))]
    (into {}
          (map (fn [[k column-names]]
                 [k (->> column-names
                         (map find-index)
                         (filter some?))])
               column-split))))

(defn- make-formatters
  [columns row-indexes col-indexes val-indexes settings timezone format-rows?]
  {:row-formatters (mapv #(formatter/create-formatter timezone (nth columns %) settings format-rows?) row-indexes)
   :col-formatters (mapv #(formatter/create-formatter timezone (nth columns %) settings format-rows?) col-indexes)
   :val-formatters (mapv #(formatter/create-formatter timezone (nth columns %) settings format-rows?) val-indexes)})

(defn- build-top-headers
  [top-left-header top-header-items]
  (let [max-depth (if (empty? top-header-items)
                    0
                    (apply max (map :depth top-header-items)))
        left-width (count top-left-header)
        init-rows (for [i (range (inc max-depth))]
                    (if (= i max-depth)
                      (vec top-left-header)
                      (vec (repeat left-width nil))))
        result (vec init-rows)]
    (reduce
     (fn [acc item]
       (let [{:keys [depth value span]} item
             current-row (get acc depth)
             new-row (-> current-row
                         (conj value)
                         (into (repeat (dec span) value)))]
         (assoc acc depth new-row)))
     result
     top-header-items)))

(defn- build-left-headers
  [left-header-items]
  (let [max-depth (if (empty? left-header-items)
                    0
                    (apply max (map :depth left-header-items)))
        spans-by-depth (group-by :depth left-header-items)
        max-span-positions (for [depth (range (inc max-depth))]
                             (if-let [items (get spans-by-depth depth)]
                               (apply max (map (fn [item]
                                                 (+ (:offset item) (:span item)))
                                               items))
                               0))
        result-height (if (empty? max-span-positions)
                        0
                        (apply max max-span-positions))
        result (vec (repeat result-height
                            (vec (repeat (inc max-depth) nil))))]
    (reduce
     (fn [acc item]
       (let [{:keys [depth value span offset]} item
             new-acc (reduce (fn [grid row-idx]
                               (assoc-in grid [row-idx depth] value))
                             acc
                             (range offset (+ offset span)))]
         new-acc))
     result
     left-header-items)))

(defn- build-full-pivot
  [get-row-section left-headers top-headers measure-count]
  (let [row-count (count left-headers)
        left-width (count (first left-headers))
        col-count (- (count (first top-headers)) left-width)
        result (concat top-headers
                      ;; For each row in left-headers...
                       (for [row-idx (range row-count)]
                         (let [left-row (nth left-headers row-idx)
                              ;; ...get cell values for this row
                               cell-values (mapcat (fn [col-idx]
                                                     (let [values (get-row-section col-idx row-idx)]
                                                       (map :value values)))
                                                   (range (/ col-count measure-count)))]
                           ;; Combine left headers with cell values
                           (into left-row cell-values))))]
    (vec result)))

(defn build-pivot-output
  "Processes pivot data into the final pivot structure for exports."
  [{:keys [data settings timezone format-rows?]}]
  (let [columns (pivot/columns-without-pivot-group (:cols data))
        column-split (:pivot_table.column_split settings)
        {row-indexes :rows
         col-indexes :columns
         val-indexes :values} (pivot/column-split->indexes column-split columns)
        col-settings (merge-column-settings columns settings)
        {:keys [row-formatters
                col-formatters
                val-formatters]} (make-formatters columns row-indexes col-indexes val-indexes settings timezone format-rows?)
        {:keys [leftHeaderItems
                topHeaderItems
                getRowSection]} (pivot/process-pivot-table data
                                                           row-indexes
                                                           col-indexes
                                                           val-indexes
                                                           columns
                                                           col-formatters
                                                           row-formatters
                                                           val-formatters
                                                           format-rows?
                                                           settings
                                                           col-settings
                                                           nil)
        top-left-header (map (fn [i] (pivot/display-name-for-col (nth columns i) (nth col-settings i) format-rows?))
                             row-indexes)
        top-headers (build-top-headers top-left-header topHeaderItems)
        left-headers (build-left-headers leftHeaderItems)]
    (build-full-pivot getRowSection left-headers top-headers (count (:values column-split)))))
