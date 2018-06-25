(ns metabase.sync.sync-metadata.sync-database-type-test
  "Tests to make sure the newly added Field.database_type field gets populated, even for existing Fields."
  (:require [expectations :refer :all]
            [metabase
             [sync :as sync]
             [util :as u]]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.sync.util-test :as sut]
            [metabase.test.data :as data]
            metabase.test.util ; to make sure defaults for with-temp are registered
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; make sure that if a driver reports back a different database-type the Field gets updated accordingly
(expect
  [{:total-fields 16 :updated-fields 6}
   #{{:name "NAME",        :database_type "VARCHAR"}
     {:name "LATITUDE",    :database_type "DOUBLE"}
     {:name "LONGITUDE",   :database_type "DOUBLE"}
     {:name "ID",          :database_type "BIGINT"}
     {:name "PRICE",       :database_type "INTEGER"}
     {:name "CATEGORY_ID", :database_type "INTEGER"}}]
  ;; create a copy of the sample dataset :D
  (tt/with-temp Database [db (select-keys (data/db) [:details :engine])]
    (sync/sync-database! db)
    (let [venues-table (Table :db_id (u/get-id db), :display_name "Venues")]
      ;; ok, now give all the Fields `?` as their `database_type`. (This is what the DB migration does for existing
      ;; Fields)
      (db/update-where! Field {:table_id (u/get-id venues-table)}, :database_type "?")
      (db/update! Table (u/get-id venues-table) :fields_hash "something new")
      ;; now sync the DB again
      (let [after-update-step-info (sut/sync-database! "sync-fields" db)]
        [(sut/only-step-keys after-update-step-info)
         ;; The database_type of these Fields should get set to the correct types. Let's see...
         (set (map (partial into {})
                   (db/select [Field :name :database_type] :table_id (u/get-id venues-table))))]))))

;; make sure that if a driver reports back a different base-type the Field gets updated accordingly
(expect
  [{:updated-fields 16, :total-fields 16}
   {:updated-fields 6, :total-fields 16}
   #{{:name "NAME",        :base_type :type/Text}
     {:name "LATITUDE",    :base_type :type/Float}
     {:name "PRICE",       :base_type :type/Integer}
     {:name "ID",          :base_type :type/BigInteger}
     {:name "LONGITUDE",   :base_type :type/Float}
     {:name "CATEGORY_ID", :base_type :type/Integer}}]
  ;; create a copy of the sample dataset :D
  (tt/with-temp Database [db (select-keys (data/db) [:details :engine])]
    (let [new-db-step-info (sut/sync-database! "sync-fields" db)
          venues-table     (Table :db_id (u/get-id db), :display_name "Venues")]
      (db/update! Table (u/get-id venues-table) :fields_hash "something new")
      ;; ok, now give all the Fields `:type/*` as their `base_type`
      (db/update-where! Field {:table_id (u/get-id venues-table)}, :base_type "type/*")
      ;; now sync the DB again
      (let [after-update-step-info (sut/sync-database! "sync-fields" db)]
        [(sut/only-step-keys new-db-step-info)
         (sut/only-step-keys after-update-step-info)
         ;; The database_type of these Fields should get set to the correct types. Let's see...
         (set (map (partial into {})
                   (db/select [Field :name :base_type] :table_id (u/get-id venues-table))))]))))
