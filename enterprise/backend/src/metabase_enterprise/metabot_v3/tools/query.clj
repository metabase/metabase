(ns metabase-enterprise.metabot-v3.tools.query
  (:require
   [metabase.lib.query :as lib.query]))

(defn create-reactions
  "Extracts reactions based on the current context."
  [{:keys [query run-query?]}]
  (when (and query run-query?)
    [{:type          :metabot.reaction/run-query
      :dataset_query (lib.query/->legacy-MBQL query)}]))
