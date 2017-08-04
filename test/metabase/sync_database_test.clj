(ns metabase.sync-database-test
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [expectations :refer :all]
            [metabase
             [db :as mdb]
             [driver :as driver]
             [sync :refer :all]
             [util :as u]]
            [metabase.driver.generic-sql :as sql]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [field-values :as field-values :refer [FieldValues]]
             [table :refer [Table]]]
            [metabase.test
             [data :refer :all]
             [util :as tu]]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(def ^:private ^:const sync-test-tables
  {"movie"  {:name "movie"
             :schema "default"
             :fields #{{:name      "id"
                        :base-type :type/Integer}
                       {:name      "title"
                        :base-type :type/Text}
                       {:name      "studio"
                        :base-type :type/Text}}}
   "studio" {:name "studio"
             :schema nil
             :fields #{{:name         "studio"
                        :base-type    :type/Text
                        :special-type :type/PK}
                       {:name      "name"
                        :base-type :type/Text}}}})


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
         {:describe-database     describe-database
          :describe-table        describe-table
          :describe-table-fks    describe-table-fks
          :features              (constantly #{:foreign-keys})
          :details-fields        (constantly [])
          :field-values-lazy-seq (constantly [])}))


(driver/register-driver! :sync-test (SyncTestDriver.))


(defn- table-details [table]
  (into {} (-> (dissoc table :db :pk_field :field_values)
               (assoc :fields (for [field (db/select Field, :table_id (:id table), {:order-by [:name]})]
                                (into {} (dissoc field :table :db :children :qualified-name :qualified-name-components :values :target))))
               tu/boolean-ids-and-timestamps)))

(def ^:private table-defaults
  {:id                      true
   :db_id                   true
   :raw_table_id            false
   :schema                  nil
   :description             nil
   :caveats                 nil
   :points_of_interest      nil
   :show_in_getting_started false
   :entity_type             nil
   :entity_name             nil
   :visibility_type         nil
   :rows                    nil
   :active                  true
   :created_at              true
   :updated_at              true})

(def ^:private field-defaults
  {:id                 true
   :table_id           true
   :raw_column_id      false
   :description        nil
   :caveats            nil
   :points_of_interest nil
   :active             true
   :parent_id          false
   :position           0
   :preview_display    true
   :visibility_type    :normal
   :fk_target_field_id false
   :created_at         true
   :updated_at         true
   :last_analyzed      true
   :fingerprint        nil})


;; ## SYNC DATABASE
(expect
  [(merge table-defaults
          {:schema       "default"
           :name         "movie"
           :display_name "Movie"
           :fields       [(merge field-defaults
                                 {:special_type :type/PK
                                  :name         "id"
                                  :display_name "ID"
                                  :base_type    :type/Integer})
                          (merge field-defaults
                                 {:special_type       :type/FK
                                  :name               "studio"
                                  :display_name       "Studio"
                                  :base_type          :type/Text
                                  :fk_target_field_id true})
                          (merge field-defaults
                                 {:special_type nil
                                  :name         "title"
                                  :display_name "Title"
                                  :base_type    :type/Text})]})
   (merge table-defaults
          {:name         "studio"
           :display_name "Studio"
           :fields       [(merge field-defaults
                                 {:special_type :type/Name
                                  :name         "name"
                                  :display_name "Name"
                                  :base_type    :type/Text})
                          (merge field-defaults
                                 {:special_type :type/PK
                                  :name         "studio"
                                  :display_name "Studio"
                                  :base_type    :type/Text})]})]
  (tt/with-temp Database [db {:engine :sync-test}]
    (sync-database! db)
    ;; we are purposely running the sync twice to test for possible logic issues which only manifest
    ;; on resync of a database, such as adding tables that already exist or duplicating fields
    (sync-database! db)
    (mapv table-details (db/select Table, :db_id (u/get-id db), {:order-by [:name]}))))


;; ## SYNC TABLE

(expect
  (merge table-defaults
         {:schema       "default"
          :name         "movie"
          :display_name "Movie"
          :fields       [(merge field-defaults
                                {:special_type :type/PK
                                 :name         "id"
                                 :display_name "ID"
                                 :base_type    :type/Integer})
                         (merge field-defaults
                                {:special_type nil
                                 :name         "studio"
                                 :display_name "Studio"
                                 :base_type    :type/Text})
                         (merge field-defaults
                                {:special_type nil
                                 :name         "title"
                                 :display_name "Title"
                                 :base_type    :type/Text})]})
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
 ;; describe-database gets called twice during a single sync process, once for syncing tables and a second time for syncing the _metabase_metadata table
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
     ;; Start another in the foreground. Again, nothing should happen here because the original should still be running
     (sync-database! db)
     ;; make sure both of the futures have finished
     (deref f1)
     (deref f2)
     ;; Check the number of syncs that took place. Should be 2 (just the first)
     @calls-to-describe-database)))


;; Test that we will remove field-values when they aren't appropriate.
;; Calling `sync-database!` below should cause them to get removed since the Field doesn't have an appropriate special type
(expect
  [[1 2 3]
   nil]
  (tt/with-temp* [Database [db {:engine :sync-test}]]
    (sync-database! db)
    (let [table-id (db/select-one-id Table, :schema "default", :name "movie")
          field-id (db/select-one-id Field, :table_id table-id, :name "title")]
      (tt/with-temp FieldValues [_ {:field_id field-id
                                    :values   "[1,2,3]"}]
        (let [initial-field-values (db/select-one-field  :values FieldValues, :field_id field-id)]
          (sync-database! db)
          [initial-field-values
           (db/select-one-field :values FieldValues, :field_id field-id)])))))


;; ## Individual Helper Fns

;; ## TEST PK SYNCING
(expect [:type/PK
         nil
         :type/PK
         :type/Latitude
         :type/PK]
  (let [get-special-type (fn [] (db/select-one-field :special_type Field, :id (id :venues :id)))]
    [;; Special type should be :id to begin with
     (get-special-type)
     ;; Clear out the special type
     (do (db/update! Field (id :venues :id), :special_type nil)
         (get-special-type))
     ;; Calling sync-table! should set the special type again
     (do (sync-table! (Table (id :venues)))
         (get-special-type))
     ;; sync-table! should *not* change the special type of fields that are marked with a different type
     (do (db/update! Field (id :venues :id), :special_type :type/Latitude)
         (get-special-type))
     ;; Make sure that sync-table runs set-table-pks-if-needed!
     (do (db/update! Field (id :venues :id), :special_type nil)
         (sync-table! (Table (id :venues)))
         (get-special-type))]))

;; ## FK SYNCING

;; Check that Foreign Key relationships were created on sync as we expect

(expect (id :venues :id)
  (db/select-one-field :fk_target_field_id Field, :id (id :checkins :venue_id)))

(expect (id :users :id)
  (db/select-one-field :fk_target_field_id Field, :id (id :checkins :user_id)))

(expect (id :categories :id)
  (db/select-one-field :fk_target_field_id Field, :id (id :venues :category_id)))

;; Check that sync-table! causes FKs to be set like we'd expect
(expect [{:special_type :type/FK, :fk_target_field_id true}
         {:special_type nil, :fk_target_field_id false}
         {:special_type :type/FK, :fk_target_field_id true}]
  (let [field-id (id :checkins :user_id)
        get-special-type-and-fk-exists? (fn []
                                          (into {} (-> (db/select-one [Field :special_type :fk_target_field_id], :id field-id)
                                                       (update :fk_target_field_id #(db/exists? Field :id %)))))]
    [ ;; FK should exist to start with
     (get-special-type-and-fk-exists?)
     ;; Clear out FK / special_type
     (do (db/update! Field field-id, :special_type nil, :fk_target_field_id nil)
         (get-special-type-and-fk-exists?))
     ;; Run sync-table and they should be set again
     (let [table (Table (id :checkins))]
       (sync-table! table)
       (get-special-type-and-fk-exists?))]))


;;; ## FieldValues Syncing

(let [get-field-values    (fn [] (db/select-one-field :values FieldValues, :field_id (id :venues :price)))
      get-field-values-id (fn [] (db/select-one-id FieldValues, :field_id (id :venues :price)))]
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
     (do (sync-table! (Table (id :venues)))
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
     (do (sync-table! (Table (id :venues)))
         (get-field-values))]))


;; Make sure that if a Field's cardinality passes `low-cardinality-threshold` (currently 300)
;; the corresponding FieldValues entry will be deleted (#3215)
(defn- insert-range-sql [rang]
  (str "INSERT INTO blueberries_consumed (num) VALUES "
       (str/join ", " (for [n rang]
                        (str "(" n ")")))))

(expect
  false
  (let [details {:db (str "mem:" (tu/random-name) ";DB_CLOSE_DELAY=10")}]
    (binding [mdb/*allow-potentailly-unsafe-connections* true]
      (tt/with-temp Database [db {:engine :h2, :details details}]
        (jdbc/with-db-connection [conn (sql/connection-details->spec (driver/engine->driver :h2) details)]
          (let [exec! #(doseq [statement %]
                         (jdbc/execute! conn [statement]))]
            ;; create the `blueberries_consumed` table and insert a 100 values
            (exec! ["CREATE TABLE blueberries_consumed (num INTEGER NOT NULL);"
                    (insert-range-sql (range 100))])
            (sync-database! db {:full-sync? true})
            (let [table-id (db/select-one-id Table :db_id (u/get-id db))
                  field-id (db/select-one-id Field :table_id table-id)]
              ;; field values should exist...
              (assert (= (count (db/select-one-field :values FieldValues :field_id field-id))
                         100))
              ;; ok, now insert enough rows to push the field past the `low-cardinality-threshold` and sync again, there should be no more field values
              (exec! [(insert-range-sql (range 100 (+ 100 field-values/low-cardinality-threshold)))])
              (sync-database! db)
              (db/exists? FieldValues :field_id field-id))))))))
