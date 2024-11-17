(ns metabase-enterprise.metabot-v3.tools.change-table-column-settings
  (:require
   [clojure.set :as set]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/change-table-column-settings
  [_tool-name {:keys [table-columns]} _context]
  {:output "success"
   :reactions [{:type :metabot.reaction/change-table-column-settings
                :settings {:table.columns (mapv #(set/rename-keys % {:id :name}) table-columns)}}]})

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/change-table-column-settings
  [_tool-name {:keys [dataset_columns visualization_settings]}]
  (and (some? dataset_columns) (some? (:table.columns visualization_settings))))
