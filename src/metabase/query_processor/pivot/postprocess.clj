(ns metabase.query-processor.pivot.postprocess
  "Post-process utils for pivot exports

  The shape returned by the pivot qp is not the same visually as what a pivot table looks like in the app.
  It's all of the same data, but some post-processing logic needs to run on the rows to be able to present them
  visually in the same way as in the app."
  (:refer-clojure :exclude [run!])
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [flatland.ordered.map :as ordered-map]
   [flatland.ordered.set :as ordered-set]
   [metabase.query-processor.streaming.common :as common]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :as perf :refer [run!]])
  (:import
   (java.util ArrayList)))

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
  (let [{:keys [pivot-measures]} pivot-spec]
    {:config         pivot-spec
     :data           {}
     ;; A nested tree of ordered maps & sets, representing all combinations of row values in the data
     :row-paths      (ordered-map/ordered-map)
     ;; A nested tree of ordered maps & sets, representing all combinations of column values in the data
     :col-paths      (ordered-map/ordered-map)
     :measure-values (zipmap pivot-measures (repeat (sorted-set)))}))

(defn- add-to-path-tree
  "Assocs a list of values in a path tree, which should consist of a hierarchy of ordered-maps, with leaf values stored in
  ordered-sets."
  [tree ks]
  (let [step
        (fn step [tree [k & ks]]
          (if ks
            (let [next-map (or (get tree k) (ordered-map/ordered-map))]
              (assoc tree k (step next-map ks)))
            (let [leaf-set (if (set? tree) tree (ordered-set/ordered-set))]
              (conj leaf-set k))))]
    (step tree ks)))

(defn- measure->agg-fn
  "Aggregators for the column totals"
  [k]
  (case k

    (:sum :count :total)
    (fn [prev v]
      (if (number? v)
        (-> (merge {:result 0} prev)
            (update :result #(+ % v)))
        v))

    :avg
    (fn [prev v]
      (if (number? v)
        (-> (merge {:total 0
                    :count 0}
                   prev)
            (update :total #(+ % v))
            (update :count inc))
        v))

    :min
    (fn [prev v]
      (if (number? v)
        (update prev :min
                (fn [x] (if x
                          (min x v)
                          v)))
        v))

    :max
    (fn [prev v]
      (if (number? v)
        (update prev :max
                (fn [x] (if x
                          (max x v)
                          v)))
        v))

    ;; else
    (fn [_prev v] v)))

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
           (let [agg-fn-key (get agg-fns measure-key :total)
                 new-v      (get new-values measure-key)]
             [measure-key (if new-v
                            (let [agg-fn (measure->agg-fn agg-fn-key)]
                              (agg-fn agg new-v))
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
                                          #(update-aggregate (or % (zipmap pivot-measures (repeat {}))) measure-vals measures))
                               m))
        total-fn           (fn [m paths]
                             (reduce total-fn* m paths))]
    (-> pivot
        (update :row-count (fn [v] (if v (inc v) 0)))
        (update :data update-in (concat row-path col-path)
                #(update-aggregate (or % (zipmap pivot-measures (repeat {}))) measure-vals measures))
        (update :row-paths
                #(when (seq row-path) (add-to-path-tree % row-path)))
        (update :col-paths
                #(when (seq col-path) (add-to-path-tree % col-path)))
        (update :totals (fn [totals]
                          (-> totals
                              (total-fn [[:grand-total]
                                         row-path
                                         col-path
                                         [:section-totals (first row-path)]])
                              (total-fn (map (fn [part]
                                               ;; here, the `:rows-part` and `:cols-part` keys exist to
                                               ;; force paths into the :totals map to be unique.
                                               ;; without this, it is possible that a path is already written to
                                               ;; if a pivot-col value by chance happens to be the same number
                                               ;; of an idx into the row, such as a product ID of 4 matching
                                               ;; the pivot-measure idx of 4 if 2 pivot-rows and 1 pivot-col are configured.
                                               ;; Previously, in such a case, the measure map (the second deepest 'nesting')
                                               ;; can be erroneously accessed when later aggregating
                                               ;; to try illustrate, let's say that earlier, these 2 steps occurred:

                                               ;; `(assoc-in totals-map [:column-totals "RowA"] {4 {:result 1}})`
                                               ;; `(assoc-in totals-map [:column-totals "RowA" 3] {4 {:result 1}})`

                                               ;; the result will look like:
                                               ;; {:column-totals {"RowA" {4 {:result 1}
                                               ;;                          3 {4 {:result 1}}}}}

                                               ;; Now, you're attempting to (update-aggregate totals-map [:column-totals "RowA"])
                                               ;; but, you'll be operating on an unexpected map shape (the key 3 does not correspond to a measure)
                                               ;; This is why in issue #50207, when switching around the pivot-rows, things broke. It wasn't
                                               ;; the switching, but rather that the second pivot-row's values were IDs, thus the integer 4
                                               ;; was part of some totals paths, breaking aggregating in later steps.
                                               (concat [:column-totals :rows-part] part [:cols-part] col-path))
                                             (rest (reductions conj [] row-path))))))))))

(defn- fmt
  "Format a value using the provided formatter or identity function."
  [formatter v-map]
  (let [value (if (map? v-map)
                (or (:result v-map)
                    (when (contains? v-map :total)
                      (/ (double (:total v-map)) (:count v-map)))
                    (:min v-map)
                    (:max v-map)
                    (seq v-map))
                v-map)]
    (when value
      ((or formatter identity) (common/format-value value)))))

(defn- build-column-headers
  "Build multi-level column headers."
  [{:keys [pivot-cols pivot-measures column-titles row-totals?]} col-combos col-formatters]
  (perf/concat
   (if (= 1 (count pivot-measures))
     (mapv (fn [col-combo] (perf/mapv fmt col-formatters col-combo)) col-combos)
     (into [] (mapcat (fn [col-combo]
                        (let [formatted (perf/mapv fmt col-formatters col-combo)
                              it (.iterator ^Iterable pivot-measures)]
                          (loop [acc (transient [])]
                            (if (.hasNext it)
                              (recur (conj! acc (conj formatted (get column-titles (.next it)))))
                              (persistent! acc))))))
           col-combos))
   (when row-totals?
     (repeat (count pivot-measures)
             (perf/concat
              (when (and row-totals? (> (count pivot-cols) 0)) ["Row totals"])
              (repeat (dec (count pivot-cols)) nil)
              (when (and (seq pivot-cols) (> (count pivot-measures) 1)) [nil]))))))

(defn- build-headers
  "Combine row keys with column headers."
  [column-headers {:keys [pivot-cols pivot-rows column-titles]}]
  (some->> (not-empty (filterv seq column-headers))
           perf/transpose
           (mapv (fn [h]
                   (perf/concat
                    (perf/mapv #(get column-titles %)
                               (if (and (seq pivot-cols) (empty? pivot-rows))
                                 pivot-cols pivot-rows))
                    h)))))

(defn- build-row
  "Build a single row of the pivot table."
  [row-combo col-combos pivot-measures data totals row-totals? ordered-formatters row-formatters config]
  ;; This implementation is very unorthodox, but this function is incredibly hot, so it must avoid allocation at all
  ;; readability costs. Any iterator-based iteration allocates, but also constructing an internal mapping lambda that
  ;; encloses the outer value is so so expensive.
  (let [row-path       (vec row-combo)
        row-data       (get-in data row-path)
        n (count col-combos)
        m (count pivot-measures)
        result (ArrayList. (* (max 1 n) m))]
    (when-not (seq row-formatters)
      (dotimes [_ (count pivot-measures)] (.add result nil)))
    ;; We first add the pivot row values before the actual row values. It is intentional that we don't format pivot
    ;; row values just yet, because they will be used as data later on during grouping.
    (perf/run! #(.add result %) row-combo)
    (if (seq col-combos)
      (loop [i 0, j -1, col-combo nil, vals nil]
        ;; we need to lead with col-combo here so that each row will alternate between all of the measures, rather
        ;; than have all measures of one kind bunched together. That is, if you have a table with `count` and
        ;; `avg` the row must show count-val, avg-val, count-val, avg-val ... etc
        (if (= j -1)
          (when (< i n)
            (let [col-combo (nth col-combos i)]
              (recur i (inc j) col-combo (reduce get row-data col-combo))))
          (if (< j m)
            (let [measure-key (nth pivot-measures j)
                  formatter (get ordered-formatters measure-key)
                  formatted-val (fmt formatter (get vals measure-key))]
              (.add result formatted-val)
              (recur i (inc j) col-combo vals))
            (recur (inc i) -1 nil nil))))
      ;; If there are no columns, we still fill in one column per measure value
      (run! (fn [measure-key]
              (let [formatter (get ordered-formatters measure-key)]
                (.add result (fmt formatter (get row-data measure-key)))))
            pivot-measures))
    (when (and row-totals? (> (count (:pivot-cols config)) 0))
      (let [row-totals (get-in totals row-path)]
        (run! #(.add result (fmt (get ordered-formatters %) (get row-totals %)))
              pivot-measures)))
    result))

(defn- build-column-totals
  "Build column totals for a section."
  [section-path col-combos pivot-measures totals row-totals? ordered-formatters pivot-rows pivot-cols]
  (let [cols-part (get-in totals (concat [:column-totals :rows-part] section-path [:cols-part]))
        totals-row (ArrayList. (* (count col-combos) (count pivot-measures)))]
    (if (seq col-combos)
      (run! (fn [col-combo]
              (let [m (reduce get cols-part col-combo)]
                (run! (fn [measure-key]
                        (.add totals-row (fmt (get ordered-formatters measure-key) (get m measure-key))))
                      pivot-measures)))
            col-combos)
      ;; If there are no columns, we still fill in one column per measure value
      (run! (fn [measure-key]
              (.add totals-row (fmt (get ordered-formatters measure-key) (get cols-part measure-key))))
            pivot-measures))
    (perf/concat
     [(format "Totals for %s" (fmt (get ordered-formatters (first pivot-rows)) (last section-path)))]
     (repeat (dec (count pivot-rows)) nil)
     totals-row
     (when (and row-totals? (> (count pivot-cols) 0))
       (let [totals' (-> totals :section-totals (get-in section-path))]
         (mapv #(fmt (get ordered-formatters %) (get totals' %))
               pivot-measures))))))

(defn- build-grand-totals
  "Build grand totals row."
  [{:keys [pivot-cols pivot-rows pivot-measures]} col-combos totals row-totals? ordered-formatters]
  (perf/concat
   ["Grand totals"]
   (repeat (dec (count (if (and (seq pivot-cols) (not (seq pivot-rows)))
                         pivot-cols pivot-rows)))
           nil)
   (when (and row-totals? (> (count pivot-cols) 0))
     (into [] (mapcat (fn [col-combo]
                        (let [m (reduce get totals col-combo)]
                          (perf/mapv #(fmt (get ordered-formatters %) (get m %)) pivot-measures))))
           col-combos))
   (for [measure-key pivot-measures]
     (fmt (get ordered-formatters measure-key)
          (get-in totals [:grand-total measure-key])))))

(defn- append-totals-to-subsections
  [pivot section col-combos ordered-formatters]
  (let [{:keys [config
                totals]}      pivot
        {:keys [pivot-rows
                pivot-cols
                pivot-measures
                row-totals?]} config]
    (perf/concat
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
                                             ordered-formatters
                                             pivot-rows
                                             pivot-cols))
                 ;; inside a subsection, we know that the 'parent' subsection values will all be the same
                 ;; so we can just grab it from the first row
                 next-subsection-value (nth (first rows) (dec pivot-row-idx))]
             (conj (vec rows)
                   ;; assoc the next subsection's value into the row so it stays grouped in the next reduction
                   (if (<= (dec pivot-row-idx) 0)
                     total-row
                     (assoc total-row (dec pivot-row-idx) next-subsection-value)))))
         (group-by (fn [r] (nth r pivot-row-idx)) section)))
      section
      (reverse (range 1 (dec (count pivot-rows)))))
     [(vec (build-column-totals
            [(ffirst section)]
            col-combos
            pivot-measures
            totals
            row-totals?
            ordered-formatters
            pivot-rows
            pivot-cols))])))

(defn sort-path-tree
  "Takes a tree of row or column paths and returns a new tree with ordered-maps replaced as needed with sorted-maps, and
  ordered-sets replaced with sorted-sets, based on the provided `sort-orders` config. If no sort order is provided for
  a particular row or column, it is left as-is."
  [tree [first-index & indices] sort-orders]
  (let [sort-order (get sort-orders first-index)
        compare-fn (case sort-order
                     :ascending compare
                     :descending #(compare %2 %1)
                     nil)]
    (cond
      (associative? tree)
      (into (if compare-fn
              (sorted-map-by compare-fn)
              (ordered-map/ordered-map))
            (for [[k v] tree]
              [k (sort-path-tree v indices sort-orders)]))

      (set? tree)
      (if compare-fn
        (into (sorted-set-by compare-fn) tree)
        tree)

      :else tree)))

(defn enumerate-paths
  "Enumerate all paths from the root to a leaf in a tree structure composed of maps and sets."
  [m]
  (letfn [(enumerate [prefix m]
            (if-not (associative? m)
              (mapv #(conj prefix %) m)
              (into [] (mapcat (fn [[k v]]
                                 (enumerate (conj prefix k) v))
                               m))))]
    (enumerate [] m)))

(defn- format-pivot-row-cells
  "In the almost final row, the pivot row cells still contain unformatted values. We need to format them."
  [row row-formatters pivot-rows-cnt]
  (if (pos? pivot-rows-cnt)
    (let [first-entry (first row)]
      ;; Exclude rows that begin with "Totals ..."
      (if (and (string? first-entry) (str/starts-with? first-entry "Totals"))
        row
        ;; This manual iterator-loop goes over the whole row but applies the formatting only to first
        ;; `pivot-rows-cnt` values, and leaves the rest of the values unchanged (they are already formatted).
        (let [it (.iterator ^Iterable row)]
          (loop [res (transient []), i 0]
            (if (.hasNext it)
              (recur (conj! res (if (< i pivot-rows-cnt)
                                  (fmt (nth row-formatters i) (.next it))
                                  (.next it)))
                     (unchecked-inc i))
              (persistent! res))))))
    row))

(defn build-pivot-output
  "Arrange and format the aggregated `pivot` data."
  [pivot ordered-formatters]
  (let [{:keys [config
                data
                totals
                row-paths
                col-paths]} pivot
        {:keys [pivot-rows
                pivot-cols
                pivot-measures
                ;; `column` here refers to columns in the original data, which can be pivot rows *or* columns
                column-sort-order
                column-titles
                row-totals?
                col-totals?]}   config
        row-formatters          (mapv #(get ordered-formatters %) pivot-rows)
        col-formatters          (mapv #(get ordered-formatters %) pivot-cols)
        sorted-row-paths        (sort-path-tree row-paths pivot-rows column-sort-order)
        sorted-col-paths        (sort-path-tree col-paths pivot-rows column-sort-order)
        sorted-row-combos       (enumerate-paths sorted-row-paths)
        sorted-col-combos       (enumerate-paths sorted-col-paths)
        column-headers          (build-column-headers config sorted-col-combos col-formatters)
        headers                 (or (not-empty (build-headers column-headers config))
                                    [(mapv #(get column-titles %) (into (vec pivot-rows) pivot-measures))])]
    (perf/concat
     headers
     (transduce
      (remove empty?)
      into []
      (let [sections-rows
            (mapv (fn [section-row-combos]
                    (mapv (fn [row-combo]
                            (build-row row-combo sorted-col-combos pivot-measures data totals
                                       row-totals? ordered-formatters row-formatters config))
                          section-row-combos))
                  (partition-by first sorted-row-combos))
            pivot-rows-cnt (count pivot-rows)]
        (perf/mapv
         (fn [section-rows]
           (->>
            section-rows
            ;; section rows are either enriched with column-totals rows or left as is
            ((fn [rows]
               (if (and col-totals? (> (count pivot-rows) 1))
                 (append-totals-to-subsections pivot rows sorted-col-combos ordered-formatters)
                 rows)))
            ;; then, we apply the row-formatters to the pivot-rows portion of each row,
            ;; filtering out any rows that begin with "Totals ..."
            (mapv #(format-pivot-row-cells % row-formatters pivot-rows-cnt))))
         sections-rows)))
     (when col-totals?
       [(build-grand-totals config sorted-col-combos totals row-totals? ordered-formatters)]))))
