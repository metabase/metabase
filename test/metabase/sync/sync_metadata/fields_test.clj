(ns ^:mb/driver-tests metabase.sync.sync-metadata.fields-test
  "Tests for the logic that syncs Field models with the Metadata fetched from a DB. (There are more tests for this
  behavior in the namespace `metabase.sync-database.sync-dynamic-test`, which is sort of a misnomer.)"
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.query-processor :as qp]
   [metabase.sync.core :as sync]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.sync-metadata.fields :as sync-fields]
   [metabase.sync.sync-metadata.fks :as sync-fks]
   [metabase.sync.util :as sync-util]
   [metabase.sync.util-test :as sync.util-test]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.one-off-dbs :as one-off-dbs]
   [metabase.test.mock.toucanery :as toucanery]
   [metabase.util :as u]
   [toucan2.connection :as t2.connection]
   [toucan2.core :as t2]))

(defn- do-with-test-db [thunk]
  (one-off-dbs/with-blank-db
    (doseq [statement [;; H2 needs that 'guest' user for QP purposes. Set that up
                       "CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';"
                       ;; Keep DB open until we say otherwise
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
    (thunk)))

(defmacro with-test-db
  "An empty canvas upon which you may paint your dreams.

  Creates a one-off tempory in-memory H2 database and binds this DB with `data/with-db` so you can use `data/db` and
  `data/id` to access it. `*conn*` is bound to a JDBC connection spec so you can execute DDL statements to populate it
  as needed."
  {:style/indent 0}
  [& body]
  `(do-with-test-db (fn [] ~@body)))

(defn- with-test-db-before-and-after-altering
  "Testing function that performs the following steps:
   1.  Create a temporary test database & syncs it
   2.  Optionally executes `(do-something-before database)`
   3.  Executes `(f database)`
   4.  Drops one of the columns from the test DB & syncs it again
   5.  Executes `(f database)` a second time
   6.  Returns a map containing results from both calls to `f` for comparison."
  {:style/indent [:fn]}
  [alter-sql f]
  ;; first, create a new in-memory test DB and add some data to it
  (with-test-db
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
                             (t2/select [:model/Field :id :name :active]
                                        :table_id [:in (t2/select-pks-set :model/Table :db_id (u/the-id database))])))))]
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
    (is (=? {:before-sync {"species"      {:active true}
                           "example_name" {:active true}}
             :after-sync  {"species"      {:active true}
                           "example_name" {:active false}}}
            (with-test-db-before-and-after-altering
              "ALTER TABLE \"birds\" DROP COLUMN \"example_name\";"
              (fn [database]
                (t2/select-fn->fn :name (partial into {}) :model/Field
                                  :table_id [:in (t2/select-pks-set :model/Table :db_id (u/the-id database))])))))))

(deftest mark-inactive-remove-fks-test
  (testing "when a column is dropped from the DB, sync should wipe foreign key targets and their semantic type"
    (with-test-db
      (doseq [statement ["CREATE TABLE \"flocks\" (\"id\" INTEGER PRIMARY KEY, \"example_bird_name\" VARCHAR);"
                         (str "INSERT INTO \"flocks\" (\"id\", \"example_bird_name\") VALUES "
                              "(1, 'Marshawn Finch'),  "
                              "(2, 'Steven Seagull'), "
                              "(3, 'Colin Fowl');")]]
        (jdbc/execute! one-off-dbs/*conn* [statement]))
      (sync/sync-database! (mt/db))
      (let [tables          (t2/select-pks-set :model/Table :db_id (mt/id))
            get-field-to-update (fn []
                                  (t2/select-one
                                   :model/Field
                                   :name "example_bird_name"
                                   :table_id [:in tables]))
            field-to-drop   (t2/select-one :model/Field :name "example_name" :table_id [:in tables])
            field-to-update (get-field-to-update)]
        (t2/update! :model/Field (u/the-id field-to-update) {:semantic_type      :type/FK
                                                             :fk_target_field_id (u/the-id field-to-drop)})
        ;; get the field before sync
        (let [field-before-sync (get-field-to-update)]
          ;; ok cool! now delete one of those columns...
          (jdbc/execute! one-off-dbs/*conn* ["ALTER TABLE \"birds\" DROP COLUMN \"example_name\";"])
          ;; ...and re-sync...
          (sync/sync-database! (mt/db))
          ;; ...now let's see how the field may have changed! Compare to original.
          (is (=? {:before-sync {:semantic_type      :type/FK
                                 :fk_target_field_id int?}
                   :after-sync  {:semantic_type      nil
                                 :fk_target_field_id nil}}
                  {:before-sync field-before-sync
                   :after-sync  (get-field-to-update)})))))))

(deftest base-type-change-test
  (testing "when a column changes base type, coercion_strategy is reset"
    (mt/with-temp-copy-of-db
      (let [db (mt/db)
            db-spec (sql-jdbc.conn/db->pooled-connection-spec db)]
        (doseq [statement ["DROP TABLE IF EXISTS \"base_type_change_test\";"
                           "CREATE TABLE \"base_type_change_test\" (\"string_tbc_int_col\" VARCHAR);"
                           "INSERT INTO \"base_type_change_test\" (\"string_tbc_int_col\") VALUES ('1'), ('2'), ('3');"]]
          (jdbc/execute! db-spec [statement]))
        (sync/sync-database! db)
        (let [field (t2/select-one [:model/Field :id] :name "string_tbc_int_col")]
          (mt/user-http-request :crowberto :put 200 (format "field/%d" (:id field)) {:coercion_strategy :Coercion/String->Integer})

          (sync/sync-database! db)

          (is (=? {:effective_type :type/Integer :coercion_strategy :Coercion/String->Integer}
                  (t2/select-one :model/Field :name "string_tbc_int_col")))

          (jdbc/execute! db-spec ["ALTER TABLE \"base_type_change_test\" ALTER COLUMN \"string_tbc_int_col\" TYPE int USING \"string_tbc_int_col\"::integer;"])
          (sync/sync-database! db)

          (is (=? {:coercion_strategy nil}
                  (t2/select-one :model/Field :name "string_tbc_int_col"))))))))

(deftest dont-show-deleted-fields-test
  (testing "make sure deleted fields doesn't show up in `:fields` of a table"
    (is (= {:before-sync #{"species" "example_name"}
            :after-sync  #{"species"}}
           (with-test-db-before-and-after-altering
             "ALTER TABLE \"birds\" DROP COLUMN \"example_name\";"
             (fn [database]
               (let [table (t2/hydrate (t2/select-one :model/Table :db_id (u/the-id database)) :fields)]
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
                                      :query    {:source-table (t2/select-one-pk :model/Table
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
      (letfn [(get-pk-details [] (t2/select-one [:model/Field :semantic_type :database_is_pk], :id (mt/id :venues :id)))]
        (testing "Semantic type should be :id to begin with"
          (is (= {:database_is_pk true
                  :semantic_type  :type/PK}
                 (get-pk-details))))
        (testing "Clear out the semantic type"
          (t2/update! :model/Field (mt/id :venues :id) {:semantic_type nil})
          (is (= {:database_is_pk true
                  :semantic_type  nil}
                 (get-pk-details))))
        (testing "Calling sync-table! should set the semantic type again"
          (sync/sync-table! (t2/select-one :model/Table :id (mt/id :venues)))
          (is (= {:database_is_pk true
                  :semantic_type  :type/PK}
                 (get-pk-details))))
        (testing "sync-table! should *not* change the semantic type of fields that are marked with a different type"
          (t2/update! :model/Field (mt/id :venues :id) {:semantic_type :type/Latitude})
          (is (= {:database_is_pk true
                  :semantic_type  :type/Latitude}
                 (get-pk-details))))
        (testing "Make sure that sync-table runs set-table-pks-if-needed!"
          (t2/update! :model/Field (mt/id :venues :id) {:semantic_type nil})
          (sync/sync-table! (t2/select-one :model/Table :id (mt/id :venues)))
          (is (= {:database_is_pk true
                  :semantic_type  :type/PK}
                 (get-pk-details))))))))

(deftest fk-relationships-test
  (testing "Check that Foreign Key relationships were created on sync as we expect"
    (testing "checkins.venue_id"
      (is (= (mt/id :venues :id)
             (t2/select-one-fn :fk_target_field_id :model/Field, :id (mt/id :checkins :venue_id)))))
    (testing "checkins.user_id"
      (is (= (mt/id :users :id)
             (t2/select-one-fn :fk_target_field_id :model/Field, :id (mt/id :checkins :user_id)))))
    (testing "venues.category_id"
      (is (= (mt/id :categories :id)
             (t2/select-one-fn :fk_target_field_id :model/Field, :id (mt/id :venues :category_id)))))))

(deftest update-fk-relationships-test
  (testing "Check that Foreign Key relationships can be updated"
    (let [; dataset tables need at least one field other than the ID column, so just add a dummy field
          name-field-def {:field-name "dummy", :base-type :type/Text}]
      (mt/with-temp-test-data
        [["continent_1"
          [name-field-def]
          []]
         ["continent_2"
          [name-field-def]
          []]
         ["country"
          [name-field-def {:field-name "continent_id", :base-type :type/Integer}]
          []]]
        (let [db (mt/db)
              db-spec (sql-jdbc.conn/db->pooled-connection-spec db)
              get-fk #(t2/select-one :model/Field (mt/id :country :continent_id))]
          ;; 1. add FK relationship in the database targeting continent_1
          (jdbc/execute! db-spec "ALTER TABLE country ADD CONSTRAINT country_continent_id_fkey FOREIGN KEY (continent_id) REFERENCES continent_1(id);")
          (sync/sync-database! db {:scan :schema})
          (testing "initially country's continent_id is targeting continent_1"
            (is (=? {:fk_target_field_id (mt/id :continent_1 :id)
                     :semantic_type      :type/FK}
                    (get-fk))))
          ;; 2. drop the FK relationship in the database with SQL
          (jdbc/execute! db-spec "ALTER TABLE country DROP CONSTRAINT country_continent_id_fkey;")
          (sync/sync-database! db {:scan :schema})
          ;; FIXME: The following test fails. The FK relationship is still there in the Metabase database (metabase#39687)
          #_(testing "after dropping the FK relationship, country's continent_id is targeting nothing"
              (is (=? {:fk_target_field_id nil
                       :semantic_type      :type/Category}
                      (get-fk))))
          ;; 3. add back the FK relationship but targeting continent_2
          (jdbc/execute! db-spec "ALTER TABLE country ADD CONSTRAINT country_continent_id_fkey FOREIGN KEY (continent_id) REFERENCES continent_2(id);")
          (sync/sync-database! db {:scan :schema})
          (testing "initially country's continent_id is targeting continent_2"
            (is (=? {:fk_target_field_id (mt/id :continent_2 :id)
                     :semantic_type      :type/FK}
                    (get-fk)))))))))

(deftest sync-table-fks-test
  (testing "Check that sync-table! causes FKs to be set like we'd expect"
    (mt/with-temp-copy-of-db
      (letfn [(state []
                (let [{:keys                  [step-info]
                       {:keys [task_details]} :task-history}     (sync.util-test/sync-database! "sync-fks" (mt/db))
                      {:keys [semantic_type fk_target_field_id]} (t2/select-one [:model/Field :semantic_type :fk_target_field_id]
                                                                                :id (mt/id :checkins :user_id))]
                  {:step-info         (sync.util-test/only-step-keys step-info)
                   :task-details      task_details
                   :semantic-type     semantic_type
                   :fk-target-exists? (t2/exists? :model/Field :id fk_target_field_id)}))]
        (testing "before"
          (is (= {:step-info         {:total-fks 6, :updated-fks 0, :total-failed 0}
                  :task-details      {:total-fks 6, :updated-fks 0, :total-failed 0}
                  :semantic-type     :type/FK
                  :fk-target-exists? true}
                 (state))))
        (t2/update! :model/Field (mt/id :checkins :user_id) {:semantic_type nil, :fk_target_field_id nil})
        (testing "after"
          (is (= {:step-info         {:total-fks 6, :updated-fks 1, :total-failed 0}
                  :task-details      {:total-fks 6, :updated-fks 1, :total-failed 0}
                  :semantic-type     :type/FK
                  :fk-target-exists? true}
                 (state))))))))

(deftest sync-table-fks-test2
  (testing "Check that sync-table! causes FKs to be left alone if they'd override user-set values"
    (mt/with-temp-copy-of-db
      (letfn [(state []
                (let [{:keys                  [step-info]
                       {:keys [task_details]} :task-history}     (sync.util-test/sync-database! "sync-fks" (mt/db))
                      {:keys [semantic_type fk_target_field_id]} (t2/select-one [:model/Field :semantic_type :fk_target_field_id]
                                                                                :id (mt/id :checkins :user_id))]
                  {:step-info         (sync.util-test/only-step-keys step-info)
                   :task-details      task_details
                   :semantic-type     semantic_type
                   :fk-target-exists? (t2/exists? :model/Field :id fk_target_field_id)}))]
        (testing "before"
          (is (= {:step-info         {:total-fks 6, :updated-fks 0, :total-failed 0}
                  :task-details      {:total-fks 6, :updated-fks 0, :total-failed 0}
                  :semantic-type     :type/FK
                  :fk-target-exists? true}
                 (state))))
        (mt/user-http-request :crowberto :put 200 (format "field/%d" (mt/id :checkins :user_id)) {:semantic_type :type/Name})
        (testing "after"
          (is (= {:step-info         {:total-fks 6 :updated-fks 0, :total-failed 0}
                  :task-details      {:total-fks 6, :updated-fks 0, :total-failed 0}
                  :semantic-type     :type/Name
                  :fk-target-exists? false}
                 (state))))))))

(deftest case-sensitive-conflict-test
  (testing "Two columns with same lower-case name can be synced (#17387)"
    (one-off-dbs/with-blank-db
      (doseq [statement [;; H2 needs that 'guest' user for QP purposes. Set that up
                         "CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';"
                         ;; Keep DB open until we say otherwise :)
                         "SET DB_CLOSE_DELAY -1;"
                         ;; create table & load data
                         "DROP TABLE IF EXISTS \"birds\";"
                         "CREATE TABLE \"birds\" (\"event\" VARCHAR, \"eVent\" VARCHAR);"
                         "GRANT ALL ON \"birds\" TO GUEST;"
                         (str "INSERT INTO \"birds\" (\"event\", \"eVent\") VALUES "
                              "('a', 'b'),  "
                              "('c', 'd');")]]
        (jdbc/execute! one-off-dbs/*conn* [statement]))
      (let [sync-info (sync/sync-database! (mt/db))
            field-sync-info (->> sync-info
                                 (m/find-first (comp #{"metadata"} :name))
                                 :steps
                                 (m/find-first (comp #{"sync-fields"} first)))]
        (is (=? ["sync-fields" {:total-fields 2 :updated-fields 2}] field-sync-info)))))

  (testing "Two tables with same lower-case name can be synced (SEM-258)"
    (one-off-dbs/with-blank-db
      (doseq [statement [;; H2 needs that 'guest' user for QP purposes. Set that up
                         "CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';"
                         ;; Keep DB open until we say otherwise :)
                         "SET DB_CLOSE_DELAY -1;"
                         ;; create table & load data
                         "DROP TABLE IF EXISTS \"birds\";"
                         "DROP TABLE IF EXISTS \"BIRDS\";"
                         "CREATE TABLE \"birds\" (\"event\" VARCHAR);"
                         "CREATE TABLE \"BIRDS\" (\"event\" VARCHAR);"
                         "GRANT ALL ON \"birds\" TO GUEST;"
                         "GRANT ALL ON \"BIRDS\" TO GUEST;"
                         "INSERT INTO \"birds\" (\"event\") VALUES ('a'), ('b')"
                         "INSERT INTO \"BIRDS\" (\"event\") VALUES ('c'), ('d')"]]
        (jdbc/execute! one-off-dbs/*conn* [statement]))
      (let [sync-info (sync/sync-database! (mt/db))
            field-sync-info (->> sync-info
                                 (m/find-first (comp #{"metadata"} :name))
                                 :steps
                                 (m/find-first (comp #{"sync-fields"} first)))]
        (is (=? ["sync-fields" {:total-fields 2 :updated-fields 2}] field-sync-info))))))

(mt/defdataset country
  [["continent"
    [{:field-name "name", :base-type :type/Text}]
    [["Africa"]]]
   ["country"
    [{:field-name "name", :base-type :type/Text}
     {:field-name "continent_id", :base-type :type/Integer :fk :continent}]
    [["Ghana" 1]]]])

(deftest ^:synchronized sync-fks-and-fields-test
  (testing (str "[[sync-fields/sync-fields-for-table!]] and [[sync-fks/sync-fks-for-table!]] should sync fields and fks"
                "in the same way that [[sync-fields/sync-fields!]] and [[sync-fks/sync-fks!]] do")
    (mt/test-drivers (mt/normal-drivers-with-feature :metadata/key-constraints)
      (mt/dataset country
        (let [tables (t2/select :model/Table :db_id (mt/id))]
          (doseq [[message sync-fields-and-fks!] {"for specific tables" (fn []
                                                                          (run! sync-fields/sync-fields-for-table! tables)
                                                                          (run! sync-fks/sync-fks-for-table! tables))
                                                  "for entire DB"       (fn []
                                                                          (sync-fields/sync-fields! (mt/db))
                                                                          (sync-fks/sync-fks! (mt/db)))}]
            (testing message
              ;; do this in a transaction so deleting all the Fields isn't permanent
              (t2/with-transaction [_ t2.connection/*current-connectable* {:rollback-only true}]
                ;; 1. delete the fields that were just synced
                (t2/delete! :model/Field :table_id [:in (map :id tables)])
                ;; 2. reset the sync status for each table
                (t2/update! :model/Table :id [:in (map :id tables)] {:initial_sync_status "incomplete"})
                ;; 3. sync the metadata for each table
                (if (= "for entire DB" message)
                  (let [tables-updated (atom nil)
                        original-set-initial-table-sync-complete-for-db! sync-util/set-initial-table-sync-complete-for-db!]
                    (with-redefs [sync-util/set-initial-table-sync-complete-for-db!
                                  (fn [& args]
                                    (let [r (apply original-set-initial-table-sync-complete-for-db! args)]
                                      (reset! tables-updated r)
                                      r))]
                      (sync-fields-and-fks!)
                      (testing "Correct number fo tables updated by set-initial-table-sync-complete-for-db! in batches"
                        (is (= 2 @tables-updated)))))
                  (sync-fields-and-fks!))
                (let [continent-id-field (t2/select-one :model/Field :%lower.name "id" :table_id (mt/id :continent))]
                  (is (= [{:name "continent_id", :semantic_type :type/FK, :fk_target_field_id (u/the-id continent-id-field)}
                          {:name "id",           :semantic_type :type/PK, :fk_target_field_id nil}
                          {:name "name",         :semantic_type nil,      :fk_target_field_id nil}]
                         (->> (t2/select [:model/Field
                                          [:%lower.name :name]
                                          :semantic_type
                                          :fk_target_field_id]
                                         :table_id [:in (map :id tables)])
                              distinct
                              (sort-by :name)))))))))))))

(defn db->fields [db]
  (let [tables (t2/select :model/Table :db_id (u/the-id db))]
    (mapcat (fn [table]
              (t2/select :model/Field :table_id (u/the-id table)))
            tables)))

(deftest auto-cruft-fields-with-an-l-test
  (testing "Make sure a db's settings.auto-cruft-tables actually mark tables as crufty"
    (mt/with-temp [:model/Database db {:engine ::toucanery/toucanery
                                       :settings {:auto-cruft-columns ["l"]}}]
      (sync-metadata/sync-db-metadata! db)
      (is (= [["details" :details-only]]
             (->> (db->fields db)
                  (filter #(= :details-only (:visibility_type %)))
                  (mapv (juxt :name :visibility_type))))))))

(deftest auto-cruft-all-fields-and-they-stay-crufted-test
  (testing "Make sure a db's settings.auto-cruft-tables actually mark tables as crufty"
    (mt/with-temp [:model/Database db {:engine ::toucanery/toucanery
                                       :settings {:auto-cruft-columns [".*"]}}]
      (sync-metadata/sync-db-metadata! db)
      (is (= {:details-only 12}
             (->> (db->fields db)
                  (mapv :visibility_type)
                  frequencies)))
      ;; remove cruft column directive:
      (t2/update! :model/Database (u/the-id db) {:settings {:auto-cruft-columns []}})
      (sync-metadata/sync-db-metadata! db)
      (is (= {:details-only 12}
             (->> (db->fields db)
                  (mapv :visibility_type)
                  frequencies))))))

(deftest auto-cruft-sets-preview-display-false-test
  (testing "When a field becomes crufty via auto-cruft settings, preview_display should be set to false (#10851)"
    (mt/with-temp [:model/Database db {:engine ::toucanery/toucanery}]
      (sync-metadata/sync-db-metadata! db)
      (let [details-field (t2/select-one :model/Field :name "details"
                                         :table_id [:in (map :id (t2/select :model/Table :db_id (u/the-id db)))])]
        (is (=? {:visibility_type :normal
                 :preview_display true}
                details-field)
            "before auto-cruft: field has default visibility and preview_display")
        (t2/update! :model/Database (u/the-id db) {:settings {:auto-cruft-columns ["details"]}})
        (sync-metadata/sync-db-metadata! (t2/select-one :model/Database (u/the-id db)))
        (is (=? {:visibility_type :details-only
                 :preview_display false}
                (t2/select-one :model/Field :id (:id details-field)))
            "after auto-cruft: field should have visibility_type=details-only AND preview_display=false")))))

(deftest sync-fields-resilient-to-non-existence-test
  (testing "[[sync-fields/sync-fields-for-table!]] doesn't crash on a non-existent table (SEM-39)"
    (mt/test-drivers (mt/normal-drivers)
      (let [table (t2/instance :model/Table {:id 321 :name "tbl"})]
        (is (not= ::thrown
                  (try (sync-fields/sync-fields-for-table! (mt/db) table)
                       (catch Throwable _ ::thrown))))))))

(deftest visibility-type-stays-normal-after-manual-change-test
  (testing "visibility_type remains :normal after being manually changed from :details-only"
    (mt/test-driver :postgres
      (tx/drop-if-exists-and-create-db! driver/*driver* "visibility_type_json_test")
      (let [details (mt/dbdef->connection-details :postgres :db {:database-name  "visibility_type_json_test"
                                                                 :json-unfolding true})
            spec    (sql-jdbc.conn/connection-details->spec :postgres details)]

        (doseq [statement
                ["CREATE TABLE IF NOT EXISTS test_table (
                    id INT PRIMARY KEY,
                    something JSONB);"
                 "INSERT INTO test_table (id, something) VALUES (
                    1,
                    jsonb_build_object(
                     'field1', repeat('Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ', 500),
                     'field2', repeat('The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump! ', 500)));"]]
          (jdbc/execute! spec [statement]))
        (mt/with-temp [:model/Database database {:engine :postgres, :details details}]
          (mt/with-db database
            (sync/sync-database! database)
            (let [table-id (t2/select-one-pk :model/Table :db_id (u/the-id database) :name "test_table")
                  field-after-first-sync (t2/select-one :model/Field :table_id table-id :name "something")]
              (is (= :details-only (:visibility_type field-after-first-sync))
                  "First sync should set visibility_type to :details-only for large JSONB"))

            (let [table-id (t2/select-one-pk :model/Table :db_id (u/the-id database) :name "test_table")
                  field-id (t2/select-one-pk :model/Field :table_id table-id :name "something")]

              (mt/user-http-request :crowberto :put 200 (format "field/%d" field-id) {:visibility_type :normal})

              (let [field-after-manual-change (t2/select-one :model/Field :id field-id)]
                (is (= :normal (:visibility_type field-after-manual-change))
                    "Manual change should set visibility_type to :normal")))

            (sync/sync-database! database)
            (let [table-id (t2/select-one-pk :model/Table :db_id (u/the-id database) :name "test_table")
                  field-after-second-sync (t2/select-one :model/Field :table_id table-id :name "something")]
              (is (= :normal (:visibility_type field-after-second-sync))
                  "Second sync should preserve manually set :normal visibility_type"))))))))

(deftest user-set-fks-are-preserved-by-sync-test
  (testing "Check that sync-table! doesn't remove user-set FKs during normal sync operations"
    (with-test-db
      (doseq [statement ["CREATE TABLE \"flocks\" (\"id\" INTEGER PRIMARY KEY, \"example_bird_name\" VARCHAR);"
                         (str "INSERT INTO \"flocks\" (\"id\", \"example_bird_name\") VALUES "
                              "(1, 'Marshawn Finch'),  "
                              "(2, 'Steven Seagull'), "
                              "(3, 'Colin Fowl');")]]
        (jdbc/execute! one-off-dbs/*conn* [statement]))
      (sync/sync-database! (mt/db))

      (let [tables (t2/select-pks-set :model/Table :db_id (mt/id))
            birds-example-name-field (t2/select-one :model/Field :name "example_name" :table_id [:in tables])
            flocks-example-bird-name-field (t2/select-one :model/Field :name "example_bird_name" :table_id [:in tables])]

        (testing "should not have FK relationship"
          (is (nil? (:fk_target_field_id flocks-example-bird-name-field)))
          (is (not= :type/FK (:semantic_type flocks-example-bird-name-field))))

        (t2/update! :model/Field (u/the-id flocks-example-bird-name-field)
                    {:semantic_type :type/FK
                     :fk_target_field_id (u/the-id birds-example-name-field)})

        (testing "after sync, user-set FK is preserved"
          (sync/sync-database! (mt/db))

          (let [field-after-sync (t2/select-one :model/Field :id (u/the-id flocks-example-bird-name-field))]
            (is (= :type/FK (:semantic_type field-after-sync)))
            (is (= (u/the-id birds-example-name-field) (:fk_target_field_id field-after-sync)))))))))

(deftest database-default-test
  (with-test-db
    (let [ddl "CREATE TABLE t (a INTEGER DEFAULT 42, b INTEGER NULL)"]
      (jdbc/execute! one-off-dbs/*conn* [ddl])
      (sync/sync-database! (mt/db))
      (let [table (t2/select-one :model/Table :db_id (mt/id) :name "T")
            {a "A", b "B"} (u/index-by :name (t2/select :model/Field :table_id (:id table)))]
        (is (= "42" (:database_default a)))
        (is (nil? (:database_default b)))))))

(deftest database-generated-test
  (with-test-db
    (let [ddl "CREATE TABLE t (a INTEGER GENERATED ALWAYS AS 42, b INTEGER NULL)"]
      (jdbc/execute! one-off-dbs/*conn* [ddl])
      (sync/sync-database! (mt/db))
      (let [table (t2/select-one :model/Table :db_id (mt/id) :name "T")
            {a "A", b "B"} (u/index-by :name (t2/select :model/Field :table_id (:id table)))]
        (is (true? (:database_is_generated a)))
        (is (false? (:database_is_generated b)))))))

(deftest database-nullable-test
  (with-test-db
    (let [ddl "CREATE TABLE t (a INTEGER NULL, b INTEGER NOT NULL)"]
      (jdbc/execute! one-off-dbs/*conn* [ddl])
      (sync/sync-database! (mt/db))
      (let [table (t2/select-one :model/Table :db_id (mt/id) :name "T")
            {a "A", b "B"} (u/index-by :name (t2/select :model/Field :table_id (:id table)))]
        (is (true? (:database_is_nullable a)))
        (is (false? (:database_is_nullable b)))))))
