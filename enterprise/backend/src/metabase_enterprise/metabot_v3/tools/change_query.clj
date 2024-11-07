(ns metabase-enterprise.metabot-v3.tools.change-query
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/change-query
  [_tool-name context]
  (some? (:current_query context)))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/change-query
  [_tool-name {:keys [number-filters
                      relative-date-filters
                      aggregations
                      breakouts
                      order-bys
                      limits], :as _argument-map}]
  {:reactions [{:type                  :metabot.reaction/change-query
                :number-filters        number-filters
                :relative-date-filters relative-date-filters
                :aggregations          aggregations
                :breakouts             breakouts
                :order-bys             order-bys
                :limits                limits}]
   :output "success"})
