(ns metabase.sync-database.sync-dynamic-test
  (:require [expectations :refer :all]
            [metabase.db :as db]
            [metabase.models.database :as database]
            [metabase.models.field :as field]
            [metabase.models.raw-table :as raw-table]
            [metabase.models.table :as table]
            [metabase.sync-database.sync-dynamic :refer :all]
            [metabase.test.util :as tu]))

(tu/resolve-private-fns metabase.sync-database.sync-dynamic
  save-table-fields!)

;; save-table-fields!  (also covers save-nested-fields!)
(expect
  [[]
   ;; initial sync
   [{:id                 true,
     :table_id           true,
     :raw_column_id      false,
     :name               "First",
     :display_name       "First",
     :description        nil,
     :base_type          :IntegerField
     :visibility_type    :normal,
     :special_type       :id,
     :parent_id          false,
     :fk_target_field_id false,
     :last_analyzed      false
     :created_at         true,
     :updated_at         true}
    {:id                 true,
     :table_id           true,
     :raw_column_id      false,
     :name               "Second",
     :display_name       "Second",
     :description        nil,
     :base_type          :TextField
     :visibility_type    :normal,
     :special_type       :category,
     :parent_id          false,
     :fk_target_field_id false,
     :last_analyzed      false
     :created_at         true,
     :updated_at         true}
    {:id                 true,
     :table_id           true,
     :raw_column_id      false,
     :name               "Third",
     :display_name       "Third",
     :description        nil,
     :base_type          :BooleanField
     :visibility_type    :normal,
     :special_type       nil,
     :parent_id          false,
     :fk_target_field_id false,
     :last_analyzed      false
     :created_at         true,
     :updated_at         true}]
   ;; add column, modify first column, add some nested fields
   [{:id                 true,
     :table_id           true,
     :raw_column_id      false,
     :name               "First",
     :display_name       "First",
     :description        nil,
     :base_type          :DecimalField
     :visibility_type    :normal,
     :special_type       :id,                 ; existing special types are NOT modified
     :parent_id          false,
     :fk_target_field_id false,
     :last_analyzed      false
     :created_at         true,
     :updated_at         true}
    {:id                 true,
     :table_id           true,
     :raw_column_id      false,
     :name               "Second",
     :display_name       "Second",
     :description        nil,
     :base_type          :TextField
     :visibility_type    :normal,
     :special_type       :category,
     :parent_id          false,
     :fk_target_field_id false,
     :last_analyzed      false
     :created_at         true,
     :updated_at         true}
    {:id                 true,
     :table_id           true,
     :raw_column_id      false,
     :name               "Third",
     :display_name       "Third",
     :description        nil,
     :base_type          :BooleanField
     :visibility_type    :normal,
     :special_type       nil,
     :parent_id          false,
     :fk_target_field_id false,
     :last_analyzed      false
     :created_at         true,
     :updated_at         true}
    {:id                 true,
     :table_id           true,
     :raw_column_id      false,
     :name               "rating",
     :display_name       "Rating",
     :description        nil,
     :base_type          :IntegerField
     :visibility_type    :normal,
     :special_type       :category,            ; should be infered from name
     :parent_id          false,
     :fk_target_field_id false,
     :last_analyzed      false
     :created_at         true,
     :updated_at         true}
    {:id                 true,
     :table_id           true,
     :raw_column_id      false,
     :name               "city",
     :display_name       "City",
     :description        nil,
     :base_type          :TextField
     :visibility_type    :normal,
     :special_type       :city,               ; should be infered from name
     :parent_id          true,                ; nested field
     :fk_target_field_id false,
     :last_analyzed      false
     :created_at         true,
     :updated_at         true}
    {:id                 true,
     :table_id           true,
     :raw_column_id      false,
     :name               "type",
     :display_name       "Type",
     :description        nil,
     :base_type          :TextField
     :visibility_type    :normal,
     :special_type       :category,            ; manually specified
     :parent_id          true,                 ; nested field
     :fk_target_field_id false,
     :last_analyzed      false
     :created_at         true,
     :updated_at         true}]
   ;; first column retired, 3rd column now a pk, another nested field
   [{:id                 true,
     :table_id           true,
     :raw_column_id      false,
     :name               "First",
     :display_name       "First",
     :description        nil,
     :base_type          :DecimalField
     :visibility_type    :normal,            ; fields are NOT retired automatically in dynamic schemas
     :special_type       :id,
     :parent_id          false,
     :fk_target_field_id false,
     :last_analyzed      false
     :created_at         true,
     :updated_at         true}
    {:id                 true,
     :table_id           true,
     :raw_column_id      false,
     :name               "Second",
     :display_name       "Second",
     :description        nil,
     :base_type          :TextField
     :visibility_type    :normal,
     :special_type       :category,
     :parent_id          false,
     :fk_target_field_id false,
     :last_analyzed      false
     :created_at         true,
     :updated_at         true}
    {:id                 true,
     :table_id           true,
     :raw_column_id      false,
     :name               "Third",
     :display_name       "Third",
     :description        nil,
     :base_type          :BooleanField
     :visibility_type    :normal,
     :special_type       :id,                  ; special type can be set if it was nil before
     :parent_id          false,
     :fk_target_field_id false,
     :last_analyzed      false
     :created_at         true,
     :updated_at         true}
    {:id                 true,
     :table_id           true,
     :raw_column_id      false,
     :name               "rating",
     :display_name       "Rating",
     :description        nil,
     :base_type          :IntegerField
     :visibility_type    :normal,
     :special_type       :category,            ; should be infered from name
     :parent_id          false,
     :fk_target_field_id false,
     :last_analyzed      false
     :created_at         true,
     :updated_at         true}
    {:id                 true,
     :table_id           true,
     :raw_column_id      false,
     :name               "city",
     :display_name       "City",
     :description        nil,
     :base_type          :TextField
     :visibility_type    :normal,
     :special_type       :city,               ; should be infered from name
     :parent_id          true,                ; nested field
     :fk_target_field_id false,
     :last_analyzed      false
     :created_at         true,
     :updated_at         true}
    {:id                 true,
     :table_id           true,
     :raw_column_id      false,
     :name               "type",
     :display_name       "Type",
     :description        nil,
     :base_type          :TextField
     :visibility_type    :normal,
     :special_type       :category,            ; manually specified
     :parent_id          true,                 ; nested field
     :fk_target_field_id false,
     :last_analyzed      false
     :created_at         true,
     :updated_at         true}
    {:id                 true,
     :table_id           true,
     :raw_column_id      false,
     :name               "new",
     :display_name       "New",
     :description        nil,
     :base_type          :BooleanField
     :visibility_type    :normal,
     :special_type       nil,
     :parent_id          true,                 ; nested field
     :fk_target_field_id false,
     :last_analyzed      false
     :created_at         true,
     :updated_at         true}]]
  (tu/with-temp* [database/Database   [{database-id :id}]
                  raw-table/RawTable  [{raw-table-id :id, :as table} {:database_id database-id}]
                  table/Table         [{table-id :id, :as tbl} {:db_id database-id, :raw_table_id raw-table-id}]]
    (let [get-fields #(->> (db/sel :many field/Field :table_id table-id)
                           (mapv tu/boolean-ids-and-timestamps)
                           (mapv (fn [m]
                                   (dissoc m :active :field_type :position :preview_display))))]
      ;; start with no fields
      [(get-fields)
       ;; first sync will add all the fields
       (do
         (save-table-fields! tbl [{:name "First", :base-type :IntegerField, :pk? true}
                                  {:name "Second", :base-type :TextField, :special-type :category}
                                  {:name "Third", :base-type :BooleanField}])
         (get-fields))
       ;; now add another column (with nested-fields!) and modify the first
       (do
         (save-table-fields! tbl [{:name "First", :base-type :DecimalField, :pk? false}
                                  {:name "Second", :base-type :TextField, :special-type :category}
                                  {:name "Third", :base-type :BooleanField}
                                  {:name "rating", :base-type :IntegerField, :nested-fields [{:name "city", :base-type :TextField}
                                                                                             {:name "type", :base-type :TextField, :special-type :category}]}])
         (get-fields))
       ;; now remove the first column (should have no effect), and make tweaks to the nested columns
       (do
         (save-table-fields! tbl [{:name "Second", :base-type :TextField, :special-type :category}
                                  {:name "Third", :base-type :BooleanField, :pk? true}
                                  {:name "rating", :base-type :IntegerField, :nested-fields [{:name "new", :base-type :BooleanField}]}])
         (get-fields))])))


;; TODO: update-data-models-for-table!

;; TODO: update-data-models-from-raw-tables!
;; make sure to test case where FK relationship tables are out of order
