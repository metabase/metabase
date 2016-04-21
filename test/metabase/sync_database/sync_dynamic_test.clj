(ns metabase.sync-database.sync-dynamic-test
  (:require [expectations :refer :all]
            [korma.core :as k]
            [metabase.db :as db]
            [metabase.mock.toucanery :as toucanery]
            [metabase.models.database :as database]
            [metabase.models.field :as field]
            [metabase.models.hydrate :as hydrate]
            [metabase.models.raw-table :as raw-table]
            [metabase.models.table :as table]
            [metabase.sync-database.introspect :as introspect]
            [metabase.sync-database.sync-dynamic :refer :all]
            [metabase.test.util :as tu]))

(tu/resolve-private-fns metabase.sync-database.sync-dynamic
  save-table-fields!)

(defn- get-tables [database-id]
  (->> (hydrate/hydrate (db/sel :many table/Table :db_id database-id (k/order :id)) :fields)
       (mapv tu/boolean-ids-and-timestamps)))


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
    (let [get-fields #(->> (db/sel :many field/Field :table_id table-id (k/order :id))
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


;; scan-table-and-update-data-model!
(expect
  [[(last toucanery/toucanery-tables-and-fields)]
   [(last toucanery/toucanery-tables-and-fields)]
   [(-> (last toucanery/toucanery-tables-and-fields)
       (assoc :active false
              :fields []))]]
  (tu/with-temp* [database/Database [{database-id :id, :as db} {:engine :toucanery}]]
    (let [driver (toucanery/->ToucaneryDriver)]
      ;; do a quick introspection to add the RawTables to the db
      (introspect/introspect-database-and-update-raw-tables! driver db)
      ;; stub out the Table we are going to sync for real below
      (let [raw-table-id (db/sel :one :field [raw-table/RawTable :id] :database_id database-id, :name "transactions")
            tbl          (db/ins table/Table
                           :db_id        database-id
                           :raw_table_id raw-table-id
                           :name         "transactions"
                           :active       true)]
        [;; now lets run a sync and check what we got
         (do
           (scan-table-and-update-data-model! driver db tbl)
           (get-tables database-id))
         ;; run the sync a second time to see how we respond to repeat syncing (should be same since nothing changed)
         (do
           (scan-table-and-update-data-model! driver db tbl)
           (get-tables database-id))
         ;; one more time, but lets disable the table this time and ensure that's handled properly
         (do
           (k/update raw-table/RawTable
             (k/set-fields {:active false})
             (k/where {:database_id database-id, :name "transactions"}))
           (scan-table-and-update-data-model! driver db tbl)
           (get-tables database-id))]))))


;; scan-database-and-update-data-model!
(expect
  [toucanery/toucanery-raw-tables-and-columns
   toucanery/toucanery-tables-and-fields
   toucanery/toucanery-tables-and-fields
   (conj (vec (drop-last toucanery/toucanery-tables-and-fields))
         (-> (last toucanery/toucanery-tables-and-fields)
             (assoc :active false
                    :fields [])))]
  (tu/with-temp* [database/Database [{database-id :id, :as db} {:engine :toucanery}]]
    (let [driver (toucanery/->ToucaneryDriver)]
      ;; do a quick introspection to add the RawTables to the db
      (introspect/introspect-database-and-update-raw-tables! driver db)

      [;; first check that the raw tables stack up as expected, especially that fields were skipped because this is a :dynamic-schema db
       (->> (hydrate/hydrate (db/sel :many raw-table/RawTable :database_id database-id (k/order :id)) :columns)
            (mapv tu/boolean-ids-and-timestamps))
       ;; now lets run a sync and check what we got
       (do
         (scan-database-and-update-data-model! driver db)
         (get-tables database-id))
       ;; run the sync a second time to see how we respond to repeat syncing (should be same since nothing changed)
       (do
         (scan-database-and-update-data-model! driver db)
         (get-tables database-id))
       ;; one more time, but lets disable a table this time and ensure that's handled properly
       (do
         (k/update raw-table/RawTable
           (k/set-fields {:active false})
           (k/where {:database_id database-id, :name "transactions"}))
         (scan-database-and-update-data-model! driver db)
         (get-tables database-id))])))
