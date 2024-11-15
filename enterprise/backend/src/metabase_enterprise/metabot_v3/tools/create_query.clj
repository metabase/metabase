(ns metabase-enterprise.metabot-v3.tools.create-query
  (:require
   [cheshire.core :as json]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.query :as lib.query]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/create-query
  [_tool-name {:keys [source]} _context]
  (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (:database_id source))
        query             (->> (condp = (-> source :type keyword)
                                :table (lib.metadata/table metadata-provider (:id source))
                                :model (lib.metadata/card metadata-provider (:id source)))
                               (lib/query metadata-provider))]
  {:output (json/generate-string (lib.query/->legacy-MBQL query))}))
