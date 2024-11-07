(ns metabase-enterprise.metabot-v3.tools.change-y-axis-range
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/change-y-axis-range
  [_tool-name {auto-range :auto-range, min-val :min, max-val :max}]
  {:reactions [{:type :metabot.reaction/change-y-axis-range
                "graph.y_axis.auto_range" auto-range
                "graph.y_axis.min" min-val
                "graph.y_axis.max" max-val}]
   :output "success"})
