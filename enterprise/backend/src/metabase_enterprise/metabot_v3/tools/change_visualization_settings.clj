(ns metabase-enterprise.metabot-v3.tools.change-visualization-settings
  (:require
    [clojure.string :as str]
    [medley.core :as m]
    [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
    [metabase.util.log :as log]
    [metabase.util.malli :as mu])
  (:import
   (clojure.lang ExceptionInfo)))

(defn- column-error
  [columns column-name]
  (ex-info (format "%s column does not exist. Available columns are: %s"
                   column-name
                   (str/join ", " (map :display_name columns)))
           {:column column-name}))

(defn- change-table-columns
  [viz-settings
   {show-column-names :show_columns, hide-column-names :hide_columns}
   columns]
  (let [name->column   (m/index-by :display_name columns)
        toggle-columns (fn [settings column-names enabled?]
                         (let [name->index (into {} (map-indexed (fn [i col] [(:name col) i])) settings)]
                           (reduce (fn [settings column-name]
                                     (let [column (or (get name->column column-name)
                                                      (throw (column-error columns column-name)))
                                           index  (get name->index (:name column))]
                                       (if (some? index)
                                         (assoc settings index {:name (:name column), :enabled enabled?})
                                         (into settings {:name (:name column), :enabled enabled?}))))
                                   settings
                                   (distinct column-names))))]
    (assoc viz-settings
           :table.columns
           (cond-> (or (:table.columns viz-settings) [])
             show-column-names (toggle-columns show-column-names true)
             hide-column-names (toggle-columns hide-column-names false)))))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/change-visualization-settings
  [_tool-name {:keys [table-columns]} {dataset-columns :dataset_columns, viz-settings :visualization_settings}]
  (try
    (let [viz-settings (cond-> viz-settings
                         table-columns (change-table-columns table-columns dataset-columns))]
      {:output "success"
       :reactions [{:type :metabot.reaction/change-visualization-settings
                    :visualization_settings viz-settings}]})
    (catch ExceptionInfo e
      (log/debug e "Error in change-visualization-settings tool")
      {:output (ex-message e)})))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/change-visualization-settings
  [_tool-name {:keys [visualization_settings]}]
  (some? visualization_settings))
