(ns metabase.pivot.core
  (:require
   #?(:clj [metabase.util.json :as json])
   [flatland.ordered.map :as ordered-map]
   [medley.core :as m]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n])
  (:import
   #?(:clj (java.text Collator))))

(defn- json-parse
  [x]
  #?(:cljs (js->clj (js/JSON.parse (clj->js x)))
     :clj (json/decode x)))

(defn- is-pivot-group-column
  "Is the given column the pivot-grouping column?"
  [col]
  (= (:name col) "pivot-grouping"))

(defn columns-without-pivot-group
  "Removes the pivot-grouping column from a list of columns."
  [columns]
  (filter #(not (is-pivot-group-column %)) columns))

(defn split-pivot-data
  "Pulls apart different aggregations that were packed into one result set returned from the QP.
  The pivot-grouping column indicates which breakouts were used to compute a given row. We used that column
  to split apart the data and convert field refs to indices"
  [data]
  (let [group-index (u/index-of is-pivot-group-column (:cols data))
        columns     (columns-without-pivot-group (:cols data))
        breakouts   (filter #(= (keyword (:source %)) :breakout) columns)
        pivot-data  (->> (:rows data)
                         (group-by #(nth % group-index))
                         ;; TODO: Make this logic more understandable
                         (m/map-kv
                          (fn [k rows]
                            (let [breakout-indexes (range (count breakouts))
                                  indexes (into [] (filter #(zero? (bit-and (bit-shift-left 1 %) k)) breakout-indexes))]
                              [indexes
                               (map #(vec (concat (subvec % 0 group-index) (subvec % (inc group-index))))
                                    rows)]))))]
    {:pivot-data pivot-data
     :primary-rows-key (into [] (range (count breakouts)))
     :columns columns}))

(defn get-subtotal-values
  "Returns subtotal values"
  [pivot-data value-column-indexes]
  (m/map-kv-vals
   (fn [subtotalName subtotal]
     (let [indexes subtotalName]
       (reduce
        (fn [acc row]
          (let [value-key (map #(nth row %) indexes)]
            (assoc acc
                   value-key
                   (map #(nth row %) value-column-indexes))))
        {}
        subtotal)))
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
                            :colIdx index})
                         row)
             ;; @tsp TODO? this could use the `data` above
             dimensions (->> row
                             (map-indexed (fn [index value]
                                            {:value value
                                             :colIdx index}))
                             (filter (fn [tmp]
                                       (= ((nth cols (:colIdx tmp)) "source") "breakout"))))
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

(defn- compare-fn
  [sort-order]
  (let [locale-compare
        (fn [a b]
          (cond
            (= a b)
            0

            (string? a)
            #?(:clj
               ;; TODO: make this a singleton collator?
               (let [collator (Collator/getInstance)]
                 (.compare collator (str a) (str b)))
               :cljs
               (.localeCompare (str a) (str b)))

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

;; TODO: See if we can elide this step?
(defn- postprocess-tree
  [tree]
  (vec
   (for [[value tree-node] tree]
     (assoc tree-node
            :value value
            :children (postprocess-tree (:children tree-node))))))

(defn column-split->indexes
  "Converts names of columns in `column-split` to indices into `columns-without-pivot-group`.
    e.g. {:rows [\"CREATED_AT\"], :columns [\"RATING\"], :values [\"count\"]}
    ->   {:rows [1] :columns [0] :values [2]}"
  [column-split columns-without-pivot-group]
  (let [find-index (fn [col-name] (u/index-of #(= (:name %) col-name) columns-without-pivot-group))]
    (update-vals
     column-split
     (fn [column-names] (into [] (keep find-index column-names))))))

(defn- get-rows-from-pivot-data
  [pivot-data row-indexes col-indexes]
  (let [primary-rows-key (range (+ (count row-indexes)
                                   (count col-indexes)))]

    (get pivot-data primary-rows-key)))

(defn build-pivot-trees
  "TODO"
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

(defn- maybe-add-row-totals-column
  [col-tree settings]
  (if (and (> (count col-tree) 1)
           (:pivot.show_row_totals settings))
    (conj
     col-tree
     {:value (i18n/tru "Row totals")
      :children []
      :isSubtotal true
      :isGrandTotal true})
    col-tree))

(defn- maybe-add-grand-totals-row
  [row-tree settings]
  (if (:pivot.show_column_totals settings)
    (conj
     row-tree
     {:value (i18n/tru "Grand totals")
      :children []
      :isSubtotal true
      :isGrandTotal true})
    row-tree))

(defn- add-subtotal
  [row-item show-subs-by-col should-show-subtotal]
  (let [is-subtotal-enabled (first show-subs-by-col)
        rest-subs-by-col    (rest show-subs-by-col)
        has-subtotal        (and is-subtotal-enabled should-show-subtotal)
        subtotal            (if has-subtotal
                              [{:value (i18n/tru "Totals for {0}" (:value row-item))
                                :rawValue (:rawValue row-item)
                                :span 1
                                :isSubtotal true
                                :children []}]
                              [])]
    (if (:isCollapsed row-item)
      subtotal
      (let [node (merge row-item
                        {:hasSubtotal has-subtotal
                         :children (mapcat (fn [child] (if (not-empty (:children child))
                                                         (add-subtotal child
                                                                       rest-subs-by-col
                                                                       (or (> (count (:children child)) 1)
                                                                           (:isCollapsed child)))
                                                         [child]))
                                           (:children row-item))})]
        (if (not-empty subtotal)
          [node (first subtotal)]
          [node])))))

(defn- add-subtotals
  [row-tree row-indexes settings col-settings]
  (if (:pivot.show_column_totals settings)
    (let [show-subs-by-col (map (fn [idx]
                                  (not= ((nth col-settings idx) :pivot_table.column_show_totals) false))
                                row-indexes)
          not-flat         (some #(> (count (:children %)) 1) row-tree)
          res              (mapcat (fn [row-item]
                                     (add-subtotal row-item show-subs-by-col
                                                   (or not-flat
                                                       (> (count (:children row-item)) 1))))
                                   row-tree)]
      res)
    row-tree))

(defn- display-name-for-col
  "@tsp - ripped from frontend/src/metabase/lib/formatting/column.ts"
  [column]
  (or (:display_name (:remapped_to_column column))
      (:display_name column)
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
  [col-tree cols col-indexes col-settings]
  (let [val-cols (map (fn [idx] [(nth cols idx) (nth col-settings idx)]) col-indexes)
        leaf-nodes (map (fn [[col col-setting]] {:value (or (:column_title col-setting) (display-name-for-col col))
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
  [{:keys [rawValue isGrandTotal children isValueColumn]}
   & [path]]
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
  [key-fn coll]
  (->> coll
       (map-indexed vector)
       (sort-by (fn [[idx val]] (key-fn val idx)))
       (map second)))

(defn- get-subtotals
  [subtotal-values breakout-indexes values other-attrs value-formatters]
  (map (fn [value] (merge value
                          {:isSubtotal true}
                          other-attrs))
       (format-values
        (get-in subtotal-values
                [(sort-by-indexed (fn [_ index] (nth breakout-indexes index)) breakout-indexes)
                 (sort-by-indexed (fn [_ index] (nth breakout-indexes index)) values)])
        value-formatters)))

;; TODO - memoize the getter
(defn- create-row-section-getter
  [values-by-key subtotal-values value-formatters col-indexes row-indexes col-paths row-paths color-getter]
  ;; The getter returned from this function returns the value(s) at given (column, row) location
  (fn [col-index row-index]
    (let [col-values (nth col-paths col-index [])
          row-values (nth row-paths row-index [])
          index-values (concat col-values row-values)
          result (if (or (< (count row-values) (count row-indexes))
                         (< (count col-values) (count col-indexes)))
                   (let [row-idxs (take (count row-values) row-indexes)
                         col-idxs (take (count col-values) col-indexes)
                         indexes (concat col-idxs row-idxs)
                         other-attrs (if (zero? (count row-values))
                                       {:isGrandTotal true}
                                       {})]
                     (get-subtotals subtotal-values indexes index-values other-attrs value-formatters))
                   (let [{:keys [values valueColumns data dimensions]}
                         (get values-by-key index-values)]
                     (map-indexed
                      (fn [index o]
                        (if-not data
                          o
                          (assoc o
                                 :clicked {:data data :dimensions dimensions}
                                 :backgroundColor
                                 (color-getter
                                  (get values index)
                                  (:rowIndex o)
                                  (:name (get valueColumns index))))))
                      (format-values values value-formatters))))]
      #?(:cljs (clj->js result)
         :clj result))))

(defn tree-to-array [nodes]
  (let [a (atom [])]
    (letfn [(dfs [nodes depth offset path]
              (if (empty? nodes)
                {:span 1 :maxDepth 0}
                (loop [remaining nodes
                       total-span 0
                       max-depth 0
                       current-offset offset]
                  (if (empty? remaining)
                    {:span total-span :maxDepth (inc max-depth)}
                    (let [{:keys [children rawValue isGrandTotal isValueColumn] :as node} (first remaining)
                          path-with-value (if (or isValueColumn isGrandTotal) nil (conj path rawValue))
                          item (-> (dissoc node :children)
                                   (assoc :depth depth
                                          :offset current-offset
                                          :hasChildren (boolean (seq children))
                                          :path path-with-value))
                          item-index (count @a)
                          _ (swap! a conj item)
                          result (dfs children (inc depth) current-offset path-with-value)
                          _ (swap! a update-in [item-index] assoc
                                   :span (:span result)
                                   :maxDepthBelow (:maxDepth result))]
                      (recur (rest remaining)
                             (+ total-span (:span result))
                             (max max-depth (:maxDepth result))
                             (+ current-offset (:span result))))))))]
      (dfs nodes 0 0 [])
      @a)))

(defn process-pivot-table
  "Formats rows, columns, and measure values in a pivot table according to
  provided formatters."
  [data row-indexes col-indexes val-indexes columns top-formatters left-formatters value-formatters settings col-settings & [make-color-getter]]
  (let [pivot-data (:pivot-data (split-pivot-data data))
        color-getter (if make-color-getter
                       (make-color-getter (get-rows-from-pivot-data pivot-data row-indexes col-indexes))
                       (constantly nil))
        {:keys [row-tree col-tree values-by-key]} (build-pivot-trees pivot-data columns row-indexes col-indexes val-indexes settings col-settings)
        left-index-columns (select-indexes columns row-indexes)
        formatted-row-tree-without-subtotals (into [] (format-values-in-tree row-tree left-formatters left-index-columns))
        ;; TODO condense the below functions
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
        formatted-col-tree (into [] (add-value-column-nodes formatted-col-tree-with-totals columns val-indexes col-settings))
        subtotal-values (get-subtotal-values pivot-data val-indexes)]
    {:columnIndex col-paths
     :rowIndex row-paths
     :leftHeaderItems (tree-to-array formatted-row-tree-with-totals)
     :topHeaderItems (tree-to-array formatted-col-tree)
     :getRowSection (create-row-section-getter values-by-key subtotal-values value-formatters col-indexes row-indexes col-paths row-paths color-getter)}))
