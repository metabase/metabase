(ns metabase.pivot.js
  "Javascript-facing interface for pivot table postprocessing. Wraps functions in metabase.pivot.core."
  (:require
   [metabase.pivot.core :as pivot]))

(defn ^:export split-pivot-data
  "TODO"
  [data]
  (let [{:keys [pivot-data columns]}
        (pivot/split-pivot-data (js->clj data :keywordize-keys true))]
    (clj->js
     {:pivotData pivot-data
      :columns   columns})))

(defn ^:export subtotal-values
  "TODO"
  [pivot-data value-column-indexes]
  (let [pivot-data (js->clj pivot-data)
        value-column-indexes (js->clj value-column-indexes)]
    (clj->js (pivot/subtotal-values pivot-data value-column-indexes))))

(defn- postprocess-tree
  "Walks a row or column tree, converting it to a format expected by JS.
  Constructs JS arrays and objects directly for better performance."
  [tree]
  (let [result #js []]
    (doseq [[value tree-node] tree]
      (let [node #js {:value value
                      :children (postprocess-tree (:children tree-node))
                      :isCollapsed (:isCollapsed tree-node)}]
        (.push result node)))
    result))

(defn ^:export build-pivot-trees
  "TODO"
  [rows cols col-indexes row-indexes val-indexes col-settings collapsed-subtotals]
  (let [cols (js->clj cols)
        col-indexes (js->clj col-indexes)
        row-indexes (js->clj row-indexes)
        val-indexes (js->clj val-indexes)
        col-settings (js->clj col-settings :keywordize-keys true)
        collapsed-subtotals (js->clj collapsed-subtotals)
        trees (pivot/build-pivot-trees rows
                                       cols
                                       row-indexes
                                       col-indexes
                                       val-indexes
                                       col-settings
                                       collapsed-subtotals)]
    #js {:rowTree (-> trees :row-tree postprocess-tree)
         :colTree (-> trees :col-tree postprocess-tree)
         :valuesByKey (-> trees :values-by-key clj->js)}))

(defn ^:export format-values-in-tree
  "TODO"
  [tree formatters cols]
  (let [tree (js->clj tree :keywordize-keys true)
        cols (js->clj cols)]
    (clj->js (pivot/format-values-in-tree tree formatters cols))))

(defn ^:export add-subtotals
  [row-tree row-indexes col-settings]
  (let [row-tree (js->clj row-tree :keywordize-keys true)
        row-indexes (js->clj row-indexes)
        col-settings (js->clj col-settings :keywordize-keys true)]
    (clj->js (pivot/add-subtotals row-tree row-indexes col-settings))))
