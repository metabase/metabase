(ns metabase-enterprise.metabot-v3.tools.limit-query
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/limit-query
  [_tool-name context]
  (some? (:current_query context)))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/limit-query
  [_tool-name {:keys [limit], :as _argument-map}]
  {:reactions [{:type :metabot.reaction/limit-query
                :limit limit}]
   :output "success"})
