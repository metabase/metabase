(ns metabase.models.raw-table-test
  (:require [expectations :refer :all]
            [metabase.db :as db]
            [metabase.models.database :as database]
            [metabase.models.hydrate :as hydrate]
            [metabase.models.raw-table :refer [RawTable], :as raw-table]
            [metabase.models.raw-column :as raw-column]
            [metabase.test.util :as tu]))

(defn get-tables [database-id]
  (->> (hydrate/hydrate (db/sel :many RawTable :database_id database-id) :columns)
       (mapv tu/boolean-ids-and-timestamps)))

;; create-raw-table
(expect
  [[]
   [{:id          true
     :database_id true
     :active      true
     :schema      nil
     :name        "users"
     :details     {:a "b"}
     :columns     []
     :fks         nil
     :created_at  true
     :updated_at  true}]
   [{:id          true
     :database_id true
     :active      true
     :schema      nil
     :name        "users"
     :details     {:a "b"}
     :columns     []
     :fks         nil
     :created_at  true
     :updated_at  true}
    {:id          true
     :database_id true
     :active      true
     :schema      "aviary"
     :name        "toucanery"
     :details     {:owner "Cam"}
     :columns     [{:id           true
                    :raw_table_id true
                    :active       true
                    :name         "beak_size"
                    :base_type    :IntegerField
                    :details      {:inches 7}
                    :created_at   true
                    :updated_at   true}]
     :fks         [{:a "b"}]
     :created_at  true
     :updated_at  true}]]
  (tu/with-temp* [database/Database [{database-id :id, :as db}]]
    [(get-tables database-id)
     ;; now add a table
     (do
       (raw-table/create-raw-table database-id {:schema nil,
                                                :name "users",
                                                :details {:a "b"}
                                                :columns []})
       (get-tables database-id))
     ;; now add another table, this time with a couple columns and some fks
     (do
       (raw-table/create-raw-table database-id {:schema "aviary",
                                                :name "toucanery",
                                                :details {:owner "Cam"}
                                                :columns [{:name "beak_size",
                                                           :base_type :IntegerField,
                                                           :details {:inches 7}}]
                                                :fks     [{:a "b"}]})
       (get-tables database-id))]))


;; update-raw-table
(expect
  [[{:id          true
     :database_id true
     :active      true
     :schema      "aviary"
     :name        "toucanery"
     :details     {:owner "Cam"}
     :columns     []
     :fks         [{:a "b"}]
     :created_at  true
     :updated_at  true}]
   [{:id          true
     :database_id true
     :active      true
     :schema      "aviary"
     :name        "toucanery"
     :details     {:owner "Cam", :sqft 10000}
     :columns     [{:id           true
                    :raw_table_id true
                    :active       true
                    :name         "beak_size"
                    :base_type    :IntegerField
                    :details      {:inches 7}
                    :created_at   true
                    :updated_at   true}]
     :fks         nil
     :created_at  true
     :updated_at  true}]]
  (tu/with-temp* [database/Database  [{database-id :id, :as db}]
                  raw-table/RawTable [table {:database_id database-id
                                             :schema      "aviary",
                                             :name        "toucanery",
                                             :details     {:owner "Cam"}
                                             :fks         [{:a "b"}]}]]
    [(get-tables database-id)
     ;; now update the table
     (do
       (raw-table/update-raw-table table {:schema  "aviary",
                                                :name    "toucanery",
                                                :details {:owner "Cam", :sqft 10000}
                                                :columns [{:name      "beak_size",
                                                           :base_type :IntegerField,
                                                           :details   {:inches 7}}]
                                                :fks     nil})
       (get-tables database-id))]))


;; disable-raw-tables
(expect
  [[{:id          true
     :database_id true
     :active      true
     :schema      "a"
     :name        "1"
     :details     {}
     :columns     []
     :fks         nil
     :created_at  true
     :updated_at  true}
    {:id          true
     :database_id true
     :active      true
     :schema      "a"
     :name        "2"
     :details     {}
     :columns     [{:id           true
                    :raw_table_id true
                    :active       true
                    :name         "beak_size"
                    :base_type    :IntegerField
                    :details      {}
                    :created_at   true
                    :updated_at   true}]
     :fks         nil
     :created_at  true
     :updated_at  true}]
   [{:id          true
     :database_id true
     :active      false
     :schema      "a"
     :name        "1"
     :details     {}
     :columns     []
     :fks         nil
     :created_at  true
     :updated_at  true}
    {:id          true
     :database_id true
     :active      false
     :schema      "a"
     :name        "2"
     :details     {}
     :columns     [{:id           true
                    :raw_table_id true
                    :active       false
                    :name         "beak_size"
                    :base_type    :IntegerField
                    :details      {}
                    :created_at   true
                    :updated_at   true}]
     :fks         nil
     :created_at  true
     :updated_at  true}]]
  (tu/with-temp* [database/Database    [{database-id :id, :as db}]
                  raw-table/RawTable   [t1 {:database_id database-id, :schema "a", :name "1"}]
                  raw-table/RawTable   [t2 {:database_id database-id, :schema "a", :name "2"}]
                  raw-column/RawColumn [c1 {:raw_table_id (:id t2), :name "beak_size", :base_type :IntegerField}]]
    [(get-tables database-id)
     (do
       (raw-table/disable-raw-tables [(:id t1) (:id t2)])
       (get-tables database-id))]))
