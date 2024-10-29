(ns metabase-enterprise.metabot-v3.tools.change-table-visualization-settings
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/change-table-visualization-settings
  [_tool-name context]
  (= "table" (some-> context :current_display_type)))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/change-table-visualization-settings
  [_tool-name {:keys [visible-columns], :as _argument-map}]
  {:reactions [{:type :metabot.reaction/change-table-visualization-settings
                :visible-columns visible-columns}]
   :output "success"})
