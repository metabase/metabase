(ns metabase.sync.analyze
  "Logic responsible for doing deep 'analysis' of the data inside a database.
   This is significantly more expensive than the basic sync-metadata step, and involves things
   like running MBQL queries and fetching values to do things like determine Table row counts
   and infer field special types."
  (:require [clojure.tools.logging :as log]
            [metabase.models.field :refer [Field]]
            [metabase.sync
             [interface :as i]
             [util :as sync-util]]
            [metabase.sync.analyze
             [classify :as classify]
             [fingerprint :as fingerprint]
             [table-row-count :as table-row-count]]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db]))

(s/defn ^:private ^:always-validate update-fields-last-analyzed!
  "Update the `last_analyzed` date for all the fields in TABLE."
  [table :- i/TableInstance]
  (db/update-where! Field {:table_id        (u/get-id table)
                           :active          true
                           :visibility_type [:not= "retired"]
                           :preview_display true
                           :last_analyzed   nil}
    :last_analyzed (u/new-sql-timestamp)))


(s/defn ^:always-validate analyze-table!
  "Perform in-depth analysis for a TABLE."
  [table :- i/TableInstance]
  (table-row-count/update-row-count! table)
  (fingerprint/fingerprint-fields! table)
  (classify/classify-fields! table)
  (update-fields-last-analyzed! table))


(s/defn ^:always-validate analyze-db!
  "Perform in-depth analysis on the data for all Tables in a given DATABASE.
   This is dependent on what each database driver supports, but includes things like cardinality testing and table row counting.
   This also updates the `:last_analyzed` value for each affected Field."
  [database :- i/DatabaseInstance]
  (sync-util/sync-operation :analyze database (format "Analyze data for %s" (sync-util/name-for-logging database))
    (let [tables (sync-util/db->sync-tables database)]
      (sync-util/with-emoji-progress-bar [emoji-progress-bar (count tables)]
        (doseq [table tables]
          (analyze-table! table)
          (log/info (u/format-color 'blue "%s Analyzed %s" (emoji-progress-bar) (sync-util/name-for-logging table))))))))
