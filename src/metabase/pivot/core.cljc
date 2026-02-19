(ns metabase.pivot.core
  (:require
   [medley.core :as m]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.performance :as perf])
  (:import
   #?(:clj (java.text Collator))))

#?(:clj
   (set! *warn-on-reflection* true))

#?(:cljs
   (defn- json-parse
     "Parses a JSON string in Clojure or ClojureScript into  "
     [x]
     (js->clj (js/JSON.parse x))))

(defn- ensure-consistent-type
  "Convert Clojure value that may have ambiguous type into canonical type to ensure it can be used as a key.
  Does nothing in CLJS."
  [x]
  #?(:cljs x
     :clj (cond (integer? x) (int x) ;; Handles BigInteger
                (decimal? x) (double x) ;; Handles BigDecimal
                :else x)))

(defn- ensure-is-int
  "Convert a clojure value that may not be a type bitwise operations can use into one it can. Or throw an
  error if it is not losslessly convertible into an integer. "
  [x]
  #?(:cljs x
     :clj (cond
            (int? x) x
            (integer? x) (long x)
            (decimal? x) (try (.longValueExact ^BigDecimal x)
                              ;; catch this error since java.lang.ArithmeticException doesn't make sense
                              (catch java.lang.ArithmeticException e
                                (throw (ex-info "Non-Integer cannot be used as pivot-grouping column"
                                                {:data x}
                                                e))))
            :else (throw (ex-info "Non-Integer cannot be used as pivot-grouping column"
                                  {:data x})))))

(defn- pivot-group-column?
  "Is the given column the pivot-grouping column?"
  [col]
  (= (:name col) "pivot-grouping"))

(defn columns-without-pivot-group
  "Removes the pivot-grouping column from a list of columns, identifying it by name."
  [columns]
  (remove pivot-group-column? columns))

(def ^:private get-active-breakout-indexes
  "For a given pivot group value (k), returns the indexes of active breakouts.
  The pivot group value is a bitmask where each bit represents a breakout. If a
  bit is 0, the corresponding breakout is active for this group."
  (memoize
   (fn [pivot-group num-breakouts]
     (let [breakout-indexes (range num-breakouts)]
       (into [] (filter #(zero? (bit-and (bit-shift-left 1 %) (ensure-is-int pivot-group))) breakout-indexes))))))

(defn- remove-item-by-index
  "Remove an item with the given `index` from collection `v`."
  [coll index-to-remove]
  (reduce-kv (fn [acc i x]
               (if (<= i index-to-remove)
                 acc
                 (conj acc x)))
             (subvec coll 0 index-to-remove)
             coll))

(defn- process-grouped-rows
  "Processes rows for a specific pivot group value (k).
   Returns a tuple of [active-breakout-indexes, rows-with-pivot-column-removed]."
  [pivot-group rows pivot-group-index num-breakouts]
  (let [active-indexes (get-active-breakout-indexes pivot-group num-breakouts)
        processed-rows (mapv #(remove-item-by-index % pivot-group-index) rows)]
    [active-indexes processed-rows]))

(defn split-pivot-data
  "Pulls apart different aggregations that were packed into one result set returned from the QP.
  The pivot-grouping column indicates which breakouts were used to compute a given row. We used that column
  to split apart the data and convert field refs to indices"
  [data]
  (let [group-index   (u/index-of pivot-group-column? (:cols data))
        columns       (columns-without-pivot-group (:cols data))
        breakouts     (filter #(= (keyword (:source %)) :breakout) columns)
        num-breakouts (count breakouts)
        pivot-data    (->> (:rows data)
                           (group-by #(nth % group-index))
                           (m/map-kv #(process-grouped-rows %1 %2 group-index num-breakouts)))]
    {:pivot-data pivot-data
     :primary-rows-key (vec (range num-breakouts))
     :columns columns}))

(defn- get-subtotal-values
  "For each split of the pivot data returned by `split-pivot-data`, aside from
  the primary rows, returns a mapping from the column values in each row to the
  measure values."
  [pivot-data val-indexes primary-rows-key]
  (let [pivot-data-without-primary (dissoc pivot-data primary-rows-key)]
    (persistent!
     (reduce-kv
      (fn [result column-indexes rows]
        (let [processed-rows
              (persistent!
               (reduce
                (fn [acc row]
                  (let [grouping-key (perf/mapv #(ensure-consistent-type (nth row %)) column-indexes)
                        values (perf/mapv #(nth row %) val-indexes)]
                    (assoc! acc grouping-key values)))
                (transient {})
                rows))]
          (assoc! result column-indexes processed-rows)))
      (transient {})
      pivot-data-without-primary))))

#?(:cljs
   (defn- collapse-level
     "Marks all nodes at the given level as collapsed. 1 = root node; 2 = children
     of the root, etc."
     [tree level]
     (if (= level 0)
       (assoc tree :isCollapsed true)
       (update tree :children (fn [children]
                                (reduce #(perf/list-set! %1 %2 (collapse-level (perf/list-nth %1 %2) (dec level)))
                                        children
                                        (range (count children))))))))

#?(:cljs
   (defn- add-is-collapsed
     "Annotates a row tree with :isCollapsed values, based on the contents of
      collapsed-subtotals"
     [tree collapsed-subtotals]
     (let [parsed-collapsed-subtotals (map json-parse collapsed-subtotals)]
       (reduce
        (fn [tree collapsed-subtotal]
          (cond
            ;; A plain integer represents an entire level of the tree which is
            ;; collapsed (1-indexed)
            (int? collapsed-subtotal)
            (collapse-level tree collapsed-subtotal)

            ;; A seq represents a specific path in the tree which is collapsed
            (sequential? collapsed-subtotal)
            (loop [node tree, [c & r] collapsed-subtotal]
              (let [children (:children node)
                    idx (perf/map-get (:value->child-pos node) c)
                    child (perf/list-nth children idx)]
                (if r
                  (recur child r)
                  (do (perf/list-set! children idx (assoc child :isCollapsed true))
                      tree))))))
        tree
        parsed-collapsed-subtotals))))

#_{:clj-kondo/ignore [:missing-docstring]}
(defrecord TreeNode [value children value->child-pos isCollapsed])

(defn- add-path-to-tree
  "Adds a path of values to a row or column tree. The path is represented by the actual row and the list of indexes in
  that row. Each level of the tree is a TreeNode object that has a value list of children."
  [tree row indexes-path i]
  (if (< i (count indexes-path))
    ;; In `add-is-collapsed` we parse JSON from the viz settings to determine
    ;; the path of values to collapse. So we have to roundtrip values from the QP
    ;; to JSON and back to make sure their types match.
    (let [index (nth indexes-path i)
          v (ensure-consistent-type (nth row index))
          ;; value->child-pos is a mutable map for looking up the child position in the children list by child's value
          value->child-pos (:value->child-pos tree)
          children (:children tree)
          node (or (some->> (perf/map-get value->child-pos v) (perf/list-nth children))
                   (let [node (->TreeNode v (perf/make-list) (perf/make-map) false)]
                     (perf/map-put! value->child-pos v (count children))
                     (perf/list-add! children node)
                     node))]
      (add-path-to-tree node row indexes-path (inc i))
      tree)
    tree))

(defn- select-indexes
  "Given a row, returns a subset of its values according to the provided indexes."
  [row indexes]
  (mapv #(nth row %) indexes))

(defn- build-values-by-key
  "Creates a mapping from row and column indexes to the values, as well as
  metadata used for conditional formatting and drill-throughs."
  [rows cols row-indexes col-indexes val-indexes]
  (let [col-and-row-indexes (into (vec col-indexes) row-indexes)]
    (reduce
     (fn [acc row]
       (let [value-key  (perf/mapv ensure-consistent-type (select-indexes row col-and-row-indexes))
             values     (select-indexes row val-indexes)
             data       (into []
                              (map-indexed
                               (fn [index value]
                                 {:value value
                                  :colIdx index}))
                              row)
             dimensions (into []
                              (keep-indexed (fn [index value]
                                              (when (= (:source (nth cols index)) "breakout")
                                                {:value value
                                                 :colIdx index})))
                              row)
             col-names  (->> (select-indexes cols val-indexes)
                             (map :name)
                             (into []))]
         (assoc acc
                value-key
                {:values values
                 :valueColNames col-names
                 :data data
                 :dimensions dimensions})))
     {}
     rows)))

(defn- sort-orders-from-settings
  [col-settings indexes]
  (->> (map (into [] col-settings) indexes)
       (map :pivot_table.column_sort_order)))

#?(:clj (def ^:private collator (Collator/getInstance)))

(defn- compare-fn
  [sort-order]
  (let [locale-compare
        (fn [{a :value} {b :value}]
          (cond
            (= a b)
            0

            (string? a)
            #?(:clj (.compare ^Collator collator (str a) (str b))
               :cljs (.localeCompare (str a) (str b)))
            :else
            (compare a b)))]
    (case (keyword sort-order)
      :ascending  locale-compare
      :descending #(locale-compare %2 %1)
      nil)))

(defn- sort-tree
  "Sort each level of a tree as needed, based on the values in `sort-orders`."
  [tree sort-orders]
  (let [children (:children tree)
        value->child-pos (:value->child-pos tree)
        rest-orders (rest sort-orders)]
    (run! (fn [node] (sort-tree node rest-orders)) children)
    (when-let [curr-compare-fn (compare-fn (first sort-orders))]
      #?(:clj (.sort ^java.util.ArrayList children curr-compare-fn)
         :cljs (.sort children curr-compare-fn))
      ;; Don't forget to recreate value->child-pos because we messed child order.
      #?(:clj (.clear ^java.util.HashMap value->child-pos)
         :cljs (.clear value->child-pos))
      (doseq [i (range (count children))]
        (perf/map-put! value->child-pos (:value (perf/list-nth children i)) i)))
    tree))

;; TODO: can we move this to the COLLAPSED_ROW_SETTING itself?
#?(:cljs
   (defn- filter-collapsed-subtotals
     [row-indexes settings col-settings]
     (let [all-collapsed-subtotals (-> settings :pivot_table.collapsed_rows :value)
           pivot-row-settings (map #(nth col-settings %) row-indexes)
           column-is-collapsible? (map #(not= false (:pivot_table.column_show_totals %)) pivot-row-settings)]
       ;; A path can't be collapsed if subtotals are turned off for that column
       (filter (fn [path-or-length]
                 (let [path-or-length (json-parse path-or-length)
                       length (if (sequential? path-or-length)
                                (count path-or-length)
                                path-or-length)]
                   (nth column-is-collapsible? (dec length) false)))
               all-collapsed-subtotals))))

(defn build-pivot-trees
  "Constructs the pivot table's tree structures for rows and columns.

  Takes raw pivot data and generates hierarchical tree structures for both rows
  and columns, along with a lookup map for cell values."
  #_{:clj-kondo/ignore [:unused-binding]}
  [rows cols row-indexes col-indexes val-indexes settings col-settings]
  (let [row-tree (->TreeNode nil (perf/make-list) (perf/make-map) false)
        col-tree (->TreeNode nil (perf/make-list) (perf/make-map) false)
        _ (run! (fn [row]
                  (add-path-to-tree row-tree row row-indexes 0)
                  (add-path-to-tree col-tree row col-indexes 0))
                rows)
        ;; Only collapse row tree on the FE (in CLJS); keep it uncollapsed for exports (in CLJ)
        collapsed-row-tree #?(:cljs (add-is-collapsed
                                     row-tree
                                     (filter-collapsed-subtotals row-indexes settings col-settings))
                              :clj row-tree)
        row-sort-orders (sort-orders-from-settings col-settings row-indexes)
        col-sort-orders (sort-orders-from-settings col-settings col-indexes)
        sorted-row-tree (sort-tree collapsed-row-tree row-sort-orders)
        sorted-col-tree (sort-tree col-tree col-sort-orders)
        values-by-key   (build-values-by-key rows cols row-indexes col-indexes val-indexes)]
    {:row-tree (:children sorted-row-tree)
     :col-tree (:children sorted-col-tree)
     :values-by-key values-by-key}))

(defn- format-values-in-tree
  "Walks a tree, formatting values and annotating each value with its color for
  conditional formatting, as well as data that powers drill-throughs on the
  FE."
  [tree formatters cols col-indexes]
  (let [formatter (first formatters)
        col-idx   (first col-indexes)]
    (mapv
     (fn [{:keys [value children] :as node}]
       (assoc node
              :value #?(:clj (formatter value)
                        ;; if we're in clojurescript these formatting functions are JS-based which means
                        ;; they cannot handle clojure data types so we need to convert collections into js
                        ;; types. We do it only for collections so as not to convert unnecessarily
                        :cljs (formatter (cond-> value (coll? value) perf/clj->js)))
              :children (format-values-in-tree children (rest formatters) (rest cols) (rest col-indexes))
              :rawValue value
              :clicked {:value value
                        :colIdx col-idx}))
     tree)))

(defn- should-show-row-totals?
  [settings]
  (get settings :pivot.show_row_totals true))

(defn- should-show-column-totals?
  [settings]
  (get settings :pivot.show_column_totals true))

(defn- maybe-add-row-totals-column
  "If needed, adds a column header to the end of the column tree for the column containing row totals"
  [col-tree settings]
  (if (and (> (count col-tree) 1)
           (should-show-row-totals? settings))
    (conj
     col-tree
     {:value (i18n/tru "Row totals")
      :children []
      :isSubtotal true
      :isGrandTotal true})
    col-tree))

(defn- maybe-add-grand-totals-row
  "If needed, adds a row header to the end of the row tree for the row containing the grand total at the bottom-right of the table."
  [row-tree settings]
  (if (should-show-column-totals? settings)
    (conj
     row-tree
     {:value (i18n/tru "Grand totals")
      :children []
      :isSubtotal true
      :isGrandTotal true})
    row-tree))

(defn- create-subtotal-node
  "Creates a subtotal node for the given row item."
  [row-item]
  (let [subtotal-val (or (get-in row-item [:value :xlsx-formatted-value])
                         (:value row-item))]
    {:value (i18n/tru "Totals for {0}" subtotal-val)
     :rawValue (:rawValue row-item)
     :span 1
     :isSubtotal true
     :children []}))

(defn- subtotal-permitted?
  "Returns true if subtotals are enabled for this column and visible for this row."
  [subtotal-enabled-for-col? visible?]
  (and subtotal-enabled-for-col? visible?))

(defn- subtotal-visible?
  "Determines whether a subtotal should be shown for a given row."
  [row-item settings]
  (let [condense? (true? (:pivot.condense_duplicate_totals settings true))
        child-count (count (:children row-item))]
    (or (> child-count 1)
        (not condense?)
        (:isCollapsed row-item))))

(declare add-subtotal)

(defn- process-children
  "Recursively processes children nodes to add subtotals."
  [children remaining-col-settings settings]
  (persistent!
   (reduce (fn [acc child]
             (if (seq (:children child))
               (add-subtotal child
                             remaining-col-settings
                             (subtotal-visible? child settings)
                             acc
                             settings)
               (conj! acc child)))
           (transient [])
           children)))

(defn- add-subtotal
  "Adds subtotal nodes to a row item based on subtotal settings.
   Returns a sequence of nodes (the original node and possibly a subtotal node)."
  [row-item subtotal-settings-by-col visible? transient-row settings]
  (let [subtotal-enabled-for-col? (first subtotal-settings-by-col)
        remaining-col-settings    (rest subtotal-settings-by-col)
        subtotal-node             (when (subtotal-permitted? subtotal-enabled-for-col? visible?)
                                    (create-subtotal-node row-item))
        is-collapsed?             (:isCollapsed row-item)]
    (if is-collapsed?
      ;; For collapsed items, just add subtotals if applicable
      (conj! transient-row subtotal-node)
      ;; For expanded items, recurse.
      (let [processed-children (process-children (:children row-item)
                                                 remaining-col-settings
                                                 settings)
            updated-node       (-> row-item
                                   (assoc :children processed-children)
                                   (assoc :hasSubtotal (boolean subtotal-node)))]
        (cond-> (conj! transient-row updated-node)
          subtotal-node (conj! subtotal-node))))))

(defn- add-subtotals
  "Adds subtotal rows to the pivot table based on settings."
  [row-tree row-indexes settings col-settings]
  (if-not (should-show-column-totals? settings)
    (vec row-tree)
    (let [subtotal-settings-by-col (map (fn [idx]
                                          (not= ((nth col-settings idx) :pivot_table.column_show_totals)
                                                false))
                                        row-indexes)]
      (persistent!
       (reduce (fn [acc row-item]
                 (add-subtotal row-item
                               subtotal-settings-by-col
                               (subtotal-visible? row-item settings)
                               acc
                               settings))
               (transient [])
               row-tree)))))

(defn display-name-for-col
  "Translated from frontend/src/metabase/lib/formatting/column.ts"
  [column col-settings format-values?]
  (or (if format-values?
        (or
         (:column_title col-settings)
         (::mb.viz/column-title col-settings)
         (:display_name (:remapped_to_column column))
         (:display_name column))
        (:display_name column))
      (i18n/tru "(empty)")))

(defn- update-node
  [node leaf-nodes]
  (let [new-children (if (empty? (:children node))
                       leaf-nodes
                       (map #(update-node % leaf-nodes) (:children node)))]
    (merge node {:children new-children})))

(defn add-value-column-nodes
  "This might add value column(s) to the bottom of the top header tree. We
  display the value column names if there are multiple or if there are no
  columns pivoted to the top header."
  [col-tree cols col-indexes col-settings format-rows?]
  (let [val-cols (map (fn [idx] [(nth cols idx) (nth col-settings idx)]) col-indexes)
        leaf-nodes (map (fn [[col col-settings]] {:value (display-name-for-col col col-settings format-rows?)
                                                  :children []
                                                  :isValueColumn true})
                        val-cols)]
    (cond
      (empty? col-tree) leaf-nodes
      (<= (count val-cols) 1) col-tree
      :else (map #(update-node % leaf-nodes) col-tree))))

(defn- enumerate-paths
  "Given a node of a row or column tree, generates all paths to leaf nodes."
  ([node transient-acc]
   (enumerate-paths node transient-acc []))
  ([{:keys [rawValue isGrandTotal children isValueColumn]} transient-acc path]
   (let [path (or path [])]
     (cond
       isGrandTotal (conj! transient-acc [])
       isValueColumn (conj! transient-acc path)
       (empty? children) (conj! transient-acc (conj path rawValue))
       :else (reduce (fn [acc child]
                       (enumerate-paths child acc (conj path rawValue)))
                     transient-acc children)))))

(defn- format-values
  [values value-formatters]
  (if values
    (map (fn [value formatter] {:value (formatter value)}) values value-formatters)
    (repeat (count value-formatters) {:value nil})))

(defn- sort-by-indexed
  "Variant of `sort-by` which sorts the items in `coll` based on a `key-fn`
  which takes the arguments `idx` (the index of `val` in `coll`) and `val`
  itself."
  [key-fn coll]
  (->> coll
       (map-indexed vector)
       (sort-by (fn [[idx val]] (key-fn val idx)))
       (map second)))

(defn- format-subtotal-values
  "Formats subtotal values and adds additional attributes."
  [raw-values value-formatters other-attrs]
  (map #(merge % {:isSubtotal true} other-attrs)
       (format-values raw-values value-formatters)))

(defn- get-subtotals
  "Returns formatted subtotal values for a position in the pivot table.
   Handles both regular subtotals and grand totals."
  [subtotal-values breakout-indexes values other-attrs value-formatters]
  (let [breakout-key (vec (sort-by-indexed (fn [_ index] (nth breakout-indexes index)) breakout-indexes))
        value-key (vec (sort-by-indexed (fn [_ index] (nth breakout-indexes index)) values))
        raw-values (get-in subtotal-values [breakout-key value-key])]
    (format-subtotal-values raw-values value-formatters other-attrs)))

(defn- get-grand-total
  "Special case handler for grand total cells."
  [subtotal-values indexes index-values value-formatters]
  (get-subtotals subtotal-values indexes index-values {:isGrandTotal true} value-formatters))

(defn- get-regular-subtotal
  "Handler for regular subtotal cells (not grand totals)."
  [subtotal-values indexes index-values value-formatters]
  (get-subtotals subtotal-values indexes index-values {} value-formatters))

(defn- get-normal-cell-values
  "Processes and formats values for normal data cells (non-subtotal)."
  [values-by-key index-values value-formatters color-getter]
  (let [{:keys [values valueColNames data dimensions]} (get values-by-key index-values)
        formatted-values (format-values values value-formatters)]
    (if-not data
      formatted-values
      (map-indexed
       (fn [index value]
         (assoc value
                :clicked {:data       data
                          :dimensions dimensions}
                :backgroundColor (color-getter
                                  (nth values index)
                                  index
                                  (nth valueColNames index))))
       formatted-values))))

(defn- is-subtotal?
  "Determines if a cell is a subtotal based on its position."
  [row-values col-values row-indexes col-indexes]
  (or (< (count row-values) (count row-indexes))
      (< (count col-values) (count col-indexes))))

(defn- handle-subtotal-cell
  "Processes subtotal cells, including grand totals."
  [subtotal-values row-values col-values row-indexes col-indexes value-formatters]
  (let [row-idxs (take (count row-values) row-indexes)
        col-idxs (take (count col-values) col-indexes)
        indexes (concat col-idxs row-idxs)
        index-values (concat col-values row-values)]
    (if (zero? (count row-values))
      (get-grand-total subtotal-values indexes index-values value-formatters)
      (get-regular-subtotal subtotal-values indexes index-values value-formatters))))

(defn- create-row-section-getter
  "Returns a memoized function that retrieves and formats values for a specific cell
  position in the pivot table."
  [values-by-key subtotal-values value-formatters col-indexes row-indexes col-paths row-paths color-getter]
  (fn [col-index row-index]
    (let [col-values (nth col-paths col-index [])
          row-values (nth row-paths row-index [])
          index-values (concat col-values row-values)
          result (if (is-subtotal? row-values col-values row-indexes col-indexes)
                   (handle-subtotal-cell subtotal-values row-values col-values row-indexes col-indexes value-formatters)
                   (get-normal-cell-values values-by-key index-values value-formatters color-getter))]
      ;; Convert to JavaScript object if in ClojureScript context
      #?(:cljs (perf/clj->js result)
         :clj result))))

#_{:clj-kondo/ignore [:missing-docstring]}
(defrecord ResultItem [value rawValue clicked isCollapsed hasSubtotal isGrandTotal isSubtotal isValueColumn depth offset
                       hasChildren path span maxDepthBelow])

(defn- tree-to-array
  "Flattens a hierarchical tree structure into an array of nodes with positioning information.
   Each node in the result contains:
   - Original node properties (except :children)
   - :depth - How deep the node is in the tree
   - :offset - Horizontal position in the flattened representation
   - :span - How many leaf nodes this node spans
   - :hasChildren - Whether this node has any children
   - :path - The path of rawValues from root to this node
   - :maxDepthBelow - Maximum depth of the subtree below this node

   Note - some keywords are camelCase to match expected object keys in TypeScript."
  [tree]
  (let [result (volatile! (transient []))]
    (letfn [(process-tree [nodes depth offset path]
              (if (empty? nodes)
                {:span 1 :max-depth 0}
                (loop [i 0
                       total-span 0
                       max-depth 0
                       current-offset offset]
                  (if (>= i (count nodes))
                    {:span total-span :max-depth (inc max-depth)}
                    (let [{:keys [children rawValue isCollapsed isGrandTotal isSubtotal isValueColumn] :as node} (nth nodes i)
                          path-with-value (if (or isValueColumn isGrandTotal) nil (conj path rawValue))
                          item-index      (count @result)
                          _               (vswap! result conj! nil) ;; Placeholder for parent item to be filled in
                                                                    ;; once children are processed.
                          result-value    (process-tree children (inc depth) current-offset path-with-value)
                          item            (->ResultItem (:value node) rawValue (:clicked node) isCollapsed
                                                        (:hasSubtotal node) isGrandTotal isSubtotal isValueColumn
                                                        depth current-offset (boolean (seq children)) path-with-value
                                                        (:span result-value) (:max-depth result-value))]
                      (vswap! result assoc! item-index item)
                      (recur (inc i)
                             (long (+ total-span (:span result-value)))
                             (long (max max-depth (:max-depth result-value)))
                             (+ current-offset (:span result-value))))))))]
      (process-tree tree 0 0 [])
      (persistent! @result))))

(defn- compute-row-paths [columns row-indexes row-tree left-formatters settings col-settings]
  (let [left-index-columns (select-indexes columns row-indexes)
        formatted-row-tree-without-subtotals (format-values-in-tree row-tree left-formatters left-index-columns row-indexes)
        formatted-row-tree (add-subtotals formatted-row-tree-without-subtotals row-indexes settings col-settings)
        formatted-row-tree-with-totals (if (> (count formatted-row-tree-without-subtotals) 1)
                                         (maybe-add-grand-totals-row formatted-row-tree settings)
                                         formatted-row-tree)]
    {:formatted-row-tree-with-totals formatted-row-tree-with-totals
     :row-paths (or (not-empty (persistent! (reduce (fn [acc node]
                                                      (enumerate-paths node acc))
                                                    (transient []) formatted-row-tree-with-totals)))
                    [[]])}))

(defn- compute-col-paths [columns col-indexes col-tree top-formatters settings]
  (let [top-index-columns (select-indexes columns col-indexes)
        formatted-col-tree-without-values (into [] (format-values-in-tree col-tree top-formatters top-index-columns col-indexes))
        formatted-col-tree-with-totals (maybe-add-row-totals-column formatted-col-tree-without-values settings)]
    {:formatted-col-tree-with-totals formatted-col-tree-with-totals
     :col-paths (or (not-empty (persistent! (reduce (fn [acc node]
                                                      (enumerate-paths node acc))
                                                    (transient []) formatted-col-tree-with-totals)))
                    [[]])}))

(defn process-pivot-table
  "Formats rows, columns, and measure values in a pivot table according to
  provided formatters."
  ([data row-indexes col-indexes val-indexes columns top-formatters left-formatters value-formatters format-rows? settings col-settings]
   (process-pivot-table data row-indexes col-indexes val-indexes columns top-formatters left-formatters value-formatters format-rows? settings col-settings (constantly (constantly nil))))
  ([data row-indexes col-indexes val-indexes columns top-formatters left-formatters value-formatters format-rows? settings col-settings make-color-getter]
   (let [{:keys [pivot-data primary-rows-key]} (split-pivot-data data)
         primary-rows (get pivot-data primary-rows-key)
         color-getter #?(:cljs (make-color-getter (clj->js primary-rows))
                         :clj (make-color-getter))
         columns (vec columns)
         {:keys [row-tree col-tree values-by-key]}
         (build-pivot-trees primary-rows columns row-indexes col-indexes val-indexes settings col-settings)

         {:keys [row-paths formatted-row-tree-with-totals]}
         (compute-row-paths columns row-indexes row-tree left-formatters settings col-settings)

         {:keys [col-paths formatted-col-tree-with-totals]}
         (compute-col-paths columns col-indexes col-tree top-formatters settings)

         formatted-col-tree (into [] (add-value-column-nodes formatted-col-tree-with-totals columns val-indexes col-settings format-rows?))
         subtotal-values (get-subtotal-values pivot-data val-indexes primary-rows-key)]
     {:columnIndex col-paths
      :rowIndex row-paths
      :leftHeaderItems (tree-to-array formatted-row-tree-with-totals)
      :topHeaderItems (tree-to-array formatted-col-tree)
      :getRowSection (create-row-section-getter values-by-key subtotal-values value-formatters col-indexes row-indexes col-paths row-paths color-getter)})))
