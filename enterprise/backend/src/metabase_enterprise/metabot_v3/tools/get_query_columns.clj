(ns metabase-enterprise.metabot-v3.tools.get-query-columns
  (:require
   [cheshire.core :as json]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/get-query-columns
  [_tool-name {:keys [query]} _context]
  (let [query (json/parse-string query true)
        metadata-provider (lib.metadata.jvm/application-database-metadata-provider (:database query))
        query             (lib/query metadata-provider query)
        columns           (lib/visible-columns query)]
    {:output (json/generate-string (mapv (fn [column]
                                           {:id (:lib/desired-column-alias column)
                                            :name (-> (lib/display-info query column) :long-display-name)}) columns))}))
