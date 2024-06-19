(ns metabase.query-processor.pivot.postprocess
  "Post-process utils for pivot exports

  The shape returned by the pivot qp is not the same visually as what a pivot table looks like in the app.
  It's all of the same data, but some post-processing logic needs to run on the rows to be able to present them
  visually in the same way as in the app."
  (:require
   [clojure.math.combinatorics :as math.combo]
   [clojure.set :as set]
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

(defn- all-values-for
  "Get all possible values for pivot-col/row 'k'.
  `rows` are the raw pivot rows, `idx` is the column index to get values from.
  `include-nil?` controls whether an extra `nil` value is added to the returned values.
  This extra nil is needed for some combinations later on, but not others, hence the switch."
  [rows idx include-nil?]
  (let [all-vals (distinct (mapv #(get % idx) rows))]
    (concat (vec (remove nil? all-vals)) (when include-nil? [nil]))))

(mu/defn ^:private pivot-row-titles
  [{:keys [column-titles pivot-rows pivot-cols]} :- ::pivot-spec]
  (if (seq pivot-rows)
    (mapv #(get column-titles %) pivot-rows)
    [(get column-titles (first pivot-cols) "")]))

(mu/defn ^:private pivot-measure-titles
  [{:keys [column-titles pivot-measures]} :- ::pivot-spec]
  (mapv #(get column-titles %) pivot-measures))

(mu/defn ^:private header-builder
  "Construct the export-style pivot headers from the raw pivot rows, according to the indices specified in `pivot-spec`."
  [rows {:keys [pivot-cols pivot-measures] :as pivot-spec} :- ::pivot-spec]
  (let [row-titles                 (pivot-row-titles pivot-spec)
        measure-titles             (pivot-measure-titles pivot-spec)
        n-measures                 (count pivot-measures)
        multiple-measures?         (< 1 n-measures)
        include-row-totals-header? (seq pivot-cols)
        ;; For each pivot column, get the possible values for that column
        ;; Then, get the cartesian product of each for all of the value groups
        ;; Each group will have (count pivot-cols) entries and the values
        ;; will be from the columns in the same order as presented in pivot-cols.
        ;; So, if pivot-cols is [0 1], the first col-value-group will have [first-value-from-first-col first-value-from-second-col]
        col-value-groups           (apply math.combo/cartesian-product (concat
                                                                        (map (fn [col-k]
                                                                               (all-values-for rows col-k false))
                                                                             pivot-cols)
                                                                        (when (seq measure-titles)
                                                                          [measure-titles])))
        header-indices             (if (or multiple-measures? (not (seq pivot-cols)))
                                     ;; when there are more than 1 pivot-measures, we need to
                                     ;; add one more header row that holds the titles of the measure columns
                                     ;; and we know it's always just one more row, so we can inc the count.
                                     (range (inc (count pivot-cols)))
                                     (range (count pivot-cols)))]
    ;; Each Header (1 header row per pivot-col) will first start with the Pivot Row Titles. There will be (count pivot-rows) entries.
    ;; Then, Get all of the nth entries in the col-value-gropus for the nth header, and then append "Row Totals" label.
    (mapv
     (fn [col-idx]
       (vec (concat
             row-titles
             (map #(nth % col-idx) col-value-groups)
             (if (and
                  multiple-measures?
                  (seq pivot-cols)
                  (= col-idx (last header-indices)))
               measure-titles
               (when include-row-totals-header?
                 (repeat (max 1 n-measures) "Row totals"))))))
     header-indices)))

(mu/defn ^:private col-grouper
  "Map of raw pivot rows keyed by [pivot-cols]. Use it per row-group.
  This constructs a map where you can use a pivot-cols-value tuple to find the row-builder
  That is, suppose we have 2 pivot-cols, and valid values might be 'AA' and 'BA'. To get the
  raw pivot row where each of those values matches, you can run this function to get `m` and then
  use `(get m ['AA' 'BA'])` to get the row.

  This is used inside `row-grouper` on a subset of the total list of raw pivot rows."
  [rows {:keys [pivot-cols]} :- ::pivot-spec]
  (when (seq pivot-cols)
    (let [cols-groups (group-by (apply juxt (map (fn [k] #(get % k)) pivot-cols)) rows)]
      cols-groups)))

(mu/defn ^:private row-grouper
  "Map of raw pivot rows keyed by [pivot-rows]. The logic for how the map is initially constructed is the same
  as in `col-grouper`. Then, each map entry value (which is a subset of rows) is updated by running the `sub-rows-fn` on the subset.
  This sub-rows-fn does the following:
   - group the sub rows with `col-grouper`
   - create the list of all possible pivot column value combinations and manually concat the 'nils group' too
   - using the `cols-groups` map, get the `padded-sub-rows`
   - Now, since we only need the values in the `pivot-measures` indices, transform the sub-rows by getting just those indices
  Thus, the output of the `row-grouper` is a nested map allowing you to get a raw pivot row corresponding to any combination
  of pivot-row values and pivot-col values by doing something like this:

  `(get-in m [[row-idx1 row-idx2] [col-idx1 col-idx2]])`"
  [rows {:keys [pivot-rows pivot-cols pivot-measures] :as pivot-spec} :- ::pivot-spec]
  (let [rows-groups (if (seq pivot-rows)
                      (group-by (apply juxt (map (fn [k] #(get % k)) pivot-rows)) rows)
                      {[nil] rows})
        sub-rows-fn (fn [sub-rows]
                      (let [cols-groups     (col-grouper sub-rows pivot-spec)
                            padded-sub-rows (vec
                                             (mapcat
                                              ;; if the particular values combination is not found, we want to pad that with nil
                                              ;; so that subsequent cells are rendered in the correct place
                                              ;; in other words, each padded-sub-row must be the same length
                                              #(get cols-groups (vec %) [nil])
                                              ;; this is a list of all possible pivot col value combinations. eg. ['AA' 'BA']
                                              ;; concat the nils so that the [nil nil] combination shows up once, which is
                                              ;; necessary to include the row totals and grand totals
                                              (concat
                                               (apply math.combo/cartesian-product (map #(all-values-for rows % false) pivot-cols))
                                               [(vec (repeat (count pivot-cols) nil))])))]
                        (vec (mapcat (fn [row]
                                       (mapv #(get row %) pivot-measures))
                                     ;; cols-groups will be nil if there are no pivot columns
                                     ;; In such a case, we don't need to modify the rows with padding
                                     ;; we only need to grab the pivot-measures directly
                                     (if cols-groups
                                       padded-sub-rows
                                       (take 1 sub-rows))))))]
    (-> rows-groups
        (update-vals sub-rows-fn))))

(mu/defn ^:private totals-row-fn
  "Given a work in progress pivot export row (NOT a raw pivot row), add Totals labels if appropriate."
  [export-style-row {:keys [pivot-rows]} :- ::pivot-spec]
  (let [n-row-cols       (count pivot-rows)
        row-indices      (range n-row-cols)
        row-vals         (take n-row-cols export-style-row)
        totals-for-value (fn [idx v]
                           (if (and ((set row-indices) idx)
                                    (some? v))
                             (format "Totals for %s" v)
                             v))]
    (cond
      (every? nil? row-vals)
      (assoc export-style-row 0 "Grand Totals")

      (some nil? row-vals)
      (vec (map-indexed totals-for-value export-style-row))

      :else
      export-style-row)))

(defn pivot-grouping-key
  "Get the index into the raw pivot rows for the 'pivot-grouping' column."
  [column-titles]
  ;; a vector is kinda sorta a map of indices->values, so
  ;; we can use map-invert to create the map
  (get (set/map-invert (vec column-titles)) "pivot-grouping"))

(mu/defn ^:private pivot-measures
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
  (assoc pivot-spec :pivot-measures (pivot-measures pivot-spec)))

(mu/defn ^:private row-builder
  "Construct the export-style pivot rows from the raw pivot rows, according to the indices specified in `pivot-spec`.

  This function:
   - creates the row-groups map using `row-grouper`. This already has the nearly complete rows.
   - create the list of pivot row value combinations. We don't need the nils group this time; it would result in
     a doubling of the Grand totals row
     We DO want to generate tuples that can have 'nil' (eg. ['CA' nil]) so that Row totals rows will be grabbed from the map too.
   - construct each row by concatenating the row values, since they're the labels for each pivot-row. Handily, the `ks` are exactly
     these values, so we can just concat each k to its `row-groups` entry
   - Run the `totals-row-fn` to add the Row totals and Grand totals labels in the right spots."
  [rows {:keys [pivot-rows] :as pivot-spec} :- ::pivot-spec]
  (let [row-groups (row-grouper rows pivot-spec)
        ks         (if (seq pivot-rows)
                     (mapv vec (concat
                                (apply math.combo/cartesian-product (map #(all-values-for rows % true) pivot-rows))))
                     [[nil]])]
    (->> (map (fn [k] (vec (concat k (get row-groups k)))) ks)
         (filter #(< (count pivot-rows) (count %)))
         (map #(totals-row-fn % pivot-spec)))))

(defn- clean-row
  [row]
  (mapv #(if (= "" %)
           nil
           %)
        row))

(mu/defn pivot-builder
  "Create the rows for a pivot export from raw pivot rows `rows`."
  [rows pivot-spec :- ::pivot-spec]
  (let [rows       (mapv clean-row rows)
        pivot-spec (add-pivot-measures pivot-spec)]
    (vec (concat
          (header-builder rows pivot-spec)
          (row-builder rows pivot-spec)))))
