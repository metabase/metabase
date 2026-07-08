(ns metabase.query-processor.middleware.resolve-source-table
  "Fetches Tables corresponding to any `:source-table` IDs anywhere in the query."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]))

(defn resolve-source-tables
  "Middleware that will take any `:source-table`s (integer IDs) anywhere in the query and fetch and save the
  corresponding Table in the Query Processor Store."
  [query]
  ;; this is done for side effects
  (lib.metadata/bulk-metadata-or-throw query :metadata/table (lib/all-source-table-ids query))
  query)
