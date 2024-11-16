(ns metabase-enterprise.metabot-v3.tools.visualization)

(defn column-id
  "Visualization column id."
  [column]
  (:name column))

(defn column-info
  "Visualization column id and name."
  [column]
  {:id (column-id column)
   :name (:display_name column)})

(defn visualization-context
  "Context for visualization tools"
  [display-type dataset-columns viz-settings]
  (merge {}
         (when display-type
           {:display-type display-type})
         (when viz-settings
           {:visualization_columns (mapv column-info dataset-columns)})))
