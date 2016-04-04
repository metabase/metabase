(ns metabase.sync-database.sync-test
  (:require [expectations :refer :all]
            [metabase.db :as db]
            [metabase.models.database :as database]
            [metabase.models.field :as field]
            [metabase.models.raw-column :as raw-column]
            [metabase.models.raw-table :as raw-table]
            [metabase.models.table :as table]
            [metabase.sync-database.sync :refer :all]
            [metabase.test.util :as tu]))

(tu/resolve-private-fns metabase.sync-database.sync
  save-all-fks! sync-metabase-metadata-table! save-table-fields!)


;; infer-field-special-type
(expect nil (infer-field-special-type nil))
(expect nil (infer-field-special-type {}))
;; explicit special-type always wins
(expect :latitude (infer-field-special-type {:name "id", :base_type :IntegerField, :is_pk true, :details {:special-type :latitude}}))
;; pk? true should be :id
(expect :id (infer-field-special-type {:name "rating", :base_type :IntegerField, :is_pk true}))
;; name of "id" should be :id
(expect :id (infer-field-special-type {:name "id", :base_type :IntegerField}))
;; other pattern matches based on type/regex (remember, base_type matters in matching!)
(expect :category (infer-field-special-type {:name "rating", :base_type :IntegerField, :is_pk false}))
(expect nil (infer-field-special-type {:name "rating", :base_type :BooleanField, :is_pk false}))
(expect :country (infer-field-special-type {:name "country", :base_type :TextField}))
(expect nil (infer-field-special-type {:name "country", :base_type :IntegerField}))


;; save-all-fks!
;; test case of fk across schemas
;; fks are always added and override other metadata
;; fks are never cleared if the disappear from the raw schema
;; test case where we have retired fields from older syncs which create duplication
(expect
  []
  (tu/with-temp* [database/Database  [{database-id :id}]
                  raw-table/RawTable  [{raw-table-id1 :id, :as table} {:database_id database-id, :schema "customer1", :name "photos"}]
                  raw-column/RawColumn [_ {:raw_table_id raw-table-id1, :name "id"}]
                  raw-column/RawColumn [_ {:raw_table_id raw-table-id1, :name "user_id"}]
                  raw-table/RawTable  [{raw-table-id2 :id, :as table1} {:database_id database-id, :schema "customer2", :name "photos"}]
                  raw-column/RawColumn [_ {:raw_table_id raw-table-id2, :name "id"}]
                  raw-column/RawColumn [_ {:raw_table_id raw-table-id2, :name "user_id"}]
                  raw-table/RawTable  [{raw-table-id3 :id, :as table2} {:database_id database-id, :schema nil, :name "users"}]
                  raw-column/RawColumn [_ {:raw_table_id raw-table-id3, :name "id"}]]
    (let [get-columns #(->> (db/sel :many raw-column/RawColumn :raw_table_id raw-table-id1)
                            (mapv tu/boolean-ids-and-timestamps))]
      ;; original list should not have any fks
      [(get-columns)
       ;; now add a fk
       (do
         (save-all-table-fks! table [{:fk-column-name   "user_id"
                                      :dest-table       {:schema nil, :name "users"}
                                      :dest-column-name "id"}])
         (get-columns))
       ;; now remove the fk
       (do
         (save-all-table-fks! table [])
         (get-columns))
       ;; now add back a different fk
       (do
         (save-all-table-fks! table [{:fk-column-name   "user_id"
                                      :dest-table       {:schema "customer1", :name "photos"}
                                      :dest-column-name "id"}])
         (get-columns))])))


;; TODO: sync-metabase-metadata-table!


;; save-table-fields!
;; this test also covers create-field! and update-field!
(expect
  [[{:id                 true,
     :table_id           true,
     :raw_column_id      true,
     :name               "First",
     :display_name       "First",
     :description        nil,
     :base_type          :IntegerField
     :visibility_type    :normal,
     :special_type       :id,
     :parent_id          false,
     :fk_target_field_id false,
     :created_at         true,
     :updated_at         true}
    {:id                 true,
     :table_id           true,
     :raw_column_id      true,
     :name               "Second",
     :display_name       "Second",
     :description        nil,
     :base_type          :TextField
     :visibility_type    :normal,
     :special_type       :category,
     :parent_id          false,
     :fk_target_field_id false,
     :created_at         true,
     :updated_at         true}
    {:id                 true,
     :table_id           true,
     :raw_column_id      true,
     :name               "Third",
     :display_name       "Third",
     :description        nil,
     :base_type          :BooleanField
     :visibility_type    :normal,
     :special_type       nil,
     :parent_id          false,
     :fk_target_field_id false,
     :created_at         true,
     :updated_at         true}]
   [{:id                 true,
     :table_id           true,
     :raw_column_id      true,
     :name               "First",
     :display_name       "First",
     :description        nil,
     :base_type          :DecimalField
     :visibility_type    :normal,
     :special_type       :id,                 ; existing special types are NOT modified
     :parent_id          false,
     :fk_target_field_id false,
     :created_at         true,
     :updated_at         true}
    {:id                 true,
     :table_id           true,
     :raw_column_id      true,
     :name               "Second",
     :display_name       "Second",
     :description        nil,
     :base_type          :TextField
     :visibility_type    :normal,
     :special_type       :category,
     :parent_id          false,
     :fk_target_field_id false,
     :created_at         true,
     :updated_at         true}
    {:id                 true,
     :table_id           true,
     :raw_column_id      true,
     :name               "Third",
     :display_name       "Third",
     :description        nil,
     :base_type          :BooleanField
     :visibility_type    :normal,
     :special_type       nil,
     :parent_id          false,
     :fk_target_field_id false,
     :created_at         true,
     :updated_at         true}
    {:id                 true,
     :table_id           true,
     :raw_column_id      true,
     :name               "Fourth",
     :display_name       "Fourth",
     :description        nil,
     :base_type          :IntegerField
     :visibility_type    :normal,
     :special_type       :category,            ; should be infered from name
     :parent_id          false,
     :fk_target_field_id false,
     :created_at         true,
     :updated_at         true}]
   [{:id                 true,
     :table_id           true,
     :raw_column_id      true,
     :name               "First",
     :display_name       "First",
     :description        nil,
     :base_type          :DecimalField
     :visibility_type    :retired,            ; field retired when RawColumn disabled
     :special_type       :id,
     :parent_id          false,
     :fk_target_field_id false,
     :created_at         true,
     :updated_at         true}
    {:id                 true,
     :table_id           true,
     :raw_column_id      true,
     :name               "Second",
     :display_name       "Second",
     :description        nil,
     :base_type          :TextField
     :visibility_type    :normal,
     :special_type       :category,
     :parent_id          false,
     :fk_target_field_id false,
     :created_at         true,
     :updated_at         true}
    {:id                 true,
     :table_id           true,
     :raw_column_id      true,
     :name               "Third",
     :display_name       "Third",
     :description        nil,
     :base_type          :BooleanField
     :visibility_type    :normal,
     :special_type       :id,                  ; special type can be set if it was nil before
     :parent_id          false,
     :fk_target_field_id false,
     :created_at         true,
     :updated_at         true}
    {:id                 true,
     :table_id           true,
     :raw_column_id      true,
     :name               "Fourth",
     :display_name       "Fourth",
     :description        nil,
     :base_type          :IntegerField
     :visibility_type    :normal,
     :special_type       :category,            ; should be infered from name
     :parent_id          false,
     :fk_target_field_id false,
     :created_at         true,
     :updated_at         true}]]
  (tu/with-temp* [database/Database    [{database-id :id}]
                  raw-table/RawTable   [{raw-table-id :id, :as table} {:database_id database-id}]
                  raw-column/RawColumn [{raw-column-id1 :id} {:raw_table_id raw-table-id, :name "First", :base_type "IntegerField", :is_pk true}]
                  raw-column/RawColumn [{raw-column-id2 :id} {:raw_table_id raw-table-id, :name "Second", :base_type "TextField", :details {:special-type :category}}]
                  raw-column/RawColumn [{raw-column-id3 :id} {:raw_table_id raw-table-id, :name "Third", :base_type "BooleanField"}]
                  table/Table          [{table-id :id, :as tbl} {:db_id database-id, :raw_table_id raw-table-id}]]
    (let [get-fields #(->> (db/sel :many field/Field :table_id table-id)
                           (mapv tu/boolean-ids-and-timestamps)
                           (mapv (fn [m]
                                   (dissoc m :active :field_type :position :preview_display))))]
      ;; original list should be empty
      [(get-fields)
       ;; first update should add them all
       (do
         (save-table-fields! tbl)
         (get-fields))
       ;; now add another column and modify the first
       (tu/with-temp* [raw-column/RawColumn [_ {:raw_table_id raw-table-id, :name "rating", :base_type "IntegerField"}]]
         (do
           (db/upd raw-column/RawColumn raw-column-id1 :is_pk false, :base_type "DecimalField")
           (save-table-fields! tbl)
           (get-fields))
         ;; now disable the first column
         (do
           (db/upd raw-column/RawColumn raw-column-id1 :active false)
           (db/upd raw-column/RawColumn raw-column-id3 :is_pk true)
           (save-table-fields! tbl)
           (get-fields)))])))


;; TODO: update-data-models-from-raw-tables!
;; make sure to test case where FK relationship tables are out of order
