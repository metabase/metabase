(ns metabase.sync.sync-metadata.tables-test
  "Test for the logic that syncs Table models with the metadata fetched from a DB."
  (:require [clojure.test :refer :all]
            [metabase
             [models :refer [Database Table]]
             [test :as mt]
             [util :as u]]
            [metabase.sync.sync-metadata.tables :as sync-tables]
            [metabase.test.data.interface :as tx]
            [toucan.db :as db]))

(tx/defdataset ^:private db-with-some-cruft
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

(deftest crufty-tables-test
  (testing "south_migrationhistory, being a CRUFTY table, should still be synced, but marked as such"
    (mt/dataset metabase.sync.sync-metadata.tables-test/db-with-some-cruft
      (is (= #{{:name "SOUTH_MIGRATIONHISTORY", :visibility_type :cruft}
               {:name "ACQUIRED_TOUCANS",       :visibility_type nil}}
             (set (for [table (db/select [Table :name :visibility_type], :db_id (mt/id))]
                    (into {} table))))))))

(deftest retire-tables-test
  (testing "`retire-tables!` should retire the Table(s) passed to it, not all Tables in the DB -- see #9593"
    (mt/with-temp* [Database [db]
                    Table    [table-1 {:name "Table 1", :db_id (u/get-id db)}]
                    Table    [table-2 {:name "Table 2", :db_id (u/get-id db)}]]
      (#'sync-tables/retire-tables! db #{{:name "Table 1", :schema (:schema table-1)}})
      (is (= {"Table 1" false, "Table 2" true}
             (db/select-field->field :name :active Table, :db_id (u/get-id db)))))))
