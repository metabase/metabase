(ns metabase.pivot.core
  (:require
   #?(:clj [metabase.util.json :as json])
   [flatland.ordered.map :as ordered-map]
   [medley.core :as m]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n])
  (:import
   #?(:clj (java.text Collator))))

#?(:clj
   (set! *warn-on-reflection* true))

(defn- json-parse
  "Parses a JSON string in Clojure or ClojureScript"
  [x]
  #?(:cljs (js->clj (js/JSON.parse x))
     :clj (json/decode x)))

(defn- is-pivot-group-column
  "Is the given column the pivot-grouping column?"
  [col]
  (= (:name col) "pivot-grouping"))

(defn columns-without-pivot-group
  "Removes the pivot-grouping column from a list of columns, identifying it by name."
  [columns]
  (filter #(not (is-pivot-group-column %)) columns))

(defn- get-active-breakout-indexes
  "For a given pivot group value (k), returns the indexes of active breakouts.
  The pivot group value is a bitmask where each bit represents a breakout. If a
  bit is 0, the corresponding breakout is active for this group."
  [pivot-group num-breakouts]
  (let [breakout-indexes (range num-breakouts)]
    (into [] (filter #(zero? (bit-and (bit-shift-left 1 %) pivot-group)) breakout-indexes))))

(defn- remove-pivot-group-column-from-row
  "Removes the pivot group column value from a row."
  [row pivot-group-index]
  (vec (m/remove-nth pivot-group-index row)))

(defn- process-grouped-rows
  "Processes rows for a specific pivot group value (k).
   Returns a tuple of [active-breakout-indexes, rows-with-pivot-column-removed]."
  [pivot-gruop rows pivot-group-index num-breakouts]
  (let [active-indexes (get-active-breakout-indexes pivot-gruop num-breakouts)
        processed-rows (map #(remove-pivot-group-column-from-row % pivot-group-index) rows)]
    [active-indexes processed-rows]))

(defn split-pivot-data
  "Pulls apart different aggregations that were packed into one result set returned from the QP.
  The pivot-grouping column indicates which breakouts were used to compute a given row. We used that column
  to split apart the data and convert field refs to indices"
  [data]
  (let [group-index   (u/index-of is-pivot-group-column (:cols data))
        columns       (columns-without-pivot-group (:cols data))
        breakouts     (filter #(= (keyword (:source %)) :breakout) columns)
        num-breakouts (count breakouts)
        pivot-data    (->> (:rows data)
                           (group-by #(nth % group-index))
                           (m/map-kv #(process-grouped-rows %1 %2 group-index num-breakouts)))]
    {:pivot-data pivot-data
     :primary-rows-key (into [] (range num-breakouts))
     :columns columns}))

;; TODO: This can omit the primary rows from the result as a small optimization
(defn- get-subtotal-values
  "For each split of the pivot data returned by `split-pivot-data`, returns a maping from the column values in each row to the measure values."
  [pivot-data val-indexes]
  (m/map-kv-vals
   (fn [column-indexes rows]
     (reduce
      (fn [acc row]
        (let [grouping-key (map #(nth row %) column-indexes)]
          (assoc acc
                 grouping-key
                 (map #(nth row %) val-indexes))))
      {}
      rows))
   pivot-data))

(defn- collapse-level
  "Marks all nodes at the given level as collapsed. 1 = root node; 2 = children
  of the root, etc."
  [tree level]
  (m/map-vals
   (if (= level 1)
     #(assoc % :isCollapsed true)
     #(update % :children (fn [subtree] (collapse-level subtree (dec level)))))
   tree))

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
         (let [key-path (conj (into [] (interpose :children collapsed-subtotal))
                              :isCollapsed)]
           (assoc-in tree key-path true))))
     tree
     parsed-collapsed-subtotals)))

(defn- add-path-to-tree
  "Adds a path of values to a row or column tree. Each level of the tree is an
  ordered map with values as keys, each associated with a sub-map like
  {:children (ordered-map/ordered-map)}."
  [path tree]
  (if (seq path)
    (let [v       (first path)
          subtree (or (get-in tree [v :children]) (ordered-map/ordered-map))]
      (-> tree
          (assoc-in [v :children] (add-path-to-tree (rest path) subtree))
          (assoc-in [v :isCollapsed] false)))
    tree))

(defn- select-indexes
  "Given a row, returns a subset of its values according to the provided indexes."
  [row indexes]
  (map #(nth row %) indexes))

(defn build-values-by-key
  "Replicate valuesByKey construction"
  [rows cols row-indexes col-indexes val-indexes]
  (let [col-and-row-indexes (concat col-indexes row-indexes)]
    (reduce
     (fn [acc row]
       (let [value-key  (select-indexes row col-and-row-indexes)
             values     (select-indexes row val-indexes)
             ;; @tsp - this now assumes that cols is indexed the same as the row
             data       (map-indexed
                         (fn [index value]
                           {:value value
                            :col (nth cols index)})
                         row)
             ;; @tsp TODO? this could use the `data` above
             dimensions (->> row
                             (map-indexed (fn [index value]
                                            {:value value
                                             :column (nth cols index)}))
                             (filter (fn [{column :column}] (= (column :source) "breakout"))))
             value-columns (select-indexes cols val-indexes)]
         (assoc acc
                value-key
                {:values values
                 :valueColumns value-columns
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
        (fn [a b]
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
  "Converts each level of a tree to a sorted map as needed, based on the values
  in `sort-orders`."
  [tree sort-orders]
  (let [curr-compare-fn (compare-fn (first sort-orders))]
    (into
     (if curr-compare-fn
       (sorted-map-by curr-compare-fn)
       (ordered-map/ordered-map))
     (for [[k v] tree]
       [k (assoc v :children (sort-tree (:children v) (rest sort-orders)))]))))

;; TODO: can we move this to the COLLAPSED_ROW_SETTING itself?
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
            all-collapsed-subtotals)))

(defn- postprocess-tree
  "Converts a tree of sorted maps to a tree of vectors. This allows the tree to
  make a round trip to JavaScript and back to CLJS in `process-pivot-table`
  without losing ordering information."
  [tree]
  (vec
   (for [[value tree-node] tree]
     (assoc tree-node
            :value value
            :children (postprocess-tree (:children tree-node))))))

(defn- get-rows-from-pivot-data
  [pivot-data row-indexes col-indexes]
  (let [primary-rows-key (range (+ (count row-indexes)
                                   (count col-indexes)))]

    (get pivot-data primary-rows-key)))

(defn build-pivot-trees
  "Constructs the pivot table's tree structures for rows and columns.

  Takes raw pivot data and generates hierarchical tree structures for both rows
  and columns, along with a lookup map for cell values."
  [pivot-data cols row-indexes col-indexes val-indexes settings col-settings]
  (let [collapsed-subtotals (filter-collapsed-subtotals row-indexes settings col-settings)
        rows (get-rows-from-pivot-data pivot-data row-indexes col-indexes)
        {:keys [row-tree col-tree]}
        (reduce
         (fn [{:keys [row-tree col-tree]} row]
           (let [row-path (select-indexes row row-indexes)
                 col-path (select-indexes row col-indexes)]
             {:row-tree (add-path-to-tree row-path row-tree)
              :col-tree (add-path-to-tree col-path col-tree)}))
         {:row-tree (ordered-map/ordered-map)
          :col-tree (ordered-map/ordered-map)}
         rows)
        collapsed-row-tree (add-is-collapsed row-tree collapsed-subtotals)
        row-sort-orders (sort-orders-from-settings col-settings row-indexes)
        col-sort-orders (sort-orders-from-settings col-settings col-indexes)
        sorted-row-tree (sort-tree collapsed-row-tree row-sort-orders)
        sorted-col-tree (sort-tree col-tree col-sort-orders)
        values-by-key   (build-values-by-key rows cols row-indexes col-indexes val-indexes)]
    {:row-tree (postprocess-tree sorted-row-tree)
     :col-tree (postprocess-tree sorted-col-tree)
     :values-by-key values-by-key}))

(defn- format-values-in-tree
  [tree formatters cols]
  (let [formatter (first formatters)
        col       (first cols)]
    (map
     (fn [{:keys [value children] :as node}]
       (assoc node
              :value (formatter value)
              :children (format-values-in-tree children (rest formatters) (rest cols))
              :rawValue value
              :clicked {:value value
                        :column col
                        :data [{:value value
                                :col col}]}))
     tree)))

(defn- should-show-row-totals?
  [settings]
  (get settings :pivot.show_row_totals true))

(defn- should-show-column-totals?
  [settings]
  (get settings :pivot.show_column_totals true))

(defn- maybe-add-row-totals-column
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
  {:value (i18n/tru "Totals for {0}" (:value row-item))
   :rawValue (:rawValue row-item)
   :span 1
   :isSubtotal true
   :children []})

(defn- should-create-subtotal?
  "Determines if a subtotal should be created based on settings and row structure."
  [is-subtotal-enabled should-show-subtotal]
  (and is-subtotal-enabled should-show-subtotal))

(declare add-subtotal)

(defn- process-children
  "Recursively processes children nodes to add subtotals."
  [children rest-subtotal-settings should-show-fn]
  (mapcat (fn [child]
            (if (not-empty (:children child))
              (add-subtotal child
                            rest-subtotal-settings
                            (should-show-fn child))
              [child]))
          children))

(defn- add-subtotal
  "Adds subtotal nodes to a row item based on subtotal settings.
   Returns a sequence of nodes (the original node and possibly a subtotal node)."
  [row-item subtotal-settings-by-col should-show-subtotal]
  (let [current-col-setting    (first subtotal-settings-by-col)
        remaining-col-settings (rest subtotal-settings-by-col)
        subtotal-enabled?      (should-create-subtotal? current-col-setting should-show-subtotal)
        subtotal-nodes         (if subtotal-enabled?
                                 [(create-subtotal-node row-item)]
                                 [])]
    (if (:isCollapsed row-item)
      ;; For collapsed items, just return subtotal if applicable
      subtotal-nodes
      ;; For expanded items, process children recursively
      (let [should-show-fn     (fn [child]
                                 (or (> (count (:children child)) 1)
                                     (:isCollapsed child)))
            processed-children (process-children (:children row-item)
                                                 remaining-col-settings
                                                 should-show-fn)
            updated-node       (merge row-item
                                      {:hasSubtotal subtotal-enabled?
                                       :children processed-children})]
        (if (not-empty subtotal-nodes)
          [updated-node (first subtotal-nodes)]
          [updated-node])))))

(defn- add-subtotals
  "Adds subtotal rows to the pivot table based on settings.
   Returns the tree with subtotals added where appropriate."
  [row-tree row-indexes settings col-settings]
  (if-not (should-show-column-totals? settings)
    row-tree
    (let [subtotal-settings-by-col (map (fn [idx]
                                          (not= ((nth col-settings idx) :pivot_table.column_show_totals)
                                                false))
                                        row-indexes)
          has-multiple-children    (some #(> (count (:children %)) 1) row-tree)
          should-show-root-total   (fn [row-item]
                                     (or has-multiple-children
                                         (> (count (:children row-item)) 1)))]
      (mapcat (fn [row-item]
                (add-subtotal row-item
                              subtotal-settings-by-col
                              (should-show-root-total row-item)))
              row-tree))))

(defn display-name-for-col
  "@tsp - ripped from frontend/src/metabase/lib/formatting/column.ts"
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

(defn- maybe-add-empty-path [paths]
  (if (empty? paths)
    [[]]
    paths))

(defn- enumerate-paths
  "Given a node of a row or column tree, generates all paths to leaf nodes."
  [{:keys [rawValue isGrandTotal children isValueColumn]} & [path]]
  (let [path (or path [])]
    (cond
      isGrandTotal [[]]
      isValueColumn [path]
      (empty? children) [(conj path rawValue)]
      :else (mapcat #(enumerate-paths % (conj path rawValue)) children))))

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
  (let [{:keys [values valueColumns data dimensions]} (get values-by-key index-values)
        formatted-values (format-values values value-formatters)]
    (if-not data
      formatted-values
      (map-indexed
       (fn [index value]
         (assoc value
                :clicked {:data data :dimensions dimensions}
                :backgroundColor (color-getter
                                  (nth values index)
                                  index
                                  (:name (nth valueColumns index)))))
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
  (memoize
   (fn [col-index row-index]
     (let [col-values (nth col-paths col-index [])
           row-values (nth row-paths row-index [])
           index-values (concat col-values row-values)
           result (if (is-subtotal? row-values col-values row-indexes col-indexes)
                    (handle-subtotal-cell subtotal-values row-values col-values row-indexes col-indexes value-formatters)
                    (get-normal-cell-values values-by-key index-values value-formatters color-getter))]
       ;; Convert to JavaScript object if in ClojureScript context
       #?(:cljs (clj->js result)
          :clj result)))))

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
  (let [a (atom [])]
    (letfn [(process-tree [nodes depth offset path]
              (if (empty? nodes)
                {:span 1 :max-depth 0}
                (loop [remaining nodes
                       total-span 0
                       max-depth 0
                       current-offset offset]
                  (if (empty? remaining)
                    {:span total-span :max-depth (inc max-depth)}
                    (let [{:keys [children rawValue isGrandTotal isValueColumn] :as node} (first remaining)
                          path-with-value (if (or isValueColumn isGrandTotal) nil (conj path rawValue))
                          item            (-> (dissoc node :children)
                                              (assoc :depth depth
                                                     :offset current-offset
                                                     :hasChildren (boolean (seq children))
                                                     :path path-with-value))
                          item-index      (count @a)
                          _               (swap! a conj item)
                          result          (process-tree children (inc depth) current-offset path-with-value)
                          _               (swap! a update-in [item-index] assoc
                                                 :span (:span result)
                                                 :maxDepthBelow (:max-depth result))]
                      (recur (rest remaining)
                             (long (+ total-span (:span result)))
                             (long (max max-depth (:max-depth result)))
                             (+ current-offset (:span result))))))))]
      (process-tree tree 0 0 [])
      @a)))

(defn process-pivot-table
  "Formats rows, columns, and measure values in a pivot table according to
  provided formatters."
  [data row-indexes col-indexes val-indexes columns top-formatters left-formatters value-formatters format-rows? settings col-settings & [make-color-getter]]
  (let [pivot-data (:pivot-data (split-pivot-data data))
        color-getter (if make-color-getter
                       (make-color-getter (get-rows-from-pivot-data pivot-data row-indexes col-indexes))
                       (constantly nil))
        {:keys [row-tree col-tree values-by-key]} (build-pivot-trees pivot-data columns row-indexes col-indexes val-indexes settings col-settings)
        left-index-columns (select-indexes columns row-indexes)
        formatted-row-tree-without-subtotals (into [] (format-values-in-tree row-tree left-formatters left-index-columns))
        formatted-row-tree (into [] (add-subtotals formatted-row-tree-without-subtotals row-indexes settings col-settings))
        formatted-row-tree-with-totals (if (> (count formatted-row-tree-without-subtotals) 1)
                                         (maybe-add-grand-totals-row formatted-row-tree settings)
                                         formatted-row-tree)
        row-paths (->> formatted-row-tree-with-totals
                       (mapcat enumerate-paths)
                       maybe-add-empty-path)
        top-index-columns (select-indexes columns col-indexes)
        formatted-col-tree-without-values (into [] (format-values-in-tree col-tree top-formatters top-index-columns))
        formatted-col-tree-with-totals (maybe-add-row-totals-column formatted-col-tree-without-values settings)
        col-paths (->> formatted-col-tree-with-totals
                       (mapcat enumerate-paths)
                       maybe-add-empty-path)
        formatted-col-tree (into [] (add-value-column-nodes formatted-col-tree-with-totals columns val-indexes col-settings format-rows?))
        subtotal-values (get-subtotal-values pivot-data val-indexes)]
    {:columnIndex col-paths
     :rowIndex row-paths
     :leftHeaderItems (tree-to-array formatted-row-tree-with-totals)
     :topHeaderItems (tree-to-array formatted-col-tree)
     :getRowSection (create-row-section-getter values-by-key subtotal-values value-formatters col-indexes row-indexes col-paths row-paths color-getter)}))
