(ns metabase-enterprise.metabot-v3.tools.change-table-column-settings
  (:require
   [clojure.set :as set]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/change-table-column-settings
  [_tool-name {:keys [table-columns]} {:keys [visualization_settings]}]
  (let [table-columns    (mapv #(set/rename-keys % {:id :name}) table-columns)
        new-column-names (into #{} (map :name) table-columns)
        old-column-names (into #{} (map :name) (:table.columns visualization_settings))]
    (if (= old-column-names new-column-names)
      {:output "success"
       :reactions [{:type :metabot.reaction/change-table-column-settings
                    :settings {:table.columns table-columns}}]}
      {:output "Invalid `table_columns` change. You can only change `enabled` property of each column or reorder columns in the list. Do not add new columns and do not remove existing columns from this list."})))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/change-table-column-settings
  [_tool-name {:keys [dataset_columns visualization_settings]}]
  (and (some? dataset_columns) (some? (:table.columns visualization_settings))))
