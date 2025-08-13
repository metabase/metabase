(ns metabase-enterprise.transforms.test-query-util
  "Shared utilities for building test queries in transform tests."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.util :as t2u]))

(defn make-filter-query
  "Create a filtered query for testing transforms.

   Options:
   - :table-suffix - String suffix to match table name (e.g., \"products\")
   - :column-name - Name of column to filter on (e.g., \"category\")
   - :filter-value - Value to filter by
   - :filter-fn - Filter function to use (default: lib/=)
   - :clickhouse-expression? - If true and driver is ClickHouse, add merge table ID expression

   Returns an MLv2 query object. Callers can convert to legacy MBQL if needed."
  [{:keys [table-suffix column-name filter-value filter-fn clickhouse-expression?]
    :or {filter-fn lib/=}}]
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        ;; Find the table by suffix match
        table (m/find-first (comp #(str/ends-with? % table-suffix) t2u/lower-case-en :name)
                            (lib.metadata/tables mp))
        ;; Create base query
        query (lib/query mp table)
        ;; Find the column to filter on
        column (m/find-first (comp #{column-name} t2u/lower-case-en :name)
                             (lib/visible-columns query))
        ;; Apply the filter
        filtered (lib/filter query (filter-fn column filter-value))]
    ;; Add ClickHouse-specific expression if needed
    (if (and clickhouse-expression? (= :clickhouse driver/*driver*))
      (let [id-column (m/find-first (comp #{"id"} t2u/lower-case-en :name)
                                    (lib/visible-columns query))]
        (lib/expression filtered "clickhouse_merge_table_id" id-column))
      filtered)))

(defn make-query
  "Create a flexible query for testing, with optional filtering.

   Can be called with:
   - (make-query source-table) - Just the table, no filtering
   - (make-query source-table source-column constraint-fn & constraint-params) - With filtering

   This matches the signature from execute_test.clj for compatibility."
  ([source-table]
   (make-query source-table nil nil))
  ([source-table source-column constraint-fn & constraint-params]
   (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
         table (if (string? source-table)
                 (m/find-first (comp #(str/ends-with? % source-table) t2u/lower-case-en :name)
                               (lib.metadata/tables mp))
                 source-table)
         query (lib/query mp table)
         column (when source-column
                  (m/find-first (comp #{source-column} t2u/lower-case-en :name)
                                (lib/visible-columns query)))]
     (cond-> query
       (and source-column constraint-fn)
       (lib/filter (apply constraint-fn column constraint-params))))))
