(ns metabase-enterprise.metabot-v3.tools.filter-data
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/filter-data
  [_tool-name _arguments context]
  {:output "Not implemented"
   :context context})
