(ns metabase-enterprise.metabot-v3.tools.change-axes-labels
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/change-axes-labels
  [_tool-name context]
  (contains? #{"line" "bar" "area" "combo" "scatter" "waterfall" "row"}
              (some-> context :current_visualization_settings :current_display_type)))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/change-axes-labels
  [_tool-name {:keys [x-axis-label y-axis-label], :as _argument-map}]
  {:reactions [{:type :metabot.reaction/change-axes-labels
                :x_axis_label x-axis-label
                :y_axis_label y-axis-label}]
   :output "success"})
