(ns metabase-enterprise.metabot-v3.tools.change-series-settings
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/change-series-settings
  [_tool-name context]
  (contains? #{"line" "bar" "area" "combo"}
             (some-> context :current_visualization_settings :current_display_type)))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/change-series-settings
  [_tool-name {:keys [series-settings], :as _argument-map}]
  {:reactions [{:type :metabot.reaction/change-series-settings
                :series_settings series-settings}]
   :output "success"})
