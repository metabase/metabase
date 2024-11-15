(ns metabase-enterprise.metabot-v3.tools.change-chart-appearance
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/change-chart-appearance
  [_tool-name arguments _context]
  {:reactions [(merge {:type :metabot.reaction/change-chart-appearance}
                       arguments)]
   :output "success"})

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/change-chart-appearance
  [_tool-name {:keys [display_type]}]
  (some? display_type))
