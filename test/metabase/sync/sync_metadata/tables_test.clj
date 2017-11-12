(ns metabase.sync.sync-metadata.tables-test
  "Test for the logic that syncs Table models with the metadata fetched from a DB."
  (:require [expectations :refer :all]
            [metabase.models.table :refer [Table]]
            [metabase.models.field :refer [Field]]
            [metabase.test.data :as data]
            [metabase.test.data.interface :as i]
            [toucan.db :as db]
            [metabase.models.table :as table]
            [metabase.models.field :as field]))

(i/def-database-definition ^:const ^:private db-with-some-cruft
  ["acquired_toucans"
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
    ["main" "0002_add_toucans"]]])

;; south_migrationhistory, being a CRUFTY table, should still be synced, but marked as such
(expect
  #{{:name "SOUTH_MIGRATIONHISTORY", :visibility_type :cruft}
    {:name "ACQUIRED_TOUCANS",       :visibility_type nil}}
  (data/dataset metabase.sync.sync-metadata.tables-test/db-with-some-cruft
    (set (for [table (db/select [Table :name :visibility_type], :db_id (data/id))]
           (into {} table)))))

(i/def-database-definition ^:const ^:private db-with-desc
 ["table_with_description"
  [{:field-name "field_with_description", :base-type :type/Text, :description "field description"}]
  [["val"]]])

;; check field descriptions were synced
(expect
  #{{:name "FIELD_WITH_DESCRIPTION", :description "field description"}}
  (data/dataset metabase.sync.sync-metadata.tables-test/db-with-desc
    (set (for [field (db/select [Field :name :description], :id (data/id "TABLE_WITH_DESCRIPTION" "FIELD_WITH_DESCRIPTION"))]
           (into {} field)))))
