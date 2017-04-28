(ns metabase.sync-database.sync-dynamic-test
  (:require [expectations :refer :all]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [raw-table :refer [RawTable]]
             [table :refer [Table]]]
            [metabase.sync-database
             [introspect :as introspect]
             [sync-dynamic :refer :all]]
            [metabase.test.mock.toucanery :as toucanery]
            [metabase.test.util :as tu]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]
            [toucan.util.test :as tt]))

(tu/resolve-private-vars metabase.sync-database.sync-dynamic
  save-table-fields!)

(defn- get-tables [database-id]
  (->> (hydrate (db/select Table, :db_id database-id, {:order-by [:id]}) :fields)
       (mapv tu/boolean-ids-and-timestamps)))

(def ^:private ^:const field-defaults
  {:id                 true
   :table_id           true
   :raw_column_id      false
   :description        nil
   :caveats            nil
   :points_of_interest nil
   :visibility_type    :normal
   :special_type       nil
   :parent_id          false
   :fk_target_field_id false
   :last_analyzed      false
   :created_at         true
   :updated_at         true})

;; save-table-fields!  (also covers save-nested-fields!)
(expect
  [[]
   ;; initial sync
   [(merge field-defaults {:base_type    :type/Integer
                           :special_type :type/PK
                           :name         "First"
                           :display_name "First"})
    (merge field-defaults {:base_type    :type/Text
                           :name         "Second"
                           :display_name "Second"})
    (merge field-defaults {:base_type    :type/Boolean
                           :special_type nil
                           :name         "Third"
                           :display_name "Third"})]
   ;; add column, modify first column, add some nested fields
   [(merge field-defaults {:base_type    :type/Decimal
                           :special_type :type/PK
                           :name         "First"
                           :display_name "First"})
    (merge field-defaults {:base_type    :type/Text
                           :name         "Second"
                           :display_name "Second"})
    (merge field-defaults {:base_type    :type/Boolean
                           :name         "Third"
                           :display_name "Third"})
    (merge field-defaults {:base_type    :type/Integer
                           :special_type :type/Category
                           :name         "rating"
                           :display_name "Rating"})
    (merge field-defaults {:base_type    :type/Text
                           :special_type :type/City
                           :name         "city"
                           :display_name "City"
                           :parent_id    true})
    (merge field-defaults {:base_type    :type/Text
                           :special_type :type/Category
                           :name         "type"
                           :display_name "Type"
                           :parent_id    true})]
   ;; first column retired, 3rd column now a pk, another nested field
   [(merge field-defaults {:base_type    :type/Decimal
                           :special_type :type/PK
                           :name         "First"
                           :display_name "First"})
    (merge field-defaults {:base_type    :type/Text
                           :name         "Second"
                           :display_name "Second"})
    (merge field-defaults {:base_type    :type/Boolean
                           :special_type :type/PK
                           :name         "Third"
                           :display_name "Third"})
    (merge field-defaults {:name         "rating"
                           :display_name "Rating"
                           :base_type    :type/Integer
                           :special_type :type/Category})
    (merge field-defaults {:base_type    :type/Text
                           :special_type :type/City
                           :name         "city"
                           :display_name "City"
                           :parent_id    true})
    (merge field-defaults {:base_type    :type/Text
                           :special_type :type/Category
                           :name         "type"
                           :display_name "Type"
                           :parent_id    true})
    (merge field-defaults {:base_type    :type/Boolean
                           :name         "new"
                           :display_name "New"
                           :parent_id    true})]]
  (tt/with-temp* [Database  [{database-id :id}]
                  RawTable  [{raw-table-id :id}       {:database_id database-id}]
                  Table     [{table-id :id, :as table} {:db_id database-id, :raw_table_id raw-table-id}]]
    (let [get-fields   (fn []
                         (for [field (db/select Field, :table_id table-id, {:order-by [:id]})]
                           (dissoc (tu/boolean-ids-and-timestamps field)
                                   :active :position :preview_display)))
          save-fields! (fn [& fields]
                         (save-table-fields! table fields)
                         (get-fields))]
      ;; start with no fields
      [(get-fields)
       ;; first sync will add all the fields
       (save-fields! {:name "First", :base-type :type/Integer, :pk? true}
                     {:name "Second", :base-type :type/Text}
                     {:name "Third", :base-type :type/Boolean})
       ;; now add another column (with nested-fields!) and modify the first
       (save-fields! {:name "First", :base-type :type/Decimal, :pk? false}
                     {:name "Second", :base-type :type/Text}
                     {:name "Third", :base-type :type/Boolean}
                     {:name "rating", :base-type :type/Integer, :nested-fields [{:name "city", :base-type :type/Text}
                                                                                {:name "type", :base-type :type/Text}]})
       ;; now remove the first column (should have no effect), and make tweaks to the nested columns
       (save-fields! {:name "Second", :base-type :type/Text}
                     {:name "Third", :base-type :type/Boolean, :pk? true}
                     {:name "rating", :base-type :type/Integer, :nested-fields [{:name "new", :base-type :type/Boolean}]})])))


;; scan-table-and-update-data-model!
(expect
  [[(last toucanery/toucanery-tables-and-fields)]
   [(last toucanery/toucanery-tables-and-fields)]
   [(assoc (last toucanery/toucanery-tables-and-fields)
      :active false
      :fields [])]]
  (tt/with-temp* [Database [{database-id :id, :as db} {:engine :toucanery}]]
    (let [driver (toucanery/->ToucaneryDriver)]
      ;; do a quick introspection to add the RawTables to the db
      (introspect/introspect-database-and-update-raw-tables! driver db)
      ;; stub out the Table we are going to sync for real below
      (let [raw-table-id (db/select-one-id RawTable, :database_id database-id, :name "transactions")
            tbl          (db/insert! Table
                           :db_id        database-id
                           :raw_table_id raw-table-id
                           :name         "transactions"
                           :active       true)]
        [ ;; now lets run a sync and check what we got
         (do
           (scan-table-and-update-data-model! driver db tbl)
           (get-tables database-id))
         ;; run the sync a second time to see how we respond to repeat syncing (should be same since nothing changed)
         (do
           (scan-table-and-update-data-model! driver db tbl)
           (get-tables database-id))
         ;; one more time, but lets disable the table this time and ensure that's handled properly
         (do
           (db/update-where! RawTable {:database_id database-id
                                       :name        "transactions"}
             :active false)
           (scan-table-and-update-data-model! driver db tbl)
           (get-tables database-id))]))))


;; scan-database-and-update-data-model!
(expect
  [toucanery/toucanery-raw-tables-and-columns
   toucanery/toucanery-tables-and-fields
   toucanery/toucanery-tables-and-fields
   (conj (vec (drop-last toucanery/toucanery-tables-and-fields))
         (assoc (last toucanery/toucanery-tables-and-fields)
           :active false
           :fields []))]
  (tt/with-temp* [Database [{database-id :id, :as db} {:engine :toucanery}]]
    (let [driver (toucanery/->ToucaneryDriver)]
      ;; do a quick introspection to add the RawTables to the db
      (introspect/introspect-database-and-update-raw-tables! driver db)

      [ ;; first check that the raw tables stack up as expected, especially that fields were skipped because this is a :dynamic-schema db
       (->> (hydrate (db/select RawTable, :database_id database-id, {:order-by [:id]}) :columns)
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
         (db/update-where! RawTable {:database_id database-id
                                     :name        "transactions"}
           :active false)
         (scan-database-and-update-data-model! driver db)
         (get-tables database-id))])))
