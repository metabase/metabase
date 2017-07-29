(ns metabase.sync.analyze
  "Logic responsible for doing deep 'analysis' of the data inside a database.
   This is significantly more expensive than the basic sync-metadata step, and involves things
   like running MBQL queries and fetching values to do things like determine Table row counts
   and infer field special types."
  (:require [metabase.models.field :refer [Field]]
            [metabase.sync
             [interface :as i]
             [util :as sync-util]]
            [metabase.sync.analyze
             [special-types :as special-types]
             [table-row-count :as table-row-count]]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db]))

(s/defn ^:private ^:always-validate update-fields-last-analyzed!
  "Update the `last_analyzed` date for all the fields in TABLE."
  [table :- i/TableInstance]
  (db/update-where! Field {:table_id        (u/get-id table)
                           :active          true
                           :visibility_type [:not= "retired"]}
    :last_analyzed (u/new-sql-timestamp)))


(s/defn ^:always-validate analyze-db!
  "Perform in-depth analysis on the data for all Tables in a given DATABASE.
   This is dependent on what each database driver supports, but includes things like cardinality testing and table row counting.
   This also updates the `:last_analyzed` value for each affected Field."
  [database :- i/DatabaseInstance]
  (sync-util/sync-operation :analyze database (format "Analyze data for %s" (sync-util/name-for-logging database))
    (table-row-count/update-table-row-counts! database)
    (special-types/infer-special-types! database)
    (doseq [table (sync-util/db->sync-tables database)]
      (update-fields-last-analyzed! table))))


(s/defn ^:always-validate analyze-table!
  "Perform in-depth analysis for a TABLE."
  [table :- i/TableInstance]
  (table-row-count/update-row-count-for-table! table)
  (special-types/infer-special-types-for-table! table)
  (update-fields-last-analyzed! table))
