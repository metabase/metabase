(ns metabase-enterprise.metabot-v3.tools.string-filter-query
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/string-filter-query
  [_tool-name context]
  (some? (:current_query context)))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/string-filter-query
  [_tool-name {:keys [column operator values], :as _argument-map}]
  {:reactions [{:type :metabot.reaction/string-filter-query
                :column   column
                :operator operator
                :values   values}]
   :output "success"})
