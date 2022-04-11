(ns metabase.sync.sync-metadata.fields-test
  "Tests for the logic that syncs Field models with the Metadata fetched from a DB. (There are more tests for this
  behavior in the namespace `metabase.sync-database.sync-dynamic-test`, which is sort of a misnomer.)"
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.test :refer :all]
            [medley.core :as m]
            [metabase.models :refer [Field Table]]
            [metabase.query-processor :as qp]
            [metabase.sync :as sync]
            [metabase.sync.util-test :as sync.util-test]
            [metabase.test :as mt]
            [metabase.test.data.one-off-dbs :as one-off-dbs]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]))

(defn- with-test-db-before-and-after-altering
  "Testing function that performs the following steps:
   1.  Create a temporary test database & syncs it
   2.  Executes `(f database)`
   3.  Drops one of the columns from the test DB & syncs it again
   4.  Executes `(f database)` a second time
   5.  Returns a map containing results from both calls to `f` for comparison."
  {:style/indent [:fn]}
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
    (sync/sync-database! (mt/db))
    ;; ok, let's see what (f) gives us
    (let [f-before (f (mt/db))]
      ;; ok cool! now delete one of those columns...
      (jdbc/execute! one-off-dbs/*conn* [alter-sql])
      ;; ...and re-sync...
      (sync/sync-database! (mt/db))
      ;; ...now let's see how (f) may have changed! Compare to original.
      {:before-sync f-before
       :after-sync  (f (mt/db))})))

(deftest renaming-fields-test
  (testing "make sure we can identify case changes on a field (#7923)"
    (let [db-state (with-test-db-before-and-after-altering
                    "ALTER TABLE \"birds\" RENAME COLUMN \"example_name\" to \"Example_Name\";"
                    (fn [database]
                      (set
                       (map (partial into {})
                            (db/select [Field :id :name :active]
                              :table_id [:in (db/select-ids Table :db_id (u/the-id database))])))))]
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

(deftest mark-inactive-test
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
                      :table_id [:in (db/select-ids Table :db_id (u/the-id database))])))))))))

(deftest dont-show-deleted-fields-test
  (testing "make sure deleted fields doesn't show up in `:fields` of a table"
    (is (= {:before-sync #{"species" "example_name"}
            :after-sync  #{"species"}}
           (with-test-db-before-and-after-altering
            "ALTER TABLE \"birds\" DROP COLUMN \"example_name\";"
            (fn [database]
              (let [table (hydrate (db/select-one Table :db_id (u/the-id database)) :fields)]
                (set (map :name (:fields table))))))))))

(deftest dont-splice-inactive-columns-into-queries-test
  (testing (str "make sure that inactive columns don't end up getting spliced into queries! This test arguably "
                "belongs in the query processor tests since it's ultimately checking to make sure columns marked as "
                "`:active` = `false` aren't getting put in queries with implicit `:fields` clauses, but since this "
                "could be seen as covering both QP and sync "
                "(my and others' assumption when first coming across bug #6146 was that this was a sync issue), this "
                "test can stay here for now along with the other test we have testing sync after dropping a column.")
    (is (= {:before-sync (str "SELECT \"PUBLIC\".\"birds\".\"species\" AS \"species\", "
                              "\"PUBLIC\".\"birds\".\"example_name\" AS \"example_name\" "
                              "FROM \"PUBLIC\".\"birds\" "
                              "LIMIT 1048575")
            :after-sync  (str "SELECT \"PUBLIC\".\"birds\".\"species\" AS \"species\" "
                              "FROM \"PUBLIC\".\"birds\" "
                              "LIMIT 1048575")}
           (with-test-db-before-and-after-altering
             "ALTER TABLE \"birds\" DROP COLUMN \"example_name\";"
             (fn [database]
               (-> (qp/process-query {:database (u/the-id database)
                                      :type     :query
                                      :query    {:source-table (db/select-one-id Table
                                                                 :db_id (u/the-id database), :name "birds")}})
                   :data
                   :native_form
                   :query)))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                PK & FK Syncing                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest pk-sync-test
  (testing "Test PK Syncing"
    (mt/with-temp-copy-of-db
      (letfn [(get-semantic-type [] (db/select-one-field :semantic_type Field, :id (mt/id :venues :id)))]
        (testing "Semantic type should be :id to begin with"
          (is (= :type/PK
                 (get-semantic-type))))
        (testing "Clear out the semantic type"
          (db/update! Field (mt/id :venues :id), :semantic_type nil)
          (is (= nil
                 (get-semantic-type))))
        (testing "Calling sync-table! should set the semantic type again"
          (sync/sync-table! (Table (mt/id :venues)))
          (is (= :type/PK
                 (get-semantic-type))))
        (testing "sync-table! should *not* change the semantic type of fields that are marked with a different type"
          (db/update! Field (mt/id :venues :id), :semantic_type :type/Latitude)
          (is (= :type/Latitude
                 (get-semantic-type))))
        (testing "Make sure that sync-table runs set-table-pks-if-needed!"
          (db/update! Field (mt/id :venues :id), :semantic_type nil)
          (sync/sync-table! (Table (mt/id :venues)))
          (is (= :type/PK
                 (get-semantic-type))))))))

(deftest fk-relationships-test
  (testing "Check that Foreign Key relationships were created on sync as we expect"
    (testing "checkins.venue_id"
      (is (= (mt/id :venues :id)
             (db/select-one-field :fk_target_field_id Field, :id (mt/id :checkins :venue_id)))))
    (testing "checkins.user_id"
      (is (= (mt/id :users :id)
             (db/select-one-field :fk_target_field_id Field, :id (mt/id :checkins :user_id)))))
    (testing "venues.category_id"
      (is (= (mt/id :categories :id)
             (db/select-one-field :fk_target_field_id Field, :id (mt/id :venues :category_id)))))))

(deftest sync-table-fks-test
  (testing "Check that sync-table! causes FKs to be set like we'd expect"
    (mt/with-temp-copy-of-db
      (letfn [(state []
                (let [{:keys                  [step-info]
                       {:keys [task_details]} :task-history}     (sync.util-test/sync-database! "sync-fks" (mt/db))
                      {:keys [semantic_type fk_target_field_id]} (db/select-one [Field :semantic_type :fk_target_field_id]
                                                                   :id (mt/id :checkins :user_id))]
                  {:step-info         (sync.util-test/only-step-keys step-info)
                   :task-details      task_details
                   :semantic-type     semantic_type
                   :fk-target-exists? (db/exists? Field :id fk_target_field_id)}))]
        (testing "before"
          (is (= {:step-info         {:total-fks 3, :updated-fks 0, :total-failed 0}
                  :task-details      {:total-fks 3, :updated-fks 0, :total-failed 0}
                  :semantic-type     :type/FK
                  :fk-target-exists? true}
                 (state))))
        (db/update! Field (mt/id :checkins :user_id), :semantic_type nil, :fk_target_field_id nil)
        (testing "after"
          (is (= {:step-info         {:total-fks 3, :updated-fks 1, :total-failed 0}
                  :task-details      {:total-fks 3, :updated-fks 1, :total-failed 0}
                  :semantic-type     :type/FK
                  :fk-target-exists? true}
                 (state))))))))
