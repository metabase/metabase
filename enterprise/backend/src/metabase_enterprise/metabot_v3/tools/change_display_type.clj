(ns metabase-enterprise.metabot-v3.tools.change-display-type
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/change-display-type
  [_tool-name {display-type :type} _context]
  {:reactions [{:type :metabot.reaction/change-display-type
                :display-type display-type}]
   :output "success"})

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/change-display-type
  [_tool-name {:keys [display_type]}]
  (some? display_type))
