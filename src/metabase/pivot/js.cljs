(ns metabase.pivot.js
  "Javascript-facing interface for pivot table postprocessing. Wraps functions in metabase.pivot.core."
  (:require
   [medley.core :as m]
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
  "Walks a row or column tree, converting it to the format expected by the JS
  pivot implementation."
  [tree]
  (into [] (map (fn [[value tree-node]]
                  (-> tree-node
                      (assoc :value value)
                      (update :children postprocess-tree)))
                tree)))

(defn ^:export build-pivot-trees
  "TODO"
  [rows col-indexes row-indexes col-settings collapsed-subtotals]
  (let [rows (js->clj rows)
        col-indexes (js->clj col-indexes)
        row-indexes (js->clj row-indexes)
        col-settings (js->clj col-settings :keywordize-keys true)
        collapsed-subtotals (js->clj collapsed-subtotals)
        trees (pivot/build-pivot-trees rows
                                       col-indexes
                                       row-indexes
                                       col-settings
                                       collapsed-subtotals)]
    (clj->js {:rowTree (-> trees :row-tree postprocess-tree)
              :colTree (-> trees :col-tree postprocess-tree)})))

(defn ^:export build-values-by-key
  "TODO"
  [rows col-indexes row-indexes val-indexes col-settings cols]
  (let [rows (js->clj rows)
        col-indexes (js->clj col-indexes)
        row-indexes (js->clj row-indexes)
        val-indexes (js->clj val-indexes)
        col-settings (js->clj col-settings :keywordize-keys true)
        cols (js->clj cols :keywordize-keys true)]
    (clj->js (pivot/build-values-by-key rows col-indexes row-indexes val-indexes col-settings cols))))
