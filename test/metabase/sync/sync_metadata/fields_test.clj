(ns metabase.sync.sync-metadata.fields-test
  "Tests for the logic that syncs Field models with the Metadata fetched from a DB. (There are more tests for this
  behavior in the namespace `metabase.sync-database.sync-dynamic-test`, which is sort of a misnomer.)"
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.test :refer :all]
            [expectations :refer [expect]]
            [medley.core :as m]
            [metabase.models.field :refer [Field]]
            [metabase.models.table :refer [Table]]
            [metabase.query-processor :as qp]
            [metabase.sync :as sync]
            [metabase.sync.util-test :as sync.util-test]
            [metabase.test.data :as data]
            [metabase.test.data.one-off-dbs :as one-off-dbs]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Dropping & Undropping Columns                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- with-test-db-before-and-after-altering
  "Testing function that performs the following steps:

   1.  Create a temporary test database & syncs it
   2.  Executes `(f database)`
   3.  Drops one of the columns from the test DB & syncs it again
   4.  Executes `(f database)` a second time
   5.  Returns a map containing results from both calls to `f` for comparison."
  [alter-sql f]
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
      (jdbc/execute! one-off-dbs/*conn* [alter-sql])
      ;; ...and re-sync...
      (sync/sync-database! (data/db))
      ;; ...now let's see how (f) may have changed! Compare to original.
      {:before-sync f-before
       :after-sync  (f (data/db))})))

(deftest renaming-fields-test
  (testing "make sure we can identify case changes on a field (#7923)"
    (let [db-state (with-test-db-before-and-after-altering
                     "ALTER TABLE \"birds\" RENAME COLUMN \"example_name\" to \"Example_Name\";"
                     (fn [database]
                       (set
                        (map (partial into {})
                             (db/select [Field :id :name :active]
                                        :table_id [:in (db/select-ids Table :db_id (u/get-id database))])))))]
      (is (= {:before-sync #{{:name "species",      :active true}
                             {:name "example_name", :active true}}
              :after-sync #{{:name "species",      :active true}
                            {:name "Example_Name", :active true}}}
             (m/map-vals (fn [results] (into (empty results)
                                             (map #(dissoc % :id))
                                             results))
                         db-state)))
      (testing "It sees this as the same field and not a new field"
        (let [ids-of (fn [k] (->> db-state k (into #{} (map :id))))]
          (is (= (ids-of :before-sync) (ids-of :after-sync))))))))


(deftest dropping-fields-test
  (testing "make sure sync correctly marks a Field as active = false when it gets dropped from the DB"
    (is (= {:before-sync #{{:name "species",      :active true}
                           {:name "example_name", :active true}}
            :after-sync  #{{:name "species",      :active true}
                           {:name "example_name", :active false}}}
           (with-test-db-before-and-after-altering
             "ALTER TABLE \"birds\" DROP COLUMN \"example_name\";"
             (fn [database]
               (set
                (map (partial into {})
                     (db/select [Field :name :active]
                                :table_id [:in (db/select-ids Table :db_id (u/get-id database))]))))))))
  (testing "make sure deleted fields doesn't show up in `:fields` of a table"
    (is (= {:before-sync #{"species" "example_name"}
            :after-sync  #{"species"}}
           (with-test-db-before-and-after-altering
             "ALTER TABLE \"birds\" DROP COLUMN \"example_name\";"
             (fn [database]
               (let [table (hydrate (db/select-one Table :db_id (u/get-id database)) :fields)]
                 (set
                  (map :name (:fields table)))))))))
  (testing "make sure that inactive columns don't end up getting spliced into queries!"

    ;; make sure that inactive columns don't end up getting spliced into queries! This test arguably belongs in the query
    ;; processor tests since it's ultimately checking to make sure columns marked as `:active` = `false` aren't getting
    ;; put in queries with implicit `:fields` clauses, but since this could be seen as covering both QP and sync (my and
    ;; others' assumption when first coming across bug #6146 was that this was a sync issue), this test can stay here for
    ;; now along with the other test we have testing sync after dropping a column.
    (is (= {:before-sync (str "SELECT \"PUBLIC\".\"birds\".\"species\" AS \"species\", "
                              "\"PUBLIC\".\"birds\".\"example_name\" AS \"example_name\" "
                              "FROM \"PUBLIC\".\"birds\" "
                              "LIMIT 1048576")
            :after-sync  (str "SELECT \"PUBLIC\".\"birds\".\"species\" AS \"species\" "
                              "FROM \"PUBLIC\".\"birds\" "
                              "LIMIT 1048576")}
           (with-test-db-before-and-after-altering
             "ALTER TABLE \"birds\" DROP COLUMN \"example_name\";"
             (fn [database]
               (-> (qp/process-query {:database (u/get-id database)
                                      :type     :query
                                      :query    {:source-table (db/select-one-id Table
                                                                                 :db_id (u/get-id database), :name "birds")}})
                   :data
                   :native_form
                   :query)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                PK & FK Syncing                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest relation-tests
  (testing "Test PK Syncing"
    (is (= [:type/PK
            nil
            :type/PK
            :type/Latitude
            :type/PK]
           (data/with-temp-copy-of-db
             (let [get-special-type (fn [] (db/select-one-field :special_type Field, :id (data/id :venues :id)))]
               [ ;; Special type should be :id to begin with
                (get-special-type)
                ;; Clear out the special type
                (do (db/update! Field (data/id :venues :id), :special_type nil)
                    (get-special-type))
                ;; Calling sync-table! should set the special type again
                (do (sync/sync-table! (Table (data/id :venues)))
                    (get-special-type))
                ;; sync-table! should *not* change the special type of fields that are marked with a different type
                (do (db/update! Field (data/id :venues :id), :special_type :type/Latitude)
                    (get-special-type))
                ;; Make sure that sync-table runs set-table-pks-if-needed!
                (do (db/update! Field (data/id :venues :id), :special_type nil)
                    (sync/sync-table! (Table (data/id :venues)))
                    (get-special-type))]))))
    (testing "Check that Foreign Key relationships were created on sync as we expect"
      (is (= (data/id :venues :id)
             (db/select-one-field :fk_target_field_id Field, :id (data/id :checkins :venue_id))))
      (is (= (data/id :users :id)
             (db/select-one-field :fk_target_field_id Field, :id (data/id :checkins :user_id))))
      (is (= (data/id :categories :id)
             (db/select-one-field :fk_target_field_id Field, :id (data/id :venues :category_id))))))
  (testing "Check that sync-table! causes FKs to be set like we'd expect"
    (is (= {:before
            {:step-info         {:total-fks 3, :updated-fks 0, :total-failed 0}
             :task-details      {:total-fks 3, :updated-fks 0, :total-failed 0}
             :special-type      :type/FK
             :fk-target-exists? true}

            :after
            {:step-info         {:total-fks 3, :updated-fks 1, :total-failed 0}
             :task-details      {:total-fks 3, :updated-fks 1, :total-failed 0}
             :special-type      :type/FK
             :fk-target-exists? true}}
           (data/with-temp-copy-of-db
             (let [state (fn []
                           (let [{:keys                  [step-info]
                                  {:keys [task_details]} :task-history}    (sync.util-test/sync-database! "sync-fks" (data/db))
                                 {:keys [special_type fk_target_field_id]} (db/select-one [Field :special_type :fk_target_field_id]
                                                                                          :id (data/id :checkins :user_id))]
                             {:step-info         (sync.util-test/only-step-keys step-info)
                              :task-details      task_details
                              :special-type      special_type
                              :fk-target-exists? (db/exists? Field :id fk_target_field_id)}))]
               (array-map
                :before (state)
                :after  (do (db/update! Field (data/id :checkins :user_id), :special_type nil, :fk_target_field_id nil)
                            (state)))))))))





;; Check that sync-table! causes FKs to be set like we'd expect
