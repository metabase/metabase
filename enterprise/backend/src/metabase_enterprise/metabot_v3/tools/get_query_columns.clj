(ns metabase-enterprise.metabot-v3.tools.get-query-columns
  (:require
   [cheshire.core :as json]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase-enterprise.metabot-v3.tools.query :as metabot-v3.tools.query]
   [metabase.lib.core :as lib]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/get-query-columns
  [_tool-name {:keys [source]} _context]
  (let [query             (metabot-v3.tools.query/source-query source)
        columns           (lib/visible-columns query)]
    {:output (json/generate-string (mapv #(metabot-v3.tools.query/column-info query %) columns))}))
