(ns metabase.sync-database.sync-test
  (:require [expectations :refer :all]
            [metabase.db :as db]
            [metabase.mock.moviedb :as moviedb]
            [metabase.models.database :as database]
            [metabase.models.field :as field]
            [metabase.models.hydrate :as hydrate]
            [metabase.models.raw-column :as raw-column]
            [metabase.models.raw-table :as raw-table]
            [metabase.models.table :as table]
            [metabase.sync-database.introspect :as introspect]
            [metabase.sync-database.sync :refer :all]
            [metabase.test.util :as tu]))

(tu/resolve-private-fns metabase.sync-database.sync
  save-fks! save-table-fields!)


;; save-fks!
(expect
  [[{:special_type nil, :name "fk1", :fk_target_field_id false}]
   [{:special_type :fk, :name "fk1", :fk_target_field_id true}]
   [{:special_type :fk, :name "fk1", :fk_target_field_id true}]
   [{:special_type :fk, :name "fk1", :fk_target_field_id true}]]
  (tu/with-temp* [database/Database    [{database-id :id}]
                  raw-table/RawTable   [{raw-table-id1 :id, :as table} {:database_id database-id, :name "fk_source"}]
                  raw-column/RawColumn [{raw-fk1 :id} {:raw_table_id raw-table-id1, :name "fk1"}]
                  table/Table          [{t1 :id} {:db_id database-id, :raw_table_id raw-table-id1, :name "fk_source"}]
                  field/Field          [{fk1 :id} {:table_id t1, :raw_column_id raw-fk1, :name "fk1"}]
                  raw-table/RawTable   [{raw-table-id2 :id, :as table1} {:database_id database-id, :name "fk_target"}]
                  raw-column/RawColumn [{raw-target1 :id} {:raw_table_id raw-table-id2, :name "target1"}]
                  raw-column/RawColumn [{raw-target2 :id} {:raw_table_id raw-table-id2, :name "target2"}]
                  table/Table          [{t2 :id} {:db_id database-id, :raw_table_id raw-table-id2, :name "fk_target"}]
                  field/Field          [{target1 :id} {:table_id t2, :raw_column_id raw-target1, :name "target1"}]
                  field/Field          [{target2 :id} {:table_id t2, :raw_column_id raw-target2, :name "target2"}]]
    (let [get-fields #(->> (db/sel :many :fields [field/Field :name :special_type :fk_target_field_id] :table_id %)
                           (mapv tu/boolean-ids-and-timestamps))]
      [;; original list should not have any fks
       (get-fields t1)
       ;; now add a fk
       (do
         (save-fks! [{:source-column raw-fk1, :target-column raw-target1}])
         (get-fields t1))
       ;; if the source/target is wack nothing bad happens
       (do
         (save-fks! [{:source-column raw-fk1, :target-column 87893243}
                     {:source-column 987234, :target-column raw-target1}])
         (get-fields t1))
       ;; replacing an existing fk
       (do
         (save-fks! [{:source-column raw-fk1, :target-column raw-target2}])
         (get-fields t1))])))


;; sync-metabase-metadata-table!
(expect
  [{:name "movies"
    :description nil
    :id true
    :fields [{:name "filming"
              :description nil}]}
   {:name "movies"
    :description "A cinematic adventure."
    :id true
    :fields [{:name "filming"
              :description "If the movie is currently being filmed."}]}]
  (tu/with-temp* [database/Database [{database-id :id, :as db} {:engine :moviedb}]]
    ;; setup a couple things we'll use in the test
    (introspect/introspect-database-and-update-raw-tables! (moviedb/->MovieDbDriver) db)
    (let [raw-table-id (db/sel :one :field [raw-table/RawTable :id] :database_id database-id, :name "movies")
          table        (db/ins table/Table
                         :db_id        database-id
                         :raw_table_id raw-table-id
                         :name         "movies"
                         :active       true)
          get-table    #(-> (db/sel :one :fields [table/Table :id :name :description] :id (:id table))
                            (hydrate/hydrate :fields)
                            (update :fields (fn [fields]
                                              (for [f fields
                                                    :when (= "filming" (:name f))]
                                                (select-keys f [:name :description]))))
                            tu/boolean-ids-and-timestamps)]

      (try (update-data-models-for-table! table)
           (catch Throwable t
             (.printStackTrace t)))
      ;; here we go
      [(get-table)
       (do
         (sync-metabase-metadata-table! (moviedb/->MovieDbDriver) db {})
         (get-table))])))


;; save-table-fields!
;; this test also covers create-field! and update-field!
(expect
  [[]
   ;; initial sync
   [{:id                 true
     :table_id           true
     :raw_column_id      true
     :name               "First"
     :display_name       "First"
     :description        nil
     :base_type          :IntegerField
     :visibility_type    :normal
     :special_type       :id
     :parent_id          false
     :fk_target_field_id false
     :last_analyzed      false
     :created_at         true
     :updated_at         true}
    {:id                 true
     :table_id           true
     :raw_column_id      true
     :name               "Second"
     :display_name       "Second"
     :description        nil
     :base_type          :TextField
     :visibility_type    :normal
     :special_type       :category
     :parent_id          false
     :fk_target_field_id false
     :last_analyzed      false
     :created_at         true
     :updated_at         true}
    {:id                 true
     :table_id           true
     :raw_column_id      true
     :name               "Third"
     :display_name       "Third"
     :description        nil
     :base_type          :BooleanField
     :visibility_type    :normal
     :special_type       nil
     :parent_id          false
     :fk_target_field_id false
     :last_analyzed      false
     :created_at         true
     :updated_at         true}]
   ;; add column, modify first column
   [{:id                 true
     :table_id           true
     :raw_column_id      true
     :name               "First"
     :display_name       "First"
     :description        nil
     :base_type          :DecimalField
     :visibility_type    :normal
     :special_type       :id,                 ; existing special types are NOT modified
     :parent_id          false
     :fk_target_field_id false
     :last_analyzed      false
     :created_at         true
     :updated_at         true}
    {:id                 true
     :table_id           true
     :raw_column_id      true
     :name               "Second"
     :display_name       "Second"
     :description        nil
     :base_type          :TextField
     :visibility_type    :normal
     :special_type       :category
     :parent_id          false
     :fk_target_field_id false
     :last_analyzed      false
     :created_at         true
     :updated_at         true}
    {:id                 true
     :table_id           true
     :raw_column_id      true
     :name               "Third"
     :display_name       "Third"
     :description        nil
     :base_type          :BooleanField
     :visibility_type    :normal
     :special_type       nil
     :parent_id          false
     :fk_target_field_id false
     :last_analyzed      false
     :created_at         true
     :updated_at         true}
    {:id                 true
     :table_id           true
     :raw_column_id      true
     :name               "rating"
     :display_name       "Rating"
     :description        nil
     :base_type          :IntegerField
     :visibility_type    :normal
     :special_type       :category,            ; should be infered from name
     :parent_id          false
     :fk_target_field_id false
     :last_analyzed      false
     :created_at         true
     :updated_at         true}]
   ;; first column retired, 3rd column now a pk
   [{:id                 true
     :table_id           true
     :raw_column_id      true
     :name               "First"
     :display_name       "First"
     :description        nil
     :base_type          :DecimalField
     :visibility_type    :retired,            ; field retired when RawColumn disabled
     :special_type       :id
     :parent_id          false
     :fk_target_field_id false
     :last_analyzed      false
     :created_at         true
     :updated_at         true}
    {:id                 true
     :table_id           true
     :raw_column_id      true
     :name               "Second"
     :display_name       "Second"
     :description        nil
     :base_type          :TextField
     :visibility_type    :normal
     :special_type       :category
     :parent_id          false
     :fk_target_field_id false
     :last_analyzed      false
     :created_at         true
     :updated_at         true}
    {:id                 true
     :table_id           true
     :raw_column_id      true
     :name               "Third"
     :display_name       "Third"
     :description        nil
     :base_type          :BooleanField
     :visibility_type    :normal
     :special_type       :id,                  ; special type can be set if it was nil before
     :parent_id          false
     :fk_target_field_id false
     :last_analyzed      false
     :created_at         true
     :updated_at         true}
    {:id                 true
     :table_id           true
     :raw_column_id      true
     :name               "rating"
     :display_name       "Rating"
     :description        nil
     :base_type          :IntegerField
     :visibility_type    :normal
     :special_type       :category,            ; should be infered from name
     :parent_id          false
     :fk_target_field_id false
     :last_analyzed      false
     :created_at         true
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
                                   (dissoc m :active :field_type :position :preview_display))))
          initial-fields (get-fields)
          first-sync     (do
                           (save-table-fields! tbl)
                           (get-fields))]
      (tu/with-temp* [raw-column/RawColumn [_ {:raw_table_id raw-table-id, :name "rating", :base_type "IntegerField"}]]
        ;; start with no fields
        [initial-fields
         ;; first sync will add all the fields
         first-sync
         ;; now add another column and modify the first
         (do
           (db/upd raw-column/RawColumn raw-column-id1 :is_pk false, :base_type "DecimalField")
           (save-table-fields! tbl)
           (get-fields))
         ;; now disable the first column
         (do
           (db/upd raw-column/RawColumn raw-column-id1 :active false)
           (db/upd raw-column/RawColumn raw-column-id3 :is_pk true)
           (save-table-fields! tbl)
           (get-fields))]))))


;; TODO: retire-tables!

;; TODO: update-data-models-for-table!

;; TODO: update-data-models-from-raw-tables!
;; make sure to test case where FK relationship tables are out of order
