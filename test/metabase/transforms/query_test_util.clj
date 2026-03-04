(ns metabase.transforms.query-test-util
  "Shared utilities for building test queries in transform tests."
  (:require
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.util :as t2u]))

(defn- table-from-metadata
  [mp table-name]
  (->> (lib.metadata/tables mp)
       (m/find-first #(= (t2u/lower-case-en table-name)
                         (t2u/lower-case-en (:name %))))))

(defn- filter-on-column
  [query column-name]
  (m/find-first (comp #{column-name} t2u/lower-case-en :name)
                (lib/visible-columns query)))

(defn make-query
  "Create a query for testing, with optional filtering.

   Options:
   - :source-table - Table name (string) or table object to query
   - :source-column - Name of column to filter on (optional)
   - :filter-fn - Filter function to use (optional, e.g., lib/=, lib/starts-with)
   - :filter-values - Values to pass to filter function (optional)

   Returns an MLv2 query object."
  [& {:keys [source-table source-column filter-fn filter-values]}]
  (let [mp     (mt/metadata-provider)
        table  (if (string? source-table)
                 (table-from-metadata mp source-table)
                 source-table)
        query  (lib/query mp table)
        column (some->> source-column (filter-on-column query))]
    (cond-> query
      (and column filter-fn)
      (lib/filter (apply filter-fn column filter-values)))))
