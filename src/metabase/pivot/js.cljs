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
  [pivot-data cols row-indexes col-indexes val-indexes settings col-settings]
  (let [pivot-data (js->clj pivot-data)
        cols (js->clj cols)
        row-indexes (js->clj row-indexes)
        col-indexes (js->clj col-indexes)
        val-indexes (js->clj val-indexes)
        settings (js->clj settings :keywordize-keys true)
        col-settings (js->clj col-settings :keywordize-keys true)
        trees (pivot/build-pivot-trees pivot-data
                                       cols
                                       row-indexes
                                       col-indexes
                                       val-indexes
                                       settings
                                       col-settings)]
    #js {:rowTree (-> trees :row-tree postprocess-tree)
         :colTree (-> trees :col-tree postprocess-tree)
         :valuesByKey (-> trees :values-by-key clj->js)}))

(defn ^:export process-pivot-table
  "Formats rows, columns, and measure values in a pivot table according to
  provided formatters."
  [row-tree col-tree row-indexes col-indexes val-indexes cols top-formatters left-formatters value-formatters settings col-settings]
  (let [row-tree (js->clj row-tree :keywordize-keys true)
        col-tree (js->clj col-tree :keywordize-keys true)
        row-indexes (js->clj row-indexes)
        col-indexes (js->clj col-indexes)
        val-indexes (js->clj val-indexes)
        cols (js->clj cols :keywordize-keys true)
        settings (js->clj settings :keywordize-keys true)
        col-settings (js->clj col-settings :keywordize-keys true)]
    (clj->js (pivot/process-pivot-table row-tree col-tree row-indexes col-indexes val-indexes cols top-formatters left-formatters value-formatters settings col-settings))))
