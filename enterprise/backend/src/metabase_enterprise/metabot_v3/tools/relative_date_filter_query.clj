(ns metabase-enterprise.metabot-v3.tools.relative-date-filter-query
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/relative-date-filter-query
  [_tool-name context]
  (some? (:current_query context)))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/relative-date-filter-query
  [_tool-name {:keys [column direction value unit include_current], :as _argument-map}]
  {:reactions [{:type :metabot.reaction/relative-date-filter-query
                :column column
                :value (condp = direction
                         "current" "current"
                         "last"   (- (abs value))
                         "next"   (abs value))
                :unit  unit
                :include_current include_current}]
   :output "success"})
