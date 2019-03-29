(ns metabase.sync.sync-metadata.tables-test
  "Test for the logic that syncs Table models with the metadata fetched from a DB."
  (:require [expectations :refer [expect]]
            [metabase.models
             [database :refer [Database]]
             [table :refer [Table]]]
            [metabase.sync.sync-metadata.tables :as sync-tables]
            [metabase.test.data :as data]
            [metabase.test.data.interface :as tx]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(tx/def-database-definition ^:private db-with-some-cruft
  [["acquired_toucans"
     [{:field-name "species",              :base-type :type/Text}
      {:field-name "cam_has_acquired_one", :base-type :type/Boolean}]
     [["Toco"               false]
      ["Chestnut-Mandibled" true]
      ["Keel-billed"        false]
      ["Channel-billed"     false]]]
   ["south_migrationhistory"
    [{:field-name "app_name",  :base-type :type/Text}
     {:field-name "migration", :base-type :type/Text}]
    [["main" "0001_initial"]
     ["main" "0002_add_toucans"]]]])

;; south_migrationhistory, being a CRUFTY table, should still be synced, but marked as such
(expect
  #{{:name "SOUTH_MIGRATIONHISTORY", :visibility_type :cruft}
    {:name "ACQUIRED_TOUCANS",       :visibility_type nil}}
  (data/dataset metabase.sync.sync-metadata.tables-test/db-with-some-cruft
    (set (for [table (db/select [Table :name :visibility_type], :db_id (data/id))]
           (into {} table)))))

;; `retire-tables!` should retire the Table(s) passed to it, not all Tables in the DB -- see #9593
(expect
  {"Table 1" false, "Table 2" true}
  (tt/with-temp* [Database [db]
                  Table    [table-1 {:name "Table 1", :db_id (u/get-id db)}]
                  Table    [table-2 {:name "Table 2", :db_id (u/get-id db)}]]
    (#'sync-tables/retire-tables! db #{{:name "Table 1", :schema (:schema table-1)}})
    (db/select-field->field :name :active Table, :db_id (u/get-id db))))
