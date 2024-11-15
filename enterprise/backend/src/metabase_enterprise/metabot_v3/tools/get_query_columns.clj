(ns metabase-enterprise.metabot-v3.tools.get-query-columns
  (:require
   [cheshire.core :as json]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.util.malli :as mu]))

(defn- source-query
  [source]
  (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (:database_id source))
        table-or-card     (condp = (-> source :type keyword)
                                 :table (lib.metadata/table metadata-provider (:id source))
                                 :card  (lib.metadata/card metadata-provider (:id source)))]
    (lib/query metadata-provider table-or-card)))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/get-query-columns
  [_tool-name {:keys [source]} _context]
  (let [query             (source-query source)
        columns           (lib/visible-columns query)]
    {:output (json/generate-string (mapv (fn [column]
                                           {:id (:lib/desired-column-alias column)
                                            :name (-> (lib/display-info query column) :long-display-name)}) columns))}))
