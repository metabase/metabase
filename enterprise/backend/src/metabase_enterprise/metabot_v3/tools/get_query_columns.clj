(ns metabase-enterprise.metabot-v3.tools.get-query-columns
  (:require
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/get-query-columns
  [_tool-name _arguments {:keys [dataset_query]}]
  (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (:database dataset_query))
        query             (lib/query metadata-provider dataset_query)
        columns           (lib/visible-columns query)]
    {:output (->> columns
                  (map #(->> % (lib/display-info query) :long-display-name))
                  (str/join ", "))}))

(mu/defmethod metabot-v3.tools.interface/*tool-applicable?* :metabot.tool/get-query-columns
  [_tool-name {:keys [dataset_query]}]
  (some? dataset_query))
