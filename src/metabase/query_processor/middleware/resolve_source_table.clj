(ns metabase.query-processor.middleware.resolve-source-table
  "Fetches Tables corresponding to any `:source-table` IDs anywhere in the query."
  (:require [metabase.query-processor.store :as qp.store]
            [metabase.util.i18n :refer [tru]]))

(defn resolve-source-tables
  "Middleware that will take any `:source-table`s (integer IDs) at the current level of the query and fetch and save the
  corresponding Table in the Query Processor Store."
  [{:keys [source-table], :as query}]
  (when source-table
    (when (string? source-table)
      (throw
       (ex-info
        (tru "Invalid :source-table {0}: should be resolved to a Table ID by now." (pr-str source-table))
        {:query query})))
    (qp.store/fetch-and-store-tables! [source-table]))
  query)
