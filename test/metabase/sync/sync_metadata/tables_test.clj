(ns ^:mb/once metabase.sync.sync-metadata.tables-test
  "Test for the logic that syncs Table models with the metadata fetched from a DB."
  (:require
   [clojure.test :refer :all]
   [metabase.models :refer [Database Table]]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(tx/defdataset db-with-some-cruft
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
      (is (= #{{:name "SOUTH_MIGRATIONHISTORY", :visibility_type :cruft, :initial_sync_status "complete"}
               {:name "ACQUIRED_TOUCANS",       :visibility_type nil,    :initial_sync_status "complete"}}
             (set (for [table (t2/select [Table :name :visibility_type :initial_sync_status], :db_id (mt/id))]
                    (into {} table))))))))

(deftest sync-tables-and-database!-test
  (testing "`sync-tables-and-database!` should create new inactive tables, and not activate inactive ones"
    (mt/with-temp* [Database [db]
                    Table    [_table-1 {:name "Table 1", :db_id (u/the-id db), :schema "Schema 1", :active true}]
                    Table    [_table-2 {:name "Table 2", :db_id (u/the-id db), :schema "Schema 2", :active false}]]
      (#'sync-tables/sync-tables-and-database! db {:tables #{{:name "Table 1", :schema "Schema 1"}
                                                             {:name "Table 2", :schema "Schema 2"}
                                                             {:name "Table 3", :schema "Schema 3"}}})
      (is (= {"Table 1" true, "Table 2" false, "Table 3" false}
             (t2/select-fn->fn :name :active Table, :db_id (u/the-id db)))))))

(deftest activate-tables!-test
  (testing "`activate-new-tables!` should activate tables that are currently inactive but in the DB metadata"
    (mt/with-temp* [Database [db]
                    Table    [_table-1 {:name "Table 1", :db_id (u/the-id db), :schema "Schema 1", :active true}]
                    Table    [_table-2 {:name "Table 2", :db_id (u/the-id db), :schema "Schema 2", :active false}]]
      (#'sync-tables/activate-new-tables! db {:tables #{{:name "Table 1", :schema "Schema 1"}
                                                        {:name "Table 2", :schema "Schema 2"}}})
      (is (= {"Table 1" true, "Table 2" true}
             (t2/select-fn->fn :name :active Table, :db_id (u/the-id db)))))))

(deftest retire-tables-test
  (testing "`retire-tables!` should retire the Table(s) passed to it, not all Tables in the DB -- see #9593"
    (mt/with-temp* [Database [db]
                    Table    [table-1 {:name "Table 1", :db_id (u/the-id db)}]
                    Table    [_       {:name "Table 2", :db_id (u/the-id db)}]]
      (#'sync-tables/retire-tables! db #{{:name "Table 1", :schema (:schema table-1)}})
      (is (= {"Table 1" false, "Table 2" true}
             (t2/select-fn->fn :name :active Table, :db_id (u/the-id db)))))))
