(ns metabase.sync-database-test
  "Tests for sync behavior that use a imaginary `SyncTestDriver`. These are kept around mainly because they've already
  been written. For newer sync tests see `metabase.sync.*` test namespaces."
  (:require [expectations :refer :all]
            [metabase
             [driver :as driver]
             [sync :refer :all]
             [util :as u]]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [field-values :as field-values :refer [FieldValues]]
             [table :refer [Table]]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.mock.util :as mock-util]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(def ^:private ^:const sync-test-tables
  {"movie"  {:name   "movie"
             :schema "default"
             :fields #{{:name          "id"
                        :database-type "SERIAL"
                        :base-type     :type/Integer}
                       {:name          "title"
                        :database-type "VARCHAR"
                        :base-type     :type/Text
                        :special-type  :type/Title}
                       {:name          "studio"
                        :database-type "VARCHAR"
                        :base-type     :type/Text}}}
   "studio" {:name   "studio"
             :schema nil
             :fields #{{:name          "studio"
                        :database-type "VARCHAR"
                        :base-type     :type/Text
                        :special-type  :type/PK}
                       {:name          "name"
                        :database-type "VARCHAR"
                        :base-type     :type/Text}}}})


;; TODO - I'm 90% sure we could just reüse the "MovieDB" instead of having this subset of it used here
(defrecord SyncTestDriver []
  clojure.lang.Named
  (getName [_] "SyncTestDriver"))


(defn- describe-database [& _]
  {:tables (set (for [table (vals sync-test-tables)]
                  (dissoc table :fields)))})

(defn- describe-table [_ _ table]
  (get sync-test-tables (:name table)))

(defn- describe-table-fks [_ _ table]
  (set (when (= "movie" (:name table))
         #{{:fk-column-name   "studio"
            :dest-table       {:name   "studio"
                               :schema nil}
            :dest-column-name "studio"}})))

(extend SyncTestDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:describe-database        describe-database
          :describe-table           describe-table
          :describe-table-fks       describe-table-fks
          :features                 (constantly #{:foreign-keys})
          :details-fields           (constantly [])
          :process-query-in-context mock-util/process-query-in-context}))


(driver/register-driver! :sync-test (SyncTestDriver.))


(defn- table-details [table]
  (into {} (-> (dissoc table :db :pk_field :field_values)
               (assoc :fields (for [field (db/select Field, :table_id (:id table), {:order-by [:name]})]
                                (into {} (-> (dissoc field
                                                     :table :db :children :qualified-name :qualified-name-components
                                                     :values :target)
                                             (update :fingerprint map?)
                                             (update :fingerprint_version (complement zero?))))))
               tu/boolean-ids-and-timestamps)))

(def ^:private table-defaults
  {:active                  true
   :caveats                 nil
   :created_at              true
   :db_id                   true
   :description             nil
   :entity_name             nil
   :entity_type             :entity/GenericTable
   :id                      true
   :points_of_interest      nil
   :raw_table_id            false
   :rows                    nil
   :schema                  nil
   :show_in_getting_started false
   :updated_at              true
   :visibility_type         nil
   :fields_hash             true})

(def ^:private field-defaults
  {:active              true
   :caveats             nil
   :created_at          true
   :description         nil
   :fingerprint         false
   :fingerprint_version false
   :fk_target_field_id  false
   :has_field_values    nil
   :id                  true
   :last_analyzed       false
   :parent_id           false
   :points_of_interest  nil
   :position            0
   :preview_display     true
   :raw_column_id       false
   :special_type        nil
   :table_id            true
   :updated_at          true
   :visibility_type     :normal})

;; ## SYNC DATABASE
(expect
  [(merge table-defaults
          {:schema       "default"
           :name         "movie"
           :display_name "Movie"
           :fields       [(merge field-defaults
                                 {:name          "id"
                                  :display_name  "ID"
                                  :database_type "SERIAL"
                                  :base_type     :type/Integer})
                          (merge field-defaults
                                 {:name               "studio"
                                  :display_name       "Studio"
                                  :database_type      "VARCHAR"
                                  :base_type          :type/Text
                                  :fk_target_field_id true
                                  :special_type       :type/FK})
                          (merge field-defaults
                                 {:name          "title"
                                  :display_name  "Title"
                                  :database_type "VARCHAR"
                                  :base_type     :type/Text
                                  :special_type  :type/Title})]})
   (merge table-defaults
          {:name         "studio"
           :display_name "Studio"
           :fields       [(merge field-defaults
                                 {:name          "name"
                                  :display_name  "Name"
                                  :database_type "VARCHAR"
                                  :base_type     :type/Text})
                          (merge field-defaults
                                 {:name          "studio"
                                  :display_name  "Studio"
                                  :database_type "VARCHAR"
                                  :base_type     :type/Text
                                  :special_type  :type/PK})]})]
  (tt/with-temp Database [db {:engine :sync-test}]
    (sync-database! db)
    ;; we are purposely running the sync twice to test for possible logic issues which only manifest on resync of a
    ;; database, such as adding tables that already exist or duplicating fields
    (sync-database! db)
    (mapv table-details (db/select Table, :db_id (u/get-id db), {:order-by [:name]}))))


;; ## SYNC TABLE

(expect
  (merge table-defaults
         {:schema       "default"
          :name         "movie"
          :display_name "Movie"
          :fields       [(merge field-defaults
                                {:name          "id"
                                 :display_name  "ID"
                                 :database_type "SERIAL"
                                 :base_type     :type/Integer})
                         (merge field-defaults
                                {:name          "studio"
                                 :display_name  "Studio"
                                 :database_type "VARCHAR"
                                 :base_type     :type/Text})
                         (merge field-defaults
                                {:name          "title"
                                 :display_name  "Title"
                                 :database_type "VARCHAR"
                                 :base_type     :type/Text
                                 :special_type  :type/Title})]})
  (tt/with-temp* [Database [db    {:engine :sync-test}]
                  Table    [table {:name   "movie"
                                   :schema "default"
                                   :db_id  (u/get-id db)}]]
    (sync-table! table)
    (table-details (Table (:id table)))))


;; test that we prevent running simultaneous syncs on the same database

(defonce ^:private calls-to-describe-database (atom 0))

(defrecord ConcurrentSyncTestDriver []
  clojure.lang.Named
  (getName [_] "ConcurrentSyncTestDriver"))

(extend ConcurrentSyncTestDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:describe-database (fn [_ _]
                               (swap! calls-to-describe-database inc)
                               (Thread/sleep 1000)
                               {:tables #{}})
          :describe-table    (constantly nil)
          :details-fields    (constantly [])}))

(driver/register-driver! :concurrent-sync-test (ConcurrentSyncTestDriver.))

;; only one sync should be going on at a time
(expect
 ;; describe-database gets called twice during a single sync process, once for syncing tables and a second time for
 ;; syncing the _metabase_metadata table
 2
 (tt/with-temp* [Database [db {:engine :concurrent-sync-test}]]
   (reset! calls-to-describe-database 0)
   ;; start a sync processes in the background. It should take 1000 ms to finish
   (let [f1 (future (sync-database! db))
         f2 (do
              ;; wait 200 ms to make sure everything is going
              (Thread/sleep 200)
              ;; Start another in the background. Nothing should happen here because the first is already running
              (future (sync-database! db)))]
     ;; Start another in the foreground. Again, nothing should happen here because the original should still be
     ;; running
     (sync-database! db)
     ;; make sure both of the futures have finished
     (deref f1)
     (deref f2)
     ;; Check the number of syncs that took place. Should be 2 (just the first)
     @calls-to-describe-database)))


;; Test that we will remove field-values when they aren't appropriate. Calling `sync-database!` below should cause
;; them to get removed since the Field isn't `has_field_values` = `list`
(expect
  [[1 2 3]
   nil]
  (tt/with-temp* [Database [db {:engine :sync-test}]]
    (sync-database! db)
    (let [table-id (db/select-one-id Table, :schema "default", :name "movie")
          field-id (db/select-one-id Field, :table_id table-id, :name "studio")]
      (tt/with-temp FieldValues [_ {:field_id field-id
                                    :values   "[1,2,3]"}]
        (let [initial-field-values (db/select-one-field :values FieldValues, :field_id field-id)]
          (sync-database! db)
          [initial-field-values
           (db/select-one-field :values FieldValues, :field_id field-id)])))))


;; ## Individual Helper Fns

(defn- force-sync-table!
  "Updates the `:fields_hash` to ensure that the sync process will include fields in the sync"
  [table]
  (db/update! Table (u/get-id table), :fields_hash "something new")
  (sync-table! (Table (data/id :venues))))

;; ## TEST PK SYNCING
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

;; ## FK SYNCING

;; Check that Foreign Key relationships were created on sync as we expect

(expect (data/id :venues :id)
  (db/select-one-field :fk_target_field_id Field, :id (data/id :checkins :venue_id)))

(expect (data/id :users :id)
  (db/select-one-field :fk_target_field_id Field, :id (data/id :checkins :user_id)))

(expect (data/id :categories :id)
  (db/select-one-field :fk_target_field_id Field, :id (data/id :venues :category_id)))

;; Check that sync-table! causes FKs to be set like we'd expect
(expect [{:special_type :type/FK, :fk_target_field_id true}
         {:special_type nil,      :fk_target_field_id false}
         {:special_type :type/FK, :fk_target_field_id true}]
  (let [field-id (data/id :checkins :user_id)
        get-special-type-and-fk-exists? (fn []
                                          (into {} (-> (db/select-one [Field :special_type :fk_target_field_id],
                                                         :id field-id)
                                                       (update :fk_target_field_id #(db/exists? Field :id %)))))]
    [ ;; FK should exist to start with
     (get-special-type-and-fk-exists?)
     ;; Clear out FK / special_type
     (do (db/update! Field field-id, :special_type nil, :fk_target_field_id nil)
         (get-special-type-and-fk-exists?))
     ;; Run sync-table and they should be set again
     (let [table (Table (data/id :checkins))]
       (sync-table! table)
       (get-special-type-and-fk-exists?))]))


;;; ## FieldValues Syncing

(let [get-field-values    (fn [] (db/select-one-field :values FieldValues, :field_id (data/id :venues :price)))
      get-field-values-id (fn [] (db/select-one-id FieldValues, :field_id (data/id :venues :price)))]
  ;; Test that when we delete FieldValues syncing the Table again will cause them to be re-created
  (expect
    [[1 2 3 4]  ; 1
     nil        ; 2
     [1 2 3 4]] ; 3
    [ ;; 1. Check that we have expected field values to start with
     (get-field-values)
     ;; 2. Delete the Field values, make sure they're gone
     (do (db/delete! FieldValues :id (get-field-values-id))
         (get-field-values))
     ;; 3. Now re-sync the table and make sure they're back
     (do (sync-table! (Table (data/id :venues)))
         (get-field-values))])

  ;; Test that syncing will cause FieldValues to be updated
  (expect
    [[1 2 3 4]  ; 1
     [1 2 3]    ; 2
     [1 2 3 4]] ; 3
    [ ;; 1. Check that we have expected field values to start with
     (get-field-values)
     ;; 2. Update the FieldValues, remove one of the values that should be there
     (do (db/update! FieldValues (get-field-values-id), :values [1 2 3])
         (get-field-values))
     ;; 3. Now re-sync the table and make sure the value is back
     (do (sync-table! (Table (data/id :venues)))
         (get-field-values))]))

;; Make sure that if a Field's cardinality passes `list-cardinality-threshold` (currently 100) the corresponding
;; FieldValues entry will be deleted (#3215)
(defn- insert-range-sql
  "Generate SQL to insert a row for each number in `rang`."
  [rang]
  (str "INSERT INTO blueberries_consumed (num) VALUES "
       (str/join ", " (for [n rang]
                        (str "(" n ")")))))

(defn- exec! [conn statements]
  (doseq [statement statements]
    (jdbc/execute! conn [statement])))

(defmacro ^:private with-new-mem-db
  "Setup a in-memory H2 database with a `Database` instance bound to `db-sym` and a connection to that H3 database
  bound to `conn-sym`."
  [db-sym conn-sym & body]
  `(let [details# {:db (str "mem:" (tu/random-name) ";DB_CLOSE_DELAY=10")}]
     (binding [mdb/*allow-potentailly-unsafe-connections* true]
       (tt/with-temp Database [db# {:engine :h2, :details details#}]
         (jdbc/with-db-connection [conn# (sql/connection-details->spec (driver/engine->driver :h2) details#)]
           (let [~db-sym db#
                 ~conn-sym conn#]
             ~@body))))))

(expect
  false
  (with-new-mem-db db conn
    ;; create the `blueberries_consumed` table and insert 50 values
    (exec! conn ["CREATE TABLE blueberries_consumed (num INTEGER NOT NULL);"
                 (insert-range-sql (range 50))])
    (sync-database! db)
    (let [table-id (db/select-one-id Table :db_id (u/get-id db))
          field-id (db/select-one-id Field :table_id table-id)]
      ;; field values should exist...
      (assert (= (count (db/select-one-field :values FieldValues :field_id field-id))
                 50))
      ;; ok, now insert enough rows to push the field past the `list-cardinality-threshold` and sync again,
      ;; there should be no more field values
      (exec! conn [(insert-range-sql (range 50 (+ 100 field-values/list-cardinality-threshold)))])
      (sync-database! db)
      (db/exists? FieldValues :field_id field-id))))

;; TODO - hey, what is this testing? If you wrote this test, please explain what's going on here
(defn- narrow-to-min-max [row]
  (-> row
      (get-in [:type :type/Number])
      (select-keys [:min :max])
      (update :min #(u/round-to-decimals 4 %))
      (update :max #(u/round-to-decimals 4 %))))

(expect
  [{:min -165.374 :max -73.9533}
   {:min 10.0646 :max 40.7794}]
  (tt/with-temp* [Database [database {:details (:details (Database (data/id))), :engine :h2}]
                  Table    [table    {:db_id (u/get-id database), :name "VENUES"}]]
    (sync-table! table)
    (map narrow-to-min-max
         [(db/select-one-field :fingerprint Field, :id (data/id :venues :longitude))
          (db/select-one-field :fingerprint Field, :id (data/id :venues :latitude))])))

(defmacro ^{:style/indent 2} throw-if-called [fn-var & body]
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
  (with-new-mem-db db conn
    (let [get-table #(db/select-one Table :db_id (u/get-id db))]
      ;; create the `blueberries_consumed` table and insert 50 values
      (exec! conn ["CREATE TABLE blueberries_consumed (num SMALLINT NOT NULL);"
                   (insert-range-sql (range 50))])
      (sync-database! db)
      ;; After this sync, we know about the new table and it's SMALLINT column
      (let [table-id                     (u/get-id (get-table))
            get-field                    #(db/select-one Field :table_id table-id)
            {old-hash :fields_hash}      (get-table)
            {old-db-type :database_type} (get-field)]
        ;; Change the column from SMALLINT to INTEGER. In clojure-land these are both integers, but this change
        ;; should trigger a hash miss and thus resync the table, since something has changed
        (exec! conn ["ALTER TABLE blueberries_consumed ALTER COLUMN num INTEGER"])
        (sync-database! db)
        (let [{new-hash :fields_hash}      (get-table)
              {new-db-type :database_type} (get-field)]

          ;; Syncing again with no change should not call sync-field-instances! or update the hash
          (throw-if-called metabase.sync.sync-metadata.fields/sync-field-instances!
              (sync-database! db)
            [old-db-type
             new-db-type
             (= old-hash new-hash)
             (= new-hash (:fields_hash (get-table)))]))))))

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
  (with-new-mem-db db conn
    (let [get-table #(db/select-one Table :db_id (u/get-id db))]
      ;; create the `blueberries_consumed` table and insert 50 values
      (exec! conn ["CREATE TABLE blueberries_consumed (num SMALLINT NOT NULL)"
                   (insert-range-sql (range 50))])
      (sync-database! db)
      ;; We should now have a hash value for num as a SMALLINT
      (let [table-id        (u/get-id (get-table))
            before-table-md (table-md-with-hash table-id)
            _               (exec! conn ["ALTER TABLE blueberries_consumed ADD COLUMN weight FLOAT"])
            _               (sync-database! db)
            ;; Now that hash will include num and weight
            after-table-md  (table-md-with-hash table-id)]
        [(no-fields-hash before-table-md)
         (no-fields-hash after-table-md)
         (= (:fields-hash before-table-md)
            (:fields-hash after-table-md))]))))

;; Drops a column, ensures sync finds the drop, updates the hash
(expect
  [
   ;; Test starts with two columns
   {:active-fields 2, :inactive-fields 0}
   ;; Dropped the weight column
   {:active-fields 1, :inactive-fields 1}
   ;; Hashes should be different without the weight column
   false]
  (with-new-mem-db db conn
    (let [get-table #(db/select-one Table :db_id (u/get-id db))]
      ;; create the `blueberries_consumed` table and insert 50 values
      (exec! conn ["CREATE TABLE blueberries_consumed (num SMALLINT NOT NULL, weight FLOAT)"
                   (insert-range-sql (range 50))])
      (sync-database! db)
      ;; We should now have a hash value for num as a SMALLINT
      (let [table-id        (u/get-id (get-table))
            before-table-md (table-md-with-hash table-id)
            _               (exec! conn ["ALTER TABLE blueberries_consumed DROP COLUMN weight"])
            _               (sync-database! db)
            ;; Now that hash will include num and weight
            after-table-md  (table-md-with-hash table-id)]
        [(no-fields-hash before-table-md)
         (no-fields-hash after-table-md)
         (= (:fields-hash before-table-md)
            (:fields-hash after-table-md))]))))

;; Drops and readds a column, ensures that the hash is back to it's original value
(expect
  [
   ;; Both num and weight columns should be found
   {:active-fields 2, :inactive-fields 0}
   ;; Both columns should still be present
   {:active-fields 2, :inactive-fields 0}
   ;; The hashes should be the same
   true]
  (with-new-mem-db db conn
    (let [get-table #(db/select-one Table :db_id (u/get-id db))]
      ;; create the `blueberries_consumed` table and insert 50 values
      (exec! conn ["CREATE TABLE blueberries_consumed (num SMALLINT NOT NULL, weight FLOAT)"
                   (insert-range-sql (range 50))])
      (sync-database! db)
      ;; We should now have a hash value for num as a SMALLINT
      (let [table-id        (u/get-id (get-table))
            before-table-md (table-md-with-hash table-id)
            _               (exec! conn ["ALTER TABLE blueberries_consumed DROP COLUMN weight"])
            _               (sync-database! db)
            _               (exec! conn ["ALTER TABLE blueberries_consumed ADD COLUMN weight FLOAT"])
            _               (sync-database! db)
            ;; Now that hash will include num and weight
            after-table-md  (table-md-with-hash table-id)]
        [(no-fields-hash before-table-md)
         (no-fields-hash after-table-md)
         (= (:fields-hash before-table-md)
            (:fields-hash after-table-md))])))  )
