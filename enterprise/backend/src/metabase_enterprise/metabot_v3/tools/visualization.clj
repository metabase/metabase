(ns metabase-enterprise.metabot-v3.tools.visualization
  (:require
   [medley.core :as m]))

(defn- table-columns
  [dataset-columns viz-settings]
  (when-let [column-settings (:table.columns viz-settings)]
    (let [name->column (m/index-by :name dataset-columns)]
      (mapv (fn [{:keys [name enabled]}]
              {:id name
               :name (-> (get name->column name) :display_name)
               :enabled enabled})
            column-settings))))

(defn visualization-context
  "Context for visualization tools"
  [dataset-columns display-type viz-settings]
  (merge {}
         (when display-type
           {:display-type display-type})
         (when (and dataset-columns viz-settings)
           {:table_columns (table-columns dataset-columns viz-settings)})))
