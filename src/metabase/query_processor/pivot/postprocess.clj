(ns metabase.query-processor.pivot.postprocess
  "Post-process utils for pivot exports

  The shape returned by the pivot qp is not the same visually as what a pivot table looks like in the app.
  It's all of the same data, but some post-processing logic needs to run on the rows to be able to present them
  visually in the same way as in the app."
  (:refer-clojure :exclude [run!])
  (:require
   [clojure.set :as set]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.pivot.core :as pivot]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :as perf]))

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

(defn pivot-grouping-index
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
       (set (concat pivot-rows pivot-cols [(pivot-grouping-index column-titles)])))
      sort
      vec))

(mu/defn add-pivot-measures :- ::pivot-spec
  "Given a pivot-spec map without the `:pivot-measures` key, determine what key(s) the measures will be and assoc that value into `:pivot-measures`."
  [{measure-indices :pivot-measures :as pivot-spec} :- ::pivot-spec]
  (let [pivot-grouping-key (pivot-grouping-index (:column-titles pivot-spec))]
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

(defn- build-top-headers
  [top-left-header top-header-items]
  (if (empty? top-header-items)
    [(vec top-left-header)]  ;; Return just the top-left header for empty input
    (let [max-depth   (apply max (map :depth top-header-items))
          left-width  (count top-left-header)
          ;; Initialize rows - all rows except the last one are filled with nil
          header-rows (-> (vec (repeat max-depth (vec (repeat left-width nil))))
                          (conj (vec top-left-header)))]
      ;; Fill in the header values for each item
      (reduce
       (fn [rows {:keys [depth value span]}]
         (let [current-row (get rows depth)
               ;; Add the value and repeat it for the span
               new-row     (-> current-row
                               (conj value)
                               (into (repeat (dec span) value)))]
           (assoc rows depth new-row)))
       header-rows
       top-header-items))))

(defn- build-left-headers
  [left-header-items]
  (if (empty? left-header-items)
    []
    (let [max-depth        (apply max (map :depth left-header-items))
          span-by-position (reduce (fn [acc {:keys [depth offset span]}]
                                     (update acc depth
                                             (fnil #(max % (+ offset span)) 0)))
                                   {}
                                   left-header-items)
          result-height    (apply max (vals span-by-position))
          column-count     (inc max-depth)]
      ;; Fill in the header values
      (reduce
       (fn [grid {:keys [depth value span offset]}]
         ;; For each row this header spans, set the value at the correct depth
         (reduce (fn [g row-idx]
                   (assoc-in g [row-idx depth] value))
                 grid
                 (range offset (+ offset span))))
       ;; Start with an empty grid of appropriate dimensions
       (vec (repeat result-height (vec (repeat column-count nil))))
       left-header-items))))

(defn- build-full-pivot
  [get-row-section left-headers top-headers measure-count]
  (let [row-count (count left-headers)
        left-width (count (first left-headers))
        col-count (- (count (first top-headers)) left-width)
        result (perf/concat
                top-headers
                ;; For each row in left-headers...
                (for [row-idx (range (max row-count 1))]
                  (let [left-row (nth left-headers row-idx [])
                        ;; ...get cell values for this row
                        cell-values (mapcat (fn [col-idx]
                                              (let [values (get-row-section col-idx row-idx)]
                                                (map :value values)))
                                            (range (/ col-count measure-count)))]
                    ;; Combine left headers with cell values
                    (into left-row cell-values))))]
    (vec result)))

(defn build-pivot-output
  "Processes pivot data into the final pivot structure for exports. Calls into metabase.pivot.core, which is the
  postprocessing code shared with the FE pivot table implementation."
  [{:keys [data settings format-rows? pivot-export-options]} formatters]
  (let [columns                  (pivot/columns-without-pivot-group (:cols data))
        column-split             (:pivot_table.column_split settings)
        row-indexes              (:pivot-rows pivot-export-options)
        col-indexes              (:pivot-cols pivot-export-options)
        val-indexes              (:pivot-measures pivot-export-options)
        col-settings             (merge-column-settings columns settings)
        {:keys [row-formatters
                col-formatters
                val-formatters]} formatters
        {:keys [leftHeaderItems
                topHeaderItems
                getRowSection]}  (pivot/process-pivot-table data
                                                            row-indexes
                                                            col-indexes
                                                            val-indexes
                                                            columns
                                                            col-formatters
                                                            row-formatters
                                                            val-formatters
                                                            format-rows?
                                                            settings
                                                            col-settings)
        top-left-header          (map (fn [i] (pivot/display-name-for-col (nth columns i)
                                                                          (nth col-settings i)
                                                                          format-rows?))
                                      row-indexes)
        top-headers              (build-top-headers top-left-header topHeaderItems)
        left-headers             (build-left-headers leftHeaderItems)]
    (build-full-pivot getRowSection left-headers top-headers (count (:values column-split)))))
