(ns metabase-enterprise.metabot-v3.tools.aggregate-query
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/aggregate-query
  [_tool-name context]
  (some? (:current_query context)))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/aggregate-query
  [_tool-name {:keys [operator column], :as _argument-map}]
  {:reactions [{:type :metabot.reaction/aggregate-query
                :operator operator
                :column column}]
   :output "success"})
