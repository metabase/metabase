(ns metabase.sync-database.sync-test
  (:require [expectations :refer :all]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [raw-column :refer [RawColumn]]
             [raw-table :refer [RawTable]]
             [table :refer [Table]]]
            [metabase.sync-database
             [introspect :as introspect]
             [sync :refer :all]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.interface :as i]
            [metabase.test.mock
             [moviedb :as moviedb]
             [schema-per-customer :as schema-per-customer]]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]
            [toucan.util.test :as tt]))

(tu/resolve-private-vars metabase.sync-database.sync
  save-fks! save-table-fields!)

(defn- get-tables [database-id]
  (->> (hydrate (db/select Table, :db_id database-id, {:order-by [:id]}) :fields)
       (mapv tu/boolean-ids-and-timestamps)))


;; save-fks!
(expect
  [[{:special_type nil, :name "fk1", :fk_target_field_id false}]
   [{:special_type :type/FK, :name "fk1", :fk_target_field_id true}]
   [{:special_type :type/FK, :name "fk1", :fk_target_field_id true}]
   [{:special_type :type/FK, :name "fk1", :fk_target_field_id true}]]
  (tt/with-temp* [Database  [{database-id :id}]
                  RawTable  [{raw-table-id1 :id, :as table}  {:database_id database-id, :name "fk_source"}]
                  RawColumn [{raw-fk1 :id}                   {:raw_table_id raw-table-id1, :name "fk1"}]
                  Table     [{t1 :id}                        {:db_id database-id, :raw_table_id raw-table-id1, :name "fk_source"}]
                  Field     [{fk1 :id}                       {:table_id t1, :raw_column_id raw-fk1, :name "fk1"}]
                  RawTable  [{raw-table-id2 :id, :as table1} {:database_id database-id, :name "fk_target"}]
                  RawColumn [{raw-target1 :id}               {:raw_table_id raw-table-id2, :name "target1"}]
                  RawColumn [{raw-target2 :id}               {:raw_table_id raw-table-id2, :name "target2"}]
                  Table     [{t2 :id}                        {:db_id database-id, :raw_table_id raw-table-id2, :name "fk_target"}]
                  Field     [{target1 :id}                   {:table_id t2, :raw_column_id raw-target1, :name "target1"}]
                  Field     [{target2 :id}                   {:table_id t2, :raw_column_id raw-target2, :name "target2"}]]
    (let [get-fields (fn [table-id]
                       (->> (db/select [Field :name :special_type :fk_target_field_id], :table_id table-id)
                            (mapv tu/boolean-ids-and-timestamps)))]
      [ ;; original list should not have any fks
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
  (tt/with-temp* [Database [{database-id :id, :as db} {:engine :moviedb}]]
    ;; setup a couple things we'll use in the test
    (introspect/introspect-database-and-update-raw-tables! (moviedb/->MovieDbDriver) db)
    (let [raw-table-id (db/select-one-id RawTable, :database_id database-id, :name "movies")
          table        (db/insert! Table
                         :db_id        database-id
                         :raw_table_id raw-table-id
                         :name         "movies"
                         :active       true)
          get-table    #(-> (db/select-one [Table :id :name :description], :id (:id table))
                            (hydrate :fields)
                            (update :fields (fn [fields]
                                              (for [f fields
                                                    :when (= "filming" (:name f))]
                                                (select-keys f [:name :description]))))
                            tu/boolean-ids-and-timestamps)]

      (update-data-models-for-table! table)
      ;; here we go
      [(get-table)
       (do
         (sync-metabase-metadata-table! (moviedb/->MovieDbDriver) db {})
         (get-table))])))


(def ^:private ^:const field-defaults
  {:id                 true
   :table_id           true
   :raw_column_id      true
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

;; save-table-fields!
;; this test also covers create-field-from-field-def! and update-field-from-field-def!
(expect
  [[]
   ;; initial sync
   [(merge field-defaults {:name         "First"
                           :display_name "First"
                           :base_type    :type/Integer
                           :special_type :type/PK})
    (merge field-defaults {:name         "Second"
                           :display_name "Second"
                           :base_type    :type/Text})
    (merge field-defaults {:name         "Third"
                           :display_name "Third"
                           :base_type    :type/Boolean
                           :special_type nil})]
   ;; add column, modify first column
   [(merge field-defaults {:name         "First"
                           :display_name "First"
                           :base_type    :type/Decimal
                           :special_type :type/PK}) ; existing special types are NOT modified
    (merge field-defaults {:name         "Second"
                           :display_name "Second"
                           :base_type    :type/Text})
    (merge field-defaults {:name         "Third"
                           :display_name "Third"
                           :base_type    :type/Boolean
                           :special_type nil})
    (merge field-defaults {:name         "rating"
                           :display_name "Rating"
                           :base_type    :type/Integer
                           :special_type :type/Category})]
   ;; first column retired, 3rd column now a pk
   [(merge field-defaults {:name            "First"
                           :display_name    "First"
                           :base_type       :type/Decimal
                           :visibility_type :retired ; field retired when RawColumn disabled
                           :special_type    :type/PK})
    (merge field-defaults {:name         "Second"
                           :display_name "Second"
                           :base_type    :type/Text})
    (merge field-defaults {:name         "Third"
                           :display_name "Third"
                           :base_type    :type/Boolean
                           :special_type :type/PK}) ; special type can be set if it was nil before
    (merge field-defaults {:name         "rating"
                           :display_name "Rating"
                           :base_type    :type/Integer
                           :special_type :type/Category})]]
  (tt/with-temp* [Database  [{database-id :id}]
                  RawTable  [{raw-table-id :id, :as table} {:database_id database-id}]
                  RawColumn [{raw-column-id1 :id}          {:raw_table_id raw-table-id, :name "First", :is_pk true, :details {:base-type "type/Integer"}}]
                  RawColumn [{raw-column-id2 :id}          {:raw_table_id raw-table-id, :name "Second", :details {:base-type "type/Text"}}]
                  RawColumn [{raw-column-id3 :id}          {:raw_table_id raw-table-id, :name "Third", :details {:base-type "type/Boolean"}}]
                  Table     [{table-id :id, :as tbl}       {:db_id database-id, :raw_table_id raw-table-id}]]
    (let [get-fields #(->> (db/select Field, :table_id table-id, {:order-by [:id]})
                           (mapv tu/boolean-ids-and-timestamps)
                           (mapv (fn [m]
                                   (dissoc m :active :position :preview_display))))
          initial-fields (get-fields)
          first-sync     (do
                           (save-table-fields! tbl)
                           (get-fields))]
      (tt/with-temp* [RawColumn [_ {:raw_table_id raw-table-id, :name "rating", :details {:base-type "type/Integer"}}]]
        ;; start with no fields
        [initial-fields
         ;; first sync will add all the fields
         first-sync
         ;; now add another column and modify the first
         (do
           (db/update! RawColumn raw-column-id1, :is_pk false, :details {:base-type "type/Decimal"})
           (save-table-fields! tbl)
           (get-fields))
         ;; now disable the first column
         (do
           (db/update! RawColumn raw-column-id1, :active false)
           (db/update! RawColumn raw-column-id3, :is_pk true)
           (save-table-fields! tbl)
           (get-fields))]))))


;; retire-tables!
(expect
  (let [disabled-movies-table (fn [table]
                                (if-not (= "movies" (:name table))
                                  table
                                  (assoc table
                                    :active false
                                    :fields [])))]
    [moviedb/moviedb-tables-and-fields
     (mapv disabled-movies-table moviedb/moviedb-tables-and-fields)])
  (tt/with-temp* [Database [{database-id :id, :as db} {:engine :moviedb}]]
    ;; setup a couple things we'll use in the test
    (introspect/introspect-database-and-update-raw-tables! (moviedb/->MovieDbDriver) db)
    (update-data-models-from-raw-tables! db)
    (let [get-tables #(->> (hydrate (db/select Table, :db_id database-id, {:order-by [:id]}) :fields)
                           (mapv tu/boolean-ids-and-timestamps))]
      ;; here we go
      [(get-tables)
       (do
         ;; disable the table
         (db/update-where! RawTable {:database_id database-id
                                     :name        "movies"}
           :active false)
         ;; run our retires function
         (retire-tables! db)
         ;; now we should see the table and its fields disabled
         (get-tables))])))


;; update-data-models-for-table!
(expect
  (let [disable-fks (fn [fields]
                      (for [field fields]
                        (if (isa? (:special_type field) :type/FK)
                          (assoc field
                            :special_type       nil
                            :fk_target_field_id false)
                          field)))]
    [[(-> (last moviedb/moviedb-tables-and-fields)
          (update :fields disable-fks))]
     [(-> (last moviedb/moviedb-tables-and-fields)
          (update :fields disable-fks))]
     [(-> (last moviedb/moviedb-tables-and-fields)
          (assoc :active false
                 :fields []))]])
  (tt/with-temp* [Database [{database-id :id, :as db} {:engine :moviedb}]]
    (let [driver (moviedb/->MovieDbDriver)]
      ;; do a quick introspection to add the RawTables to the db
      (introspect/introspect-database-and-update-raw-tables! driver db)

      ;; stub out the Table we are going to sync for real below
      (let [raw-table-id (db/select-one-id RawTable, :database_id database-id, :name "roles")
            table        (db/insert! Table
                           :db_id        database-id
                           :raw_table_id raw-table-id
                           :name         "roles"
                           :active       true)]
        [ ;; now lets run a sync and check what we got
         (do
           (update-data-models-for-table! table)
           (get-tables database-id))
         ;; run the sync a second time to see how we respond to repeat syncing (should be same since nothing changed)
         (do
           (update-data-models-for-table! table)
           (get-tables database-id))
         ;; one more time, but lets disable the table this time and ensure that's handled properly
         (do
           (db/update-where! RawTable {:database_id database-id
                                       :name        "roles"}
             :active false)
           (update-data-models-for-table! table)
           (get-tables database-id))]))))


;; update-data-models-from-raw-tables!
(expect
  [moviedb/moviedb-raw-tables
   moviedb/moviedb-tables-and-fields
   moviedb/moviedb-tables-and-fields
   (conj (vec (drop-last moviedb/moviedb-tables-and-fields))
         (-> (last moviedb/moviedb-tables-and-fields)
             (assoc :active false
                    :fields [])))]
  (tt/with-temp* [Database [{database-id :id, :as db} {:engine :moviedb}]]
    (let [driver (moviedb/->MovieDbDriver)]
      ;; do a quick introspection to add the RawTables to the db
      (introspect/introspect-database-and-update-raw-tables! driver db)

      [;; first check that the raw tables stack up as expected
       (->> (hydrate (db/select RawTable, :database_id database-id, {:order-by [:id]}) :columns)
            (mapv tu/boolean-ids-and-timestamps))
       ;; now lets run a sync and check what we got
       (do
         (update-data-models-from-raw-tables! db)
         (get-tables database-id))
       ;; run the sync a second time to see how we respond to repeat syncing (should be same since nothing changed)
       (do
         (update-data-models-from-raw-tables! db)
         (get-tables database-id))
       ;; one more time, but lets disable a table this time and ensure that's handled properly
       (do
         (db/update-where! RawTable {:database_id database-id
                                     :name        "roles"}
           :active false)
         (update-data-models-from-raw-tables! db)
         (get-tables database-id))])))


(defn- resolve-fk-targets
  "Convert :fk_target_[column|field]_id into more testable information with table/schema names."
  [m]
  (let [resolve-raw-column (fn [column-id]
                             (when-let [{col-name :name, table :raw_table_id} (db/select-one [RawColumn :raw_table_id :name], :id column-id)]
                               (-> (db/select-one [RawTable :schema :name], :id table)
                                   (assoc :col-name col-name))))
        resolve-field      (fn [field-id]
                             (when-let [{col-name :name, table :table_id} (db/select-one [Field :table_id :name], :id field-id)]
                               (-> (db/select-one [Table :schema :name], :id table)
                                   (assoc :col-name col-name))))
        resolve-fk         (fn [m]
                             (cond
                               (:fk_target_column_id m)
                               (assoc m :fk_target_column (resolve-raw-column (:fk_target_column_id m)))

                               (:fk_target_field_id m)
                               (assoc m :fk_target_field (resolve-field (:fk_target_field_id m)))

                               :else
                               m))]
    (update m (if (:database_id m) :columns :fields) #(mapv resolve-fk %))))

;; special test case which validates a fairly complex multi-schema setup with lots of FKs
(expect
  [schema-per-customer/schema-per-customer-raw-tables
   schema-per-customer/schema-per-customer-tables-and-fields
   schema-per-customer/schema-per-customer-tables-and-fields]
  (tt/with-temp* [Database [{database-id :id, :as db} {:engine :schema-per-customer}]]
    (let [driver     (schema-per-customer/->SchemaPerCustomerDriver)
          db-tables  #(->> (hydrate (db/select Table, :db_id %, {:order-by [:id]}) :fields)
                           (mapv resolve-fk-targets)
                           (mapv tu/boolean-ids-and-timestamps))]
      ;; do a quick introspection to add the RawTables to the db
      (introspect/introspect-database-and-update-raw-tables! driver db)

      [;; first check that the raw tables stack up as expected
       (->> (hydrate (db/select RawTable, :database_id database-id, {:order-by [:id]}) :columns)
            (mapv resolve-fk-targets)
            (mapv tu/boolean-ids-and-timestamps))
       ;; now lets run a sync and check what we got
       (do
         (update-data-models-from-raw-tables! db)
         (db-tables database-id))
       ;; run the sync a second time to see how we respond to repeat syncing (should be same since nothing changed)
       (do
         (update-data-models-from-raw-tables! db)
         (db-tables database-id))])))


;;; ------------------------------------------------------------ Make sure that "crufty" tables are marked as such ------------------------------------------------------------
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
  (data/dataset metabase.sync-database.sync-test/db-with-some-cruft
    (set (for [table (db/select [Table :name :visibility_type], :db_id (data/id))]
           (into {} table)))))
