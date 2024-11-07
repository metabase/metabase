(ns metabase-enterprise.metabot-v3.tools.sort-query
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/sort-query
  [_tool-name context]
  (some? (:current_query context)))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/sort-query
  [_tool-name {:keys [column direction], :as _argument-map}]
  {:reactions [{:type :metabot.reaction/sort-query
                :column column
                :direction direction}]
   :output "success"})
