(ns metabase-enterprise.metabot-v3.tools.generate-insights
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.public-settings :as public-settings]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/generate-insights
  [_tool-name {what-for :for :as _arguments} context]
  (let [[k id] (some #(find what-for %) [:metric_id :table_id :report_id :query_id])
        entity-type (case k
                      (:metric_id :report_id) "question"
                      :table_id "table"
                      :query_id (throw (ex-info "Unhandled" {})))]
    {:output (str (public-settings/site-url) "/auto/dashboard/" entity-type "/" id)
     :context context}))
