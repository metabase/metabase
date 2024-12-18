(ns metabase-enterprise.metabot-v3.tools.find-outliers
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/find-outliers
  [_tool-name _arguments _env]
  {:output "Not implemented."})
