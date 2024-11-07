(ns metabase-enterprise.metabot-v3.tools.breakout-query
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/breakout-query
  [_tool-name context]
  (some? (:current_query context)))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/breakout-query
  [_tool-name {:keys [column], :as _argument-map}]
  {:reactions [{:type :metabot.reaction/breakout-query
                :column column}]
   :output "success"})
