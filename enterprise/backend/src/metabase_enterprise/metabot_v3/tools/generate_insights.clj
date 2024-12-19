(ns metabase-enterprise.metabot-v3.tools.generate-insights
  (:require
   [buddy.core.codecs :as codecs]
   [metabase-enterprise.metabot-v3.envelope :as env]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.public-settings :as public-settings]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/generate-insights
  [_tool-name {what-for :for :as _arguments} env]
  (let [[k id] (some #(find what-for %) [:metric_id :table_id :report_id :query_id])
        entity-type (case k
                      (:metric_id :report_id) "question"
                      :table_id "table"
                      :query_id "adhoc")
        entity-id (if (= entity-type "adhoc")
                    (-> env
                        (env/find-query id)
                        json/encode
                        .getBytes
                        codecs/bytes->b64-str)
                    id)]
    {:output (str (public-settings/site-url) "/auto/dashboard/" entity-type "/" entity-id)}))
