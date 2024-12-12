(ns metabase-enterprise.metabot-v3.tools.invite-user
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/generate-insights
  [_tool-name _arguments context]
  {:output "Not implemented"
   :context context})
