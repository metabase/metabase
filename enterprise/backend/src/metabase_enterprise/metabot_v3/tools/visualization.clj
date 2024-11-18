(ns metabase-enterprise.metabot-v3.tools.visualization
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(defn- column-settings->context
  [viz-settings]
  (when-let [column-settings (:column_settings viz-settings)]
    (mapv (fn [[key setting]] (merge {:key key} setting)) column-settings)))

(defn- column-settings->response
  [column-settings]
  (into {} (map (fn [setting]
                  [(:key setting) (->> (dissoc setting :key)
                                       (into {} (filter (comp some? second))))]))
        column-settings))

(defn- table-columns->context
  [dataset-columns viz-settings]
  (when-let [column-settings (:table.columns viz-settings)]
    (let [name->column (m/index-by :name dataset-columns)]
      (mapv (fn [{:keys [name enabled]}]
              {:key name
               :name (-> (get name->column name) :display_name)
               :enabled enabled})
            column-settings))))

(defn- table-columns->response
  [table-columns]
  (mapv #(set/rename-keys % {:key :name}) table-columns))

(defn visualization-context
  "Context for visualization tools."
  [dataset-columns display-type viz-settings]
  (merge {}
         (when display-type
           {:display_type display-type})
         (when (and dataset-columns viz-settings)
           {:column_settings (column-settings->context viz-settings)
            :table_columns (table-columns->context dataset-columns viz-settings)})))

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

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/change-column-settings
  [_tool-name {:keys [column-settings]} _context]
  (let [new-column-settings (column-settings->response column-settings)]
    {:reactions [{:type :metabot.reaction/change-column-settings
                  :column_settings new-column-settings}]
     :output "success"}))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/change-column-settings
  [_tool-name {:keys [dataset_columns visualization_settings]}]
  (and (some? dataset_columns) (some? (:column_settings visualization_settings))))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/change-table-column-settings
  [_tool-name {:keys [table-columns]} {:keys [visualization_settings]}]
  (let [new-table-columns (table-columns->response table-columns)
        old-table-columns (:table.columns visualization_settings)]
    (if (= (set (map :name new-table-columns)) (set (map :name old-table-columns)))
      {:output "success"
       :reactions [{:type :metabot.reaction/change-table-column-settings
                    :table_columns new-table-columns}]}
      {:output "Invalid `table_columns` change. You can only change `enabled` property of each column or reorder columns in the list. Do not add new columns and do not remove existing columns from this list."})))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/change-table-column-settings
  [_tool-name {:keys [dataset_columns visualization_settings]}]
  (and (some? dataset_columns) (some? (:table.columns visualization_settings))))
