(ns metabase.sync-database.introspect-test
  (:require [expectations :refer :all]
            [korma.core :as k]
            [metabase.db :as db]
            [metabase.mock.moviedb :as moviedb]
            [metabase.models.database :as database]
            [metabase.models.hydrate :as hydrate]
            [metabase.models.raw-column :refer [RawColumn], :as raw-column]
            [metabase.models.raw-table :refer [RawTable], :as raw-table]
            [metabase.sync-database.introspect :as introspect]
            [metabase.test.util :as tu]))

(tu/resolve-private-fns metabase.sync-database.introspect
  save-all-table-columns! save-all-table-fks! create-raw-table! update-raw-table! disable-raw-tables!)

(defn get-tables [database-id]
  (->> (hydrate/hydrate (db/sel :many RawTable :database_id database-id (k/order :id)) :columns)
       (mapv tu/boolean-ids-and-timestamps)))

(defn get-table [table-id]
  (->> (hydrate/hydrate (db/sel :one RawTable :raw_table_id table-id) :columns)
       (mapv tu/boolean-ids-and-timestamps)))

;; save-all-table-fks
;; test case of multi schema with repeating table names
(expect
  [[{:id                  true
     :raw_table_id        true
     :name                "id"
     :active              true
     :column_type         nil
     :is_pk               false
     :fk_target_column_id false
     :details             {}
     :created_at          true
     :updated_at          true}
    {:id                  true
     :raw_table_id        true
     :name                "user_id"
     :active              true
     :column_type         nil
     :is_pk               false
     :fk_target_column_id false
     :details             {}
     :created_at          true
     :updated_at          true}]
   [{:id                  true
     :raw_table_id        true
     :name                "id"
     :active              true
     :column_type         nil
     :is_pk               false
     :fk_target_column_id false
     :details             {}
     :created_at          true
     :updated_at          true}
    {:id                  true
     :raw_table_id        true
     :name                "user_id"
     :active              true
     :column_type         nil
     :is_pk               false
     :fk_target_column_id true
     :details             {}
     :created_at          true
     :updated_at          true}]
   [{:id                  true
     :raw_table_id        true
     :name                "id"
     :active              true
     :column_type         nil
     :is_pk               false
     :fk_target_column_id false
     :details             {}
     :created_at          true
     :updated_at          true}
    {:id                  true
     :raw_table_id        true
     :name                "user_id"
     :active              true
     :column_type         nil
     :is_pk               false
     :fk_target_column_id false
     :details             {}
     :created_at          true
     :updated_at          true}]
   [{:id                  true
     :raw_table_id        true
     :name                "id"
     :active              true
     :column_type         nil
     :is_pk               false
     :fk_target_column_id false
     :details             {}
     :created_at          true
     :updated_at          true}
    {:id                  true
     :raw_table_id        true
     :name                "user_id"
     :active              true
     :column_type         nil
     :is_pk               false
     :fk_target_column_id true
     :details             {}
     :created_at          true
     :updated_at          true}]]
  (tu/with-temp* [database/Database  [{database-id :id}]
                  raw-table/RawTable  [{raw-table-id1 :id, :as table} {:database_id database-id, :schema "customer1", :name "photos"}]
                  raw-column/RawColumn [_ {:raw_table_id raw-table-id1, :name "id"}]
                  raw-column/RawColumn [_ {:raw_table_id raw-table-id1, :name "user_id"}]
                  raw-table/RawTable  [{raw-table-id2 :id, :as table1} {:database_id database-id, :schema "customer2", :name "photos"}]
                  raw-column/RawColumn [_ {:raw_table_id raw-table-id2, :name "id"}]
                  raw-column/RawColumn [_ {:raw_table_id raw-table-id2, :name "user_id"}]
                  raw-table/RawTable  [{raw-table-id3 :id, :as table2} {:database_id database-id, :schema nil, :name "users"}]
                  raw-column/RawColumn [_ {:raw_table_id raw-table-id3, :name "id"}]]
    (let [get-columns #(->> (db/sel :many RawColumn :raw_table_id raw-table-id1 (k/order :id))
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

;; save-all-table-columns
(expect
  [[]
   [{:id           true
     :raw_table_id true
     :active       true
     :name         "beak_size"
     :column_type  nil
     :is_pk        true
     :fk_target_column_id false
     :details      {:inches 7, :special-type "category", :base-type "IntegerField"}
     :created_at   true
     :updated_at   true}]
   [{:id           true
     :raw_table_id true
     :active       true
     :name         "beak_size"
     :column_type  nil
     :is_pk        false
     :fk_target_column_id false
     :details      {:inches 8, :base-type "IntegerField"}
     :created_at   true
     :updated_at   true}
    {:id           true
     :raw_table_id true
     :active       true
     :name         "num_feathers"
     :column_type  nil
     :is_pk        false
     :fk_target_column_id false
     :details      {:count 10000, :base-type "IntegerField"}
     :created_at   true
     :updated_at   true}]
   [{:id           true
     :raw_table_id true
     :active       false
     :name         "beak_size"
     :column_type  nil
     :is_pk        false
     :fk_target_column_id false
     :details      {:inches 8, :base-type "IntegerField"}
     :created_at   true
     :updated_at   true}
    {:id           true
     :raw_table_id true
     :active       true
     :name         "num_feathers"
     :column_type  nil
     :is_pk        false
     :fk_target_column_id false
     :details      {:count 12000, :base-type "IntegerField"}
     :created_at   true
     :updated_at   true}]
   [{:id           true
     :raw_table_id true
     :active       true
     :name         "beak_size"
     :column_type  nil
     :is_pk        false
     :fk_target_column_id false
     :details      {:inches 8, :base-type "IntegerField"}
     :created_at   true
     :updated_at   true}
    {:id           true
     :raw_table_id true
     :active       true
     :name         "num_feathers"
     :column_type  nil
     :is_pk        false
     :fk_target_column_id false
     :details      {:count 12000, :base-type "IntegerField"}
     :created_at   true
     :updated_at   true}]]
  (tu/with-temp* [database/Database  [{database-id :id}]
                  raw-table/RawTable [{raw-table-id :id, :as table} {:database_id database-id}]]
    (let [get-columns #(->> (db/sel :many RawColumn :raw_table_id raw-table-id (k/order :id))
                            (mapv tu/boolean-ids-and-timestamps))]
      ;; original list should be empty
      [(get-columns)
       ;; now add a column
       (do
         (save-all-table-columns! table [{:name "beak_size", :base-type :IntegerField, :details {:inches 7}, :pk? true, :special-type "category"}])
         (get-columns))
       ;; now add another column and modify the first
       (do
         (save-all-table-columns! table [{:name "beak_size", :base-type :IntegerField, :details {:inches 8}}
                                         {:name "num_feathers", :base-type :IntegerField, :details {:count 10000}}])
         (get-columns))
       ;; now remove the first column
       (do
         (save-all-table-columns! table [{:name "num_feathers", :base-type :IntegerField, :details {:count 12000}}])
         (get-columns))
       ;; lastly, resurrect the first column (this ensures uniqueness by name)
       (do
         (save-all-table-columns! table [{:name "beak_size", :base-type :IntegerField, :details {:inches 8}}
                                         {:name "num_feathers", :base-type :IntegerField, :details {:count 12000}}])
         (get-columns))])))

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
     :created_at  true
     :updated_at  true}]
   [{:id          true
     :database_id true
     :active      true
     :schema      nil
     :name        "users"
     :details     {:a "b"}
     :columns     []
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
                    :column_type  nil
                    :is_pk        true
                    :fk_target_column_id false
                    :details      {:inches 7, :base-type "IntegerField"}
                    :created_at   true
                    :updated_at   true}]
     :created_at  true
     :updated_at  true}]]
  (tu/with-temp* [database/Database [{database-id :id, :as db}]]
    [(get-tables database-id)
     ;; now add a table
     (do
       (create-raw-table! database-id {:schema nil
                                       :name "users"
                                       :details {:a "b"}
                                       :fields []})
       (get-tables database-id))
     ;; now add another table, this time with a couple columns and some fks
     (do
       (create-raw-table! database-id {:schema "aviary"
                                       :name "toucanery"
                                       :details {:owner "Cam"}
                                       :fields [{:name      "beak_size"
                                                  :base-type :IntegerField
                                                  :pk?       true
                                                  :details   {:inches 7}}]})
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
                    :column_type  nil
                    :is_pk        true
                    :fk_target_column_id false
                    :details      {:inches 7, :base-type "IntegerField"}
                    :created_at   true
                    :updated_at   true}]
     :created_at  true
     :updated_at  true}]]
  (tu/with-temp* [database/Database  [{database-id :id, :as db}]
                  raw-table/RawTable [table {:database_id database-id
                                             :schema      "aviary"
                                             :name        "toucanery"
                                             :details     {:owner "Cam"}}]]
    [(get-tables database-id)
     ;; now update the table
     (do
       (update-raw-table! table {:schema  "aviary"
                                 :name    "toucanery"
                                 :details {:owner "Cam", :sqft 10000}
                                 :fields [{:name      "beak_size"
                                            :base-type :IntegerField
                                            :pk?       true
                                            :details   {:inches 7}}]})
       (get-tables database-id))]))


;; disable-raw-tables
(expect
  [[{:id          true
     :database_id true
     :active      true
     :schema      "a"
     :name        "1"
     :details     {}
     :columns     [{:raw_table_id true
                    :name "size"
                    :fk_target_column_id false
                    :updated_at true
                    :details {}
                    :active true
                    :id true
                    :is_pk false
                    :created_at true
                    :column_type nil}]
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
                    :column_type  nil
                    :is_pk        false
                    :fk_target_column_id true
                    :details      {}
                    :created_at   true
                    :updated_at   true}]
     :created_at  true
     :updated_at  true}]
   [{:id          true
     :database_id true
     :active      false
     :schema      "a"
     :name        "1"
     :details     {}
     :columns     [{:raw_table_id true
                    :name "size"
                    :fk_target_column_id false
                    :updated_at true
                    :details {}
                    :active false
                    :id true
                    :is_pk false
                    :created_at true
                    :column_type nil}]
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
                    :column_type  nil
                    :is_pk        false
                    :fk_target_column_id false
                    :details      {}
                    :created_at   true
                    :updated_at   true}]
     :created_at  true
     :updated_at  true}]]
  (tu/with-temp* [database/Database    [{database-id :id, :as db}]
                  raw-table/RawTable   [t1 {:database_id database-id, :schema "a", :name "1"}]
                  raw-column/RawColumn [c1 {:raw_table_id (:id t1), :name "size"}]
                  raw-table/RawTable   [t2 {:database_id database-id, :schema "a", :name "2"}]
                  raw-column/RawColumn [c2 {:raw_table_id (:id t2), :name "beak_size", :fk_target_column_id (:id c1)}]]
    [(get-tables database-id)
     (do
       (disable-raw-tables! [(:id t1) (:id t2)])
       (get-tables database-id))]))


;; TODO: introspect-raw-table-and-update!
;; TODO: test that table details get updated, and fks update if defined
;; TODO: test case where table being synced has been removed
;; TODO: test that dynamic-schema dbs skip the table sync


;; introspect-database-and-update-raw-tables!
;; TODO: test that dynamic-schema dbs skip the table sync
(expect
  [[]
   moviedb/moviedb-raw-tables
   moviedb/moviedb-raw-tables
   (conj (vec (drop-last moviedb/moviedb-raw-tables))
         (-> (last moviedb/moviedb-raw-tables)
             (assoc :active false)
             (update :columns #(map (fn [col]
                                      (assoc col
                                        :active              false
                                        :fk_target_column_id false)) %))))]
  (tu/with-temp* [database/Database [{database-id :id, :as db} {:engine :moviedb}]]
    [(get-tables database-id)
     ;; first sync should add all the tables, fields, etc
     (do
       (introspect/introspect-database-and-update-raw-tables! (moviedb/->MovieDbDriver) db)
       (get-tables database-id))
     ;; run the sync a second time to see how we respond to repeat syncing
     (do
       (introspect/introspect-database-and-update-raw-tables! (moviedb/->MovieDbDriver) db)
       (get-tables database-id))
     ;; one more time, but this time we'll remove a table and make sure that's handled properly
     (do
       (introspect/introspect-database-and-update-raw-tables! (moviedb/->MovieDbDriver) (assoc db :exclude-tables #{"roles"}))
       (get-tables database-id))]))
