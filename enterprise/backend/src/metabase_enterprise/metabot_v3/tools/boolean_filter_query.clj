(ns metabase-enterprise.metabot-v3.tools.boolean-filter-query
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/boolean-filter-query
  [_tool-name context]
  (some? (:current_query context)))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/boolean-filter-query
  [_tool-name {:keys [column value], :as _argument-map}]
  {:reactions [{:type :metabot.reaction/boolean-filter-query
                :column column
                :value  value}]
   :output "success"})
