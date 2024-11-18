(ns metabase-enterprise.metabot-v3.tools.visualization
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

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
  "Context for visualization tools."
  [dataset-columns display-type viz-settings]
  (merge {}
         (when display-type
           {:display_type display-type})
         (when (and dataset-columns viz-settings)
           {:table_columns (table-columns dataset-columns viz-settings)})))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/change-display-type
  [_tool-name {display-type :type} _context]
  {:reactions [{:type :metabot.reaction/change-display-type
                :display-type display-type}]
   :output "success"})

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/change-display-type
  [_tool-name {:keys [display_type]}]
  (some? display_type))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/change-chart-appearance
  [_tool-name arguments _context]
  {:reactions [(merge {:type :metabot.reaction/change-chart-appearance}
                       arguments)]
   :output "success"})

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/change-chart-appearance
  [_tool-name {:keys [display_type]}]
  (some? display_type))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/change-table-column-settings
  [_tool-name {:keys [table-columns]} {:keys [visualization_settings]}]
  (let [new-table-columns (mapv #(set/rename-keys % {:id :name}) table-columns)
        old-table-columns (:table.columns visualization_settings)]
    (if (= (set (map :name new-table-columns)) (set (map :name old-table-columns)))
      {:output "success"
       :reactions [{:type :metabot.reaction/change-table-column-settings
                    :settings {:table.columns new-table-columns}}]}
      {:output "Invalid `table_columns` change. You can only change `enabled` property of each column or reorder columns in the list. Do not add new columns and do not remove existing columns from this list."})))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/change-table-column-settings
  [_tool-name {:keys [dataset_columns visualization_settings]}]
  (and (some? dataset_columns) (some? (:table.columns visualization_settings))))
