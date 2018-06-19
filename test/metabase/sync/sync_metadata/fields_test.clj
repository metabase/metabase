(ns metabase.sync.sync-metadata.fields-test
  "Tests for the logic that syncs Field models with the Metadata fetched from a DB. (There are more tests for this
  behavior in the namespace `metabase.sync-database.sync-dynamic-test`, which is sort of a misnomer.)"
  (:require [clojure.java.jdbc :as jdbc]
            [expectations :refer :all]
            [metabase
             [query-processor :as qp]
             [sync :as sync]
             [util :as u]]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.sync.util-test :as sut]
            [metabase.test.data :as data]
            [metabase.test.data.one-off-dbs :as one-off-dbs]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]
            [toucan.util.test :as tt]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Dropping & Undropping Columns                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- with-test-db-before-and-after-dropping-a-column
  "Testing function that performs the following steps:

   1.  Create a temporary test database & syncs it
   2.  Executes `(f database)`
   3.  Drops one of the columns from the test DB & syncs it again
   4.  Executes `(f database)` a second time
   5.  Returns a map containing results from both calls to `f` for comparison."
  [f]
  ;; first, create a new in-memory test DB and add some data to it
  (one-off-dbs/with-blank-db
    (doseq [statement [ ;; H2 needs that 'guest' user for QP purposes. Set that up
                       "CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';"
                       ;; Keep DB open until we say otherwise :)
                       "SET DB_CLOSE_DELAY -1;"
                       ;; create table & load data
                       "DROP TABLE IF EXISTS \"birds\";"
                       "CREATE TABLE \"birds\" (\"species\" VARCHAR PRIMARY KEY, \"example_name\" VARCHAR);"
                       "GRANT ALL ON \"birds\" TO GUEST;"
                       (str "INSERT INTO \"birds\" (\"species\", \"example_name\") VALUES "
                            "('House Finch', 'Marshawn Finch'),  "
                            "('California Gull', 'Steven Seagull'), "
                            "('Chicken', 'Colin Fowl');")]]
      (jdbc/execute! one-off-dbs/*conn* [statement]))
    ;; now sync
    (sync/sync-database! (data/db))
    ;; ok, let's see what (f) gives us
    (let [f-before (f (data/db))]
      ;; ok cool! now delete one of those columns...
      (jdbc/execute! one-off-dbs/*conn* ["ALTER TABLE \"birds\" DROP COLUMN \"example_name\";"])
      ;; ...and re-sync...
      (sync/sync-database! (data/db))
      ;; ...now let's see how (f) may have changed! Compare to original.
      {:before-drop f-before
       :after-drop  (f (data/db))})))


;; make sure sync correctly marks a Field as active = false when it gets dropped from the DB
(expect
  {:before-drop #{{:name "species",      :active true}
                  {:name "example_name", :active true}}
   :after-drop  #{{:name "species",      :active true}
                  {:name "example_name", :active false}}}
  (with-test-db-before-and-after-dropping-a-column
    (fn [database]
      (set
       (map (partial into {})
            (db/select [Field :name :active]
              :table_id [:in (db/select-ids Table :db_id (u/get-id database))]))))))

;; make sure deleted fields doesn't show up in `:fields` of a table
(expect
  {:before-drop #{"species" "example_name"}
   :after-drop  #{"species"}}
  (with-test-db-before-and-after-dropping-a-column
    (fn [database]
      (let [table (hydrate (db/select-one Table :db_id (u/get-id database)) :fields)]
        (set
         (map :name (:fields table)))))))

;; make sure that inactive columns don't end up getting spliced into queries! This test arguably belongs in the query
;; processor tests since it's ultimately checking to make sure columns marked as `:active` = `false` aren't getting
;; put in queries with implicit `:fields` clauses, but since this could be seen as covering both QP and sync (my and
;; others' assumption when first coming across bug #6146 was that this was a sync issue), this test can stay here for
;; now along with the other test we have testing sync after dropping a column.
(expect
  {:before-drop (str "SELECT \"PUBLIC\".\"birds\".\"species\" AS \"species\", "
                     "\"PUBLIC\".\"birds\".\"example_name\" AS \"example_name\" "
                     "FROM \"PUBLIC\".\"birds\" "
                     "LIMIT 1048576")
   :after-drop  (str "SELECT \"PUBLIC\".\"birds\".\"species\" AS \"species\" "
                     "FROM \"PUBLIC\".\"birds\" "
                     "LIMIT 1048576")}
  (with-test-db-before-and-after-dropping-a-column
    (fn [database]
      (-> (qp/process-query {:database (u/get-id database)
                             :type     :query
                             :query    {:source-table (db/select-one-id Table
                                                        :db_id (u/get-id database), :name "birds")}})
          :data
          :native_form
          :query))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                PK & FK Syncing                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- force-sync-table!
  "Updates the `:fields_hash` to ensure that the sync process will include fields in the sync"
  [table]
  (db/update! Table (u/get-id table), :fields_hash "something new")
  (sync/sync-table! (Table (data/id :venues))))

;; Test PK Syncing
(expect [:type/PK
         nil
         :type/PK
         :type/Latitude
         :type/PK]
  (let [get-special-type (fn [] (db/select-one-field :special_type Field, :id (data/id :venues :id)))]
    [;; Special type should be :id to begin with
     (get-special-type)
     ;; Clear out the special type
     (do (db/update! Field (data/id :venues :id), :special_type nil)
         (get-special-type))
     ;; Calling sync-table! should set the special type again
     (do (force-sync-table! (data/id :venues))
         (get-special-type))
     ;; sync-table! should *not* change the special type of fields that are marked with a different type
     (do (db/update! Field (data/id :venues :id), :special_type :type/Latitude)
         (get-special-type))
     ;; Make sure that sync-table runs set-table-pks-if-needed!
     (do (db/update! Field (data/id :venues :id), :special_type nil)
         (force-sync-table! (Table (data/id :venues)))
         (get-special-type))]))


;; Check that Foreign Key relationships were created on sync as we expect
(expect (data/id :venues :id)
  (db/select-one-field :fk_target_field_id Field, :id (data/id :checkins :venue_id)))

(expect (data/id :users :id)
  (db/select-one-field :fk_target_field_id Field, :id (data/id :checkins :user_id)))

(expect (data/id :categories :id)
  (db/select-one-field :fk_target_field_id Field, :id (data/id :venues :category_id)))

;; Check that sync-table! causes FKs to be set like we'd expect
(expect [{:total-fks 3, :updated-fks 0, :total-failed 0}
         {:special_type :type/FK, :fk_target_field_id true}
         {:special_type nil,      :fk_target_field_id false}
         {:total-fks 3, :updated-fks 1, :total-failed 0}
         {:special_type :type/FK, :fk_target_field_id true}]
  (let [field-id (data/id :checkins :user_id)
        get-special-type-and-fk-exists? (fn []
                                          (into {} (-> (db/select-one [Field :special_type :fk_target_field_id],
                                                         :id field-id)
                                                       (update :fk_target_field_id #(db/exists? Field :id %)))))]
    [
     (sut/only-step-keys (sut/sync-database! "sync-fks" (Database (data/id))))
     ;; FK should exist to start with
     (get-special-type-and-fk-exists?)
     ;; Clear out FK / special_type
     (do (db/update! Field field-id, :special_type nil, :fk_target_field_id nil)
         (get-special-type-and-fk-exists?))

     ;; Run sync-table and they should be set again
     (sut/only-step-keys (sut/sync-database! "sync-fks" (Database (data/id))))
     (get-special-type-and-fk-exists?)]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     tests related to sync's Field hashes                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- exec! [& statements]
  (doseq [statement statements]
    (jdbc/execute! one-off-dbs/*conn* [statement])))

(defmacro ^:private throw-if-called {:style/indent 1} [fn-var & body]
  `(with-redefs [~fn-var (fn [& args#]
                           (throw (RuntimeException. "Should not be called!")))]
     ~@body))

;; Validate the changing of a column's type triggers a hash miss and sync
(expect
  [ ;; Original column type
   "SMALLINT"
   ;; Altered the column, now it's an integer
   "INTEGER"
   ;; Original hash and the new one are not equal
   false
   ;; Reruning sync shouldn't change the hash
   true]
  (one-off-dbs/with-blueberries-db
    (one-off-dbs/insert-rows-and-sync! (range 50))
    ;; After this sync, we know about the new table and it's SMALLINT column
    (let [table-id                     (data/id :blueberries_consumed)
          get-table                    #(Table (data/id :blueberries_consumed))
          get-field                    #(Field (data/id :blueberries_consumed :num))
          {old-hash :fields_hash}      (get-table)
          {old-db-type :database_type} (get-field)]
      ;; Change the column from SMALLINT to INTEGER. In clojure-land these are both integers, but this change
      ;; should trigger a hash miss and thus resync the table, since something has changed
      (exec! "ALTER TABLE blueberries_consumed ALTER COLUMN num INTEGER")
      (sync/sync-database! (data/db))
      (let [{new-hash :fields_hash}      (get-table)
            {new-db-type :database_type} (get-field)]

        ;; Syncing again with no change should not call sync-field-instances! or update the hash
        (throw-if-called metabase.sync.sync-metadata.fields/sync-field-instances!
          (sync/sync-database! (data/db))
          [old-db-type
           new-db-type
           (= old-hash new-hash)
           (= new-hash (:fields_hash (get-table)))])))))

(defn- table-md-with-hash [table-id]
  {:active-fields   (count (db/select Field :table_id table-id :active true))
   :inactive-fields (count (db/select Field :table_id table-id :active false))
   :fields-hash     (:fields_hash (db/select-one Table :id table-id))})

(defn- no-fields-hash [m]
  (dissoc m :fields-hash))

;; This tests a table that adds a column, ensures sync picked up the new column and the hash changed
(expect
  [
   ;; Only the num column should be found
   {:active-fields 1, :inactive-fields 0}
   ;; Add a column, should still be no inactive
   {:active-fields 2, :inactive-fields 0}
   ;; Adding a column should make the hashes not equal
   false
   ]
  (one-off-dbs/with-blueberries-db
    (one-off-dbs/insert-rows-and-sync! (range 50))
    ;; We should now have a hash value for num as a SMALLINT
    (let [before-table-md (table-md-with-hash (data/id :blueberries_consumed))
          _               (exec! "ALTER TABLE blueberries_consumed ADD COLUMN weight FLOAT")
          _               (sync/sync-database! (data/db))
          ;; Now that hash will include num and weight
          after-table-md  (table-md-with-hash (data/id :blueberries_consumed))]
      [(no-fields-hash before-table-md)
       (no-fields-hash after-table-md)
       (= (:fields-hash before-table-md)
          (:fields-hash after-table-md))])))

;; Drops a column, ensures sync finds the drop, updates the hash
(expect
  [
   ;; Test starts with two columns
   {:active-fields 2, :inactive-fields 0}
   ;; Dropped the weight column
   {:active-fields 1, :inactive-fields 1}
   ;; Hashes should be different without the weight column
   false]
  (one-off-dbs/with-blank-db
    ;; create a DB that has 2 columns this time instead of 1
    (exec! "CREATE TABLE blueberries_consumed (num SMALLINT NOT NULL, weight FLOAT)")
    (one-off-dbs/insert-rows-and-sync! (range 50))
    ;; We should now have a hash value for num as a SMALLINT
    (let [before-table-md (table-md-with-hash (data/id :blueberries_consumed))
          _               (exec! "ALTER TABLE blueberries_consumed DROP COLUMN weight")
          _               (sync/sync-database! (data/db))
          ;; Now that hash will include num and weight
          after-table-md  (table-md-with-hash (data/id :blueberries_consumed))]
      [(no-fields-hash before-table-md)
       (no-fields-hash after-table-md)
       (= (:fields-hash before-table-md)
          (:fields-hash after-table-md))])))

;; Drops and readds a column, ensures that the hash is back to it's original value
(expect
  [
   ;; Both num and weight columns should be found
   {:active-fields 2, :inactive-fields 0}
   ;; Both columns should still be present
   {:active-fields 2, :inactive-fields 0}
   ;; The hashes should be the same
   true]
  (one-off-dbs/with-blank-db
    ;; create a DB that has 2 columns this time instead of 1
    (exec! "CREATE TABLE blueberries_consumed (num SMALLINT NOT NULL, weight FLOAT)")
    (one-off-dbs/insert-rows-and-sync! (range 50))
    ;; We should now have a hash value for num as a SMALLINT
    (let [before-table-md (table-md-with-hash (data/id :blueberries_consumed))
          _               (exec! "ALTER TABLE blueberries_consumed DROP COLUMN weight")
          _               (sync/sync-database! (data/db))
          _               (exec! "ALTER TABLE blueberries_consumed ADD COLUMN weight FLOAT")
          _               (sync/sync-database! (data/db))
          ;; Now that hash will include num and weight
          after-table-md  (table-md-with-hash (data/id :blueberries_consumed))]
      [(no-fields-hash before-table-md)
       (no-fields-hash after-table-md)
       (= (:fields-hash before-table-md)
          (:fields-hash after-table-md))]))  )
