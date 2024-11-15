(ns metabase-enterprise.metabot-v3.tools.get-query-columns
  (:require
   [cheshire.core :as json]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase-enterprise.metabot-v3.tools.query :as metabot-v3.tools.query]
   [metabase.lib.core :as lib]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/get-query-columns
  [_tool-name {:keys [source]} {:keys [dataset_query]}]
  (let [new-query    (metabot-v3.tools.query/source-query source)
        old-query    (when (= (:database dataset_query) (lib/database-id new-query))
                       (lib/query new-query dataset_query))
        same-source? (and (some? old-query)
                          (= (lib.util/source-table-id new-query) (lib.util/source-table-id old-query))
                          (= (lib.util/source-card-id new-query) (lib.util/source-card-id old-query)))
        query        (if same-source? old-query new-query)
        query        (lib/ensure-filter-stage query)]
    {:output (json/generate-string (into []
                                         (mapcat #(map (fn [column] (metabot-v3.tools.query/column-info query % column))
                                                       (lib/visible-columns query %)))
                                         (range (lib/stage-count query))))}))
