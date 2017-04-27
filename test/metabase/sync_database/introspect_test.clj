(ns metabase.sync-database.introspect-test
  (:require [expectations :refer :all]
            [metabase.models
             [database :refer [Database]]
             [raw-column :refer [RawColumn]]
             [raw-table :refer [RawTable]]]
            [metabase.sync-database.introspect :as introspect]
            [metabase.test.mock.moviedb :as moviedb]
            [metabase.test.util :as tu]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]
            [toucan.util.test :as tt]))

(tu/resolve-private-vars metabase.sync-database.introspect
  save-all-table-columns! save-all-table-fks! create-raw-table! update-raw-table! disable-raw-tables!)

(defn get-tables [database-id]
  (->> (hydrate (db/select RawTable, :database_id database-id, {:order-by [:id]}) :columns)
       (mapv tu/boolean-ids-and-timestamps)))

(defn get-table [table-id]
  (->> (hydrate (RawTable :raw_table_id table-id) :columns)
       (mapv tu/boolean-ids-and-timestamps)))

(def ^:private ^:const field-defaults
  {:id                  true
   :raw_table_id        true
   :active              true
   :column_type         nil
   :is_pk               false
   :fk_target_column_id false
   :details             {}
   :created_at          true
   :updated_at          true})

;; save-all-table-fks
;; test case of multi schema with repeating table names
(expect
  [[(merge field-defaults {:name "id"})
    (merge field-defaults {:name "user_id"})]
   [(merge field-defaults {:name "id"})
    (merge field-defaults {:name "user_id", :fk_target_column_id true})]
   [(merge field-defaults {:name "id"})
    (merge field-defaults {:name "user_id"})]
   [(merge field-defaults {:name "id"})
    (merge field-defaults {:name "user_id", :fk_target_column_id true})]]
  (tt/with-temp* [Database  [{database-id :id}]
                  RawTable  [{raw-table-id1 :id, :as table}  {:database_id database-id, :schema "customer1", :name "photos"}]
                  RawColumn [_                               {:raw_table_id raw-table-id1, :name "id"}]
                  RawColumn [_                               {:raw_table_id raw-table-id1, :name "user_id"}]
                  RawTable  [{raw-table-id2 :id, :as table1} {:database_id database-id, :schema "customer2", :name "photos"}]
                  RawColumn [_                               {:raw_table_id raw-table-id2, :name "id"}]
                  RawColumn [_                               {:raw_table_id raw-table-id2, :name "user_id"}]
                  RawTable  [{raw-table-id3 :id, :as table2} {:database_id database-id, :schema nil, :name "users"}]
                  RawColumn [_                               {:raw_table_id raw-table-id3, :name "id"}]]
    (let [get-columns #(->> (db/select RawColumn, :raw_table_id raw-table-id1, {:order-by [:id]})
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
   [(merge field-defaults
           {:name    "beak_size"
            :is_pk   true
            :details {:inches 7, :special-type "type/Category", :base-type "type/Integer"}})]
   [(merge field-defaults
           {:name    "beak_size"
            :details {:inches 8, :base-type "type/Integer"}})
    (merge field-defaults
           {:name    "num_feathers"
            :details {:count 10000, :base-type "type/Integer"}})]
   [(merge field-defaults
           {:name    "beak_size"
            :details {:inches 8, :base-type "type/Integer"}
            :active  false})
    (merge field-defaults
           {:name    "num_feathers"
            :details {:count 12000, :base-type "type/Integer"}})]
   [(merge field-defaults
           {:name    "beak_size"
            :details {:inches 8, :base-type "type/Integer"}})
    (merge field-defaults
           {:name    "num_feathers"
            :details {:count 12000, :base-type "type/Integer"}})]]
  (tt/with-temp* [Database [{database-id :id}]
                  RawTable [{raw-table-id :id, :as table} {:database_id database-id}]]
    (let [get-columns #(->> (db/select RawColumn, :raw_table_id raw-table-id, {:order-by [:id]})
                            (mapv tu/boolean-ids-and-timestamps))]
      ;; original list should be empty
      [(get-columns)
       ;; now add a column
       (do
         (save-all-table-columns! table [{:name "beak_size", :base-type :type/Integer, :details {:inches 7}, :pk? true, :special-type "type/Category"}])
         (get-columns))
       ;; now add another column and modify the first
       (do
         (save-all-table-columns! table [{:name "beak_size", :base-type :type/Integer, :details {:inches 8}}
                                         {:name "num_feathers", :base-type :type/Integer, :details {:count 10000}}])
         (get-columns))
       ;; now remove the first column
       (do
         (save-all-table-columns! table [{:name "num_feathers", :base-type :type/Integer, :details {:count 12000}}])
         (get-columns))
       ;; lastly, resurrect the first column (this ensures uniqueness by name)
       (do
         (save-all-table-columns! table [{:name "beak_size", :base-type :type/Integer, :details {:inches 8}}
                                         {:name "num_feathers", :base-type :type/Integer, :details {:count 12000}}])
         (get-columns))])))

;; create-raw-table

(def ^:private ^:const table-defaults
  {:id          true
   :database_id true
   :active      true
   :schema      nil
   :columns     []
   :details     {}
   :created_at  true
   :updated_at  true})


(expect
  [[]
   [(merge table-defaults
           {:name    "users"
            :details {:a "b"}})]
   [(merge table-defaults
           {:name    "users"
            :details {:a "b"}})
    (merge table-defaults
           {:schema  "aviary"
            :name    "toucanery"
            :details {:owner "Cam"}
            :columns [(merge field-defaults
                             {:name    "beak_size"
                              :is_pk   true
                              :details {:inches 7, :base-type "type/Integer"}})]})]]
  (tt/with-temp* [Database [{database-id :id, :as db}]]
    [(get-tables database-id)
     ;; now add a table
     (do
       (create-raw-table! database-id {:schema  nil
                                       :name    "users"
                                       :details {:a "b"}
                                       :fields  []})
       (get-tables database-id))
     ;; now add another table, this time with a couple columns and some fks
     (do
       (create-raw-table! database-id {:schema  "aviary"
                                       :name    "toucanery"
                                       :details {:owner "Cam"}
                                       :fields  [{:name      "beak_size"
                                                  :base-type :type/Integer
                                                  :pk?       true
                                                  :details   {:inches 7}}]})
       (get-tables database-id))]))


;; update-raw-table
(expect
  [[(merge table-defaults
           {:schema  "aviary"
            :name    "toucanery"
            :details {:owner "Cam"}})]
   [(merge table-defaults
           {:schema  "aviary"
            :name    "toucanery"
            :details {:owner "Cam", :sqft 10000}
            :columns [(merge field-defaults
                             {:name    "beak_size"
                              :is_pk   true
                              :details {:inches 7, :base-type "type/Integer"}})]})]]
  (tt/with-temp* [Database [{database-id :id, :as db}]
                  RawTable [table {:database_id database-id
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
                                           :base-type :type/Integer
                                           :pk?       true
                                           :details   {:inches 7}}]})
       (get-tables database-id))]))


;; disable-raw-tables
(expect
  [[(merge table-defaults
           {:schema  "a"
            :name    "1"
            :columns [(merge field-defaults {:name "size"})]})
    (merge table-defaults
           {:schema  "a"
            :name    "2"
            :columns [(merge field-defaults {:name "beak_size", :fk_target_column_id true})]})]
   [(merge table-defaults
           {:schema  "a"
            :name    "1"
            :columns [(merge field-defaults {:active false, :name "size"})]
            :active  false})
    (merge table-defaults
           {:schema  "a"
            :name    "2"
            :columns [(merge field-defaults {:active false, :name "beak_size"})]
            :active  false})]]
  (tt/with-temp* [Database  [{database-id :id, :as db}]
                  RawTable  [t1 {:database_id database-id, :schema "a", :name "1"}]
                  RawColumn [c1 {:raw_table_id (:id t1), :name "size"}]
                  RawTable  [t2 {:database_id database-id, :schema "a", :name "2"}]
                  RawColumn [c2 {:raw_table_id (:id t2), :name "beak_size", :fk_target_column_id (:id c1)}]]
    [(get-tables database-id)
     (do
       (disable-raw-tables! [(:id t1) (:id t2)])
       (get-tables database-id))]))


;;; introspect-database-and-update-raw-tables!
(expect
  [[]
   moviedb/moviedb-raw-tables
   moviedb/moviedb-raw-tables
   (conj (vec (drop-last moviedb/moviedb-raw-tables))
         (-> (last moviedb/moviedb-raw-tables)
             (assoc :active false)
             (update :columns (fn [columns]
                                (for [column columns]
                                  (assoc column
                                    :active              false
                                    :fk_target_column_id false))))))]
  (tt/with-temp* [Database [{database-id :id, :as db} {:engine :moviedb}]]
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
