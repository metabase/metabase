(ns metabase.models.raw-column-test
  (:require [expectations :refer :all]
            [metabase.db :as db]
            [metabase.models.database :as database]
            [metabase.models.raw-table :as raw-table]
            [metabase.models.raw-column :refer [RawColumn], :as raw-column]
            [metabase.test.util :as tu]))

(expect
  [[]
   [{:id           true,
     :raw_table_id true,
     :active       true,
     :name         "beak_size",
     :base_type    :IntegerField
     :is_pk        true
     :details      {:inches 7, :special-type "category"},
     :created_at   true,
     :updated_at   true}]
   [{:id           true,
     :raw_table_id true,
     :active       true,
     :name         "beak_size",
     :base_type    :IntegerField
     :is_pk        false
     :details      {:inches 8},
     :created_at   true,
     :updated_at   true}
    {:id           true,
     :raw_table_id true,
     :active       true,
     :name         "num_feathers",
     :base_type    :IntegerField
     :is_pk        false
     :details      {:count 10000},
     :created_at   true,
     :updated_at   true}]
   [{:id           true,
     :raw_table_id true,
     :active       false,
     :name         "beak_size",
     :base_type    :IntegerField
     :is_pk        false
     :details      {:inches 8},
     :created_at   true,
     :updated_at   true}
    {:id           true,
     :raw_table_id true,
     :active       true,
     :name         "num_feathers",
     :base_type    :IntegerField
     :is_pk        false
     :details      {:count 12000},
     :created_at   true,
     :updated_at   true}]
   [{:id           true,
     :raw_table_id true,
     :active       true,
     :name         "beak_size",
     :base_type    :IntegerField
     :is_pk        false
     :details      {:inches 8},
     :created_at   true,
     :updated_at   true}
    {:id           true,
     :raw_table_id true,
     :active       true,
     :name         "num_feathers",
     :base_type    :IntegerField
     :is_pk        false
     :details      {:count 12000},
     :created_at   true,
     :updated_at   true}]]
  (tu/with-temp* [database/Database  [{database-id :id}]
                  raw-table/RawTable [{raw-table-id :id, :as table} {:database_id database-id}]]
    (let [get-columns #(->> (db/sel :many RawColumn :raw_table_id raw-table-id)
                            (mapv tu/boolean-ids-and-timestamps))]
      ;; original list should be empty
      [(get-columns)
       ;; now add a column
       (do
         (raw-column/save-all-table-columns table [{:name "beak_size", :base-type :IntegerField, :details {:inches 7}, :pk? true, :special-type "category"}])
         (get-columns))
       ;; now add another column and modify the first
       (do
         (raw-column/save-all-table-columns table [{:name "beak_size", :base-type :IntegerField, :details {:inches 8}}
                                                   {:name "num_feathers", :base-type :IntegerField, :details {:count 10000}}])
         (get-columns))
       ;; now remove the first column
       (do
         (raw-column/save-all-table-columns table [{:name "num_feathers", :base-type :IntegerField, :details {:count 12000}}])
         (get-columns))
       ;; lastly, resurrect the first column (this ensures uniqueness by name)
       (do
         (raw-column/save-all-table-columns table [{:name "beak_size", :base-type :IntegerField, :details {:inches 8}}
                                                    {:name "num_feathers", :base-type :IntegerField, :details {:count 12000}}])
         (get-columns))])))
