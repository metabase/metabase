(ns metabase-enterprise.metabot-v3.tools.run-query
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/change-query
  [_tool-name {:keys [query]}]
  (some? query))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/run-query
  [_tool-name _arg-map _context]
  {:output "success"})
