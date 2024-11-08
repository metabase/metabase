(ns metabase-enterprise.metabot-v3.tools.change-column-settings
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/change-column-settings
  [_tool-name context]
  (contains? (some-> context :current_visualization_settings) :column_settings))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/change-column-settings
  [_tool-name {:keys [column-settings], :as _argument-map}]
  {:reactions [{:type :metabot.reaction/change-column-settings
                :column_settings column-settings}]
   :output "success"})
