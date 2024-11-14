(ns metabase-enterprise.metabot-v3.tools.run-query
  (:require
   [cheshire.core :as json]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/run-query
  [_tool-name {:keys [query]} _context]
  {:output "success"
   :reactions [{:type  :metabot.reaction/run-query
                :dataset_query (json/parse-string query true)}]})
