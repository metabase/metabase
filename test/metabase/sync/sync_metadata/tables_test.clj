(ns metabase.sync.sync-metadata.tables-test
  "Test for the logic that syncs Table models with the metadata fetched from a DB."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.sync.core :as sync]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.mock.toucanery :as toucanery]
   [metabase.util :as u]
   [metabase.warehouse-schema.models.table :as table]
   [next.jdbc :as next.jdbc]
   [toucan2.core :as t2]))

(tx/defdataset db-with-a-crufty-table
  [["acquired_toucans"
    [{:field-name "species"              :base-type :type/Text}
     {:field-name "cam_has_acquired_one" :base-type :type/Boolean}]
    [["Toco"               false]
     ["Chestnut-Mandibled" true]
     ["Keel-billed"        false]
     ["Channel-billed"     false]]]
   ["south_migrationhistory"
    [{:field-name "app_name"  :base-type :type/Text}
     {:field-name "migration" :base-type :type/Text}]
    [["main" "0001_initial"]
     ["main" "0002_add_toucans"]]]])

(deftest crufty-tables-test
  (testing "south_migrationhistory, being a CRUFTY table, should still be synced, but marked as such"
    (mt/dataset metabase.sync.sync-metadata.tables-test/db-with-a-crufty-table
      (is (= #{{:name "SOUTH_MIGRATIONHISTORY" :visibility_type :cruft :initial_sync_status "complete"}
               {:name "ACQUIRED_TOUCANS"       :visibility_type nil :initial_sync_status "complete"}}
             (set (for [table (t2/select [:model/Table :name :visibility_type :initial_sync_status] :db_id (mt/id))]
                    (into {} table))))))))

(deftest transform-temp-tables-are-skipped-without-premium-features
  (let [temp-table   {:name   "mb_transform_temp_table_temp_123"
                      :schema "public"}
        normal-table {:name   "orders"
                      :schema "public"}
        db-metadata  {:tables #{temp-table normal-table}}]
    (testing "with no premium features, sync excludes transform temporary tables"
      (mt/with-premium-features #{}
        (is (= #{normal-table}
               (into #{} (remove #'sync-tables/ignore-table?) (:tables db-metadata))))))
    (testing "when hosted, includes transform temporary tables"
      (mt/with-premium-features #{:hosting}
        (is (= #{normal-table temp-table}
               (into #{} (remove #'sync-tables/ignore-table?) (:tables db-metadata))))))
    (testing "when hosted with `transforms` enabled, excludes the temp tables"
      (mt/with-premium-features #{:hosting :transforms-basic}
        (is (= #{normal-table}
               (into #{} (remove #'sync-tables/ignore-table?) (:tables db-metadata))))))))

(deftest retire-tables-test
  (testing "`retire-tables!` should retire the Table(s) passed to it, not all Tables in the DB -- see #9593"
    (mt/with-temp [:model/Database db               {}
                   :model/Table    {table-1-id :id} {:name "Table 1" :db_id (u/the-id db)}
                   :model/Table    _                {:name "Table 2" :db_id (u/the-id db)}]
      (#'sync-tables/retire-tables! #{table-1-id})
      (is (= {"Table 1" false "Table 2" true}
             (t2/select-fn->fn :name :active :model/Table :db_id (u/the-id db)))))))

(deftest sync-table-update-info-of-new-table-added-during-sync-test
  (testing "during sync, if a table is reactivated, we should update the table info if needed"
    (let [dbdef (mt/dataset-definition "sync-retired-table"
                                       [["user" [{:field-name "name" :base-type :type/Text}] [["Ngoc"]]]])]
      (mt/dataset dbdef
        (t2/update! :model/Table (mt/id :user) {:active false})
        ;; table description is changed
        (jdbc/execute! (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
                       [(sql.tx/standalone-table-comment-sql
                         (:engine (mt/db))
                         dbdef
                         (tx/map->TableDefinition {:table-name "user" :table-comment "added comment"}))])
        (sync/sync-database! (mt/db) {:sync :schema})
        (is (=? {:active true
                 :description "added comment"}
                (t2/select-one :model/Table (mt/id :user))))))))

(deftest sync-estimated-row-count-test
  (mt/test-driver :postgres
    (testing "Can sync row count"
      (mt/dataset test-data
        ;; row count is estimated so we VACUUM so the statistic table is updated before syncing
        (sql-jdbc.execute/do-with-connection-with-options
         driver/*driver*
         (mt/db)
         nil
         (fn [conn]
           (next.jdbc/execute! conn ["VACUUM;"])))
        (sync/sync-database! (mt/db) {:scan :schema})
        (is (= 100
               (t2/select-one-fn :estimated_row_count :model/Table (mt/id :venues))))))))

(defmacro ^:private run-twice
  "Run body twice. In this case, we are checking that creating and updating syncs the tables correctly w.r.t.
  cruftiness."
  [& body]
  `(do ~@body ~@body))

(deftest auto-cruft-all-tables-test
  (testing "Make sure a db's settings.auto-cruft-tables actually mark tables as crufty"
    (mt/with-temp [:model/Database db {:engine ::toucanery/toucanery
                                       :settings {:auto-cruft-tables [".*"]}}]
      (run-twice
       (sync-metadata/sync-db-metadata! db)
       (is (= #{:cruft}
              (t2/select-fn-set :visibility_type
                                :model/Table
                                :db_id
                                (u/the-id db))))))))

(deftest cruft-does-not-happen-during-update-test
  (testing "Make sure a db's settings.auto-cruft-tables actually mark tables as crufty"
    (mt/with-temp [:model/Database db {:engine ::toucanery/toucanery
                                       :settings {:auto-cruft-tables [".*"]}}]
      (let [->tables-info #(t2/select-fn-set (juxt :name :visibility_type) :model/Table :db_id (u/the-id db))]
        (sync-metadata/sync-db-metadata! db)
        (testing "Observe: the tables are marked as crufty"
          (is (= #{["employees" :cruft] ["transactions" :cruft]} (->tables-info))))
        ;; make employees visible:
        (t2/update! :model/Table :db_id (u/the-id db) :name "employees" {:visibility_type nil})
        (testing "Observe: employees is visible, but transactions is still crufty"
          (is (= #{["employees" nil] ["transactions" :cruft]} (->tables-info))))
        (sync-metadata/sync-db-metadata! db)
        (testing "tables are unchanged after sync"
          (is (= #{["employees" nil] ["transactions" :cruft]} (->tables-info))))))))

(defn run-auto-cruft-hidden-test! [original-vis-type]
  (testing (str "Make sure a db's settings.auto-cruft-tables do not unhide " original-vis-type " tables")
    (mt/with-temp [:model/Database db {:engine ::toucanery/toucanery
                                       :settings {:auto-cruft-tables []}}]
      (sync-metadata/sync-db-metadata! db)
      (t2/update! :model/Table :db_id (u/the-id db) {:visibility_type original-vis-type})
      (sync-metadata/sync-db-metadata! db)
      (is (= #{["employees" original-vis-type]
               ["transactions" original-vis-type]}
             (t2/select-fn-set (juxt :name :visibility_type) :model/Table :db_id (u/the-id db)))))))

(deftest auto-cruft-no-tables-hidden-test
  (doseq [vis-type (sort table/visibility-types)]
    (run-auto-cruft-hidden-test! vis-type)))

(deftest auto-cruft-employee-table-test
  (testing "Make sure a db's settings.auto-cruft-tables actually mark tables as crufty"
    (mt/with-temp [:model/Database db {:engine ::toucanery/toucanery
                                       :settings {:auto-cruft-tables ["employees"]}}]
      (run-twice
       (sync-metadata/sync-db-metadata! db)
       (is (= #{["employees" :cruft]
                ["transactions" nil]}
              (t2/select-fn-set (juxt :name :visibility_type) :model/Table :db_id (u/the-id db))))))))

(deftest auto-cruft-tables-with-an-l-test
  (testing "Make sure a db's settings.auto-cruft-tables actually mark tables as crufty"
    (mt/with-temp [:model/Database db {:engine ::toucanery/toucanery
                                       :settings {:auto-cruft-tables ["l"]}}]
      (run-twice
       (sync-metadata/sync-db-metadata! db)
       (is (= #{["employees" :cruft]
                ["transactions" nil]}
              (t2/select-fn-set (juxt :name :visibility_type) :model/Table :db_id (u/the-id db))))))))

(deftest auto-cruft-tables-with-an-l-or-a-y-test
  (testing "Make sure a db's settings.auto-cruft-tables actually mark tables as crufty"
    (mt/with-temp [:model/Database db {:engine ::toucanery/toucanery
                                       :settings {:auto-cruft-tables ["l" "y"]}}]
      (run-twice
       (sync-metadata/sync-db-metadata! db)
       (is (= #{["employees" :cruft]
                ["transactions" nil]}
              (t2/select-fn-set (juxt :name :visibility_type) :model/Table :db_id (u/the-id db))))))))

(deftest archive-tables-test
  (testing "Tables deactivated for more than 14 days should be archived"
    (mt/with-temp [:model/Database db {}
                   :model/Table table-1 {:name "old_table"
                                         :db_id (u/the-id db)
                                         :active false
                                         :deactivated_at (t/minus (t/offset-date-time) (t/days 15))}
                   :model/Table table-2 {:name "recent_table"
                                         :db_id (u/the-id db)
                                         :active false
                                         :deactivated_at (t/minus (t/offset-date-time) (t/days 7))}
                   :model/Table table-3 {:name "active_table"
                                         :db_id (u/the-id db)
                                         :active true}]
      (#'sync-tables/archive-tables! db)
      (testing "Old deactivated table is archived with suffix"
        (let [archived-table (t2/select-one :model/Table (:id table-1))]
          (is (some? (:archived_at archived-table)))
          (is (str/starts-with? (:name archived-table) "old_table__mbarchiv__"))))
      (testing "Recently deactivated table is not archived"
        (let [recent-table (t2/select-one :model/Table (:id table-2))]
          (is (nil? (:archived_at recent-table)))
          (is (= "recent_table" (:name recent-table)))))
      (testing "Active table is not affected"
        (let [active-table (t2/select-one :model/Table (:id table-3))]
          (is (nil? (:archived_at active-table)))
          (is (= "active_table" (:name active-table)))
          (is (true? (:active active-table))))))))

(deftest archive-tables-skips-transform-targets-test
  (testing "Tables with transform_target=true should never be archived, even if old enough"
    (mt/with-temp [:model/Database db {}
                   :model/Table provisional {:name             "transform_output"
                                             :db_id            (u/the-id db)
                                             :active           false
                                             :transform_target true
                                             :deactivated_at   (t/minus (t/offset-date-time) (t/days 30))}
                   :model/Table normal     {:name             "old_table"
                                            :db_id            (u/the-id db)
                                            :active           false
                                            :transform_target false
                                            :deactivated_at   (t/minus (t/offset-date-time) (t/days 30))}]
      (#'sync-tables/archive-tables! db)
      (testing "Transform target table is not archived or renamed"
        (let [table (t2/select-one :model/Table (:id provisional))]
          (is (nil? (:archived_at table)))
          (is (= "transform_output" (:name table)))))
      (testing "Normal table is archived as usual"
        (let [table (t2/select-one :model/Table (:id normal))]
          (is (some? (:archived_at table)))
          (is (str/starts-with? (:name table) "old_table__mbarchiv__")))))))

(deftest archive-tables-already-archived-test
  (testing "Already archived tables should not be processed again"
    (mt/with-temp [:model/Database db {}
                   :model/Table table {:name "already_archived"
                                       :db_id (u/the-id db)
                                       :active false
                                       :deactivated_at (t/minus (t/offset-date-time) (t/days 20))
                                       :archived_at (t/minus (t/offset-date-time) (t/days 5))}]
      (let [original-name (:name table)
            original-archived-at (:archived_at table)]
        (#'sync-tables/archive-tables! db)
        (let [updated-table (t2/select-one :model/Table (:id table))]
          (is (= original-name (:name updated-table)))
          (is (= original-archived-at (:archived_at updated-table))))))))

(deftest deactivated-at-timestamp-test
  (testing "deactivated_at is set when table becomes inactive"
    (mt/with-temp [:model/Database db {}
                   :model/Table table {:name "test_table"
                                       :db_id (u/the-id db)
                                       :active true}]
      (testing "Initially active table has no deactivated_at"
        (is (nil? (:deactivated_at (t2/select-one :model/Table (:id table))))))
      (testing "Setting active to false sets deactivated_at"
        (t2/update! :model/Table (:id table) {:active false})
        (let [updated-table (t2/select-one :model/Table (:id table))]
          (is (some? (:deactivated_at updated-table)))
          (is (false? (:active updated-table)))))
      (testing "Reactivating table clears deactivated_at and archived_at"
        (t2/update! :model/Table (:id table) {:archived_at (t/offset-date-time)})
        (t2/update! :model/Table (:id table) {:active true})
        (let [reactivated-table (t2/select-one :model/Table (:id table))]
          (is (nil? (:deactivated_at reactivated-table)))
          (is (nil? (:archived_at reactivated-table)))
          (is (true? (:active reactivated-table))))))))

(deftest archive-tables-permissions-security-test
  (testing "Archival prevents permission inheritance on table recreation"
    (mt/with-temp [:model/Database db {}
                   :model/Table original-table {:name "sensitive_table"
                                                :db_id (u/the-id db)
                                                :active false
                                                :deactivated_at (t/minus (t/offset-date-time) (t/days 20))}]
      (#'sync-tables/archive-tables! db)
      (testing "the original table was archived and renamed"
        (let [archived-table (t2/select-one :model/Table (:id original-table))]
          (is (some? (:archived_at archived-table)))
          (is (str/starts-with? (:name archived-table) "sensitive_table__mbarchiv__"))))
      (mt/with-temp [:model/Table new-table {:name "sensitive_table"
                                             :db_id (u/the-id db)
                                             :active true}]
        (testing "the new table should be treated as completely separate"
          (is (not= (:id original-table) (:id new-table)))
          (is (= "sensitive_table" (:name new-table)))
          (is (nil? (:archived_at new-table))))))))

(deftest computed-tables-not-marked-writable-by-sync-test
  (testing "Sync should not mark computed tables as writable, even if the driver reports them as writable"
    (mt/with-temp [:model/Database db {:engine ::toucanery/toucanery}
                   :model/Table computed-table {:name           "computed_table"
                                                :db_id          (u/the-id db)
                                                :data_authority :computed
                                                :is_writable    false}
                   :model/Table normal-table   {:name           "normal_table"
                                                :db_id          (u/the-id db)
                                                :data_authority :unconfigured
                                                :is_writable    false}]
      ;; Simulate what happens during sync: the driver reports both tables as writable
      (let [select-cols (into [:model/Table :id :name :schema :data_authority] @#'sync-tables/keys-to-update)]
        (#'sync-tables/update-table-metadata-if-needed!
         {:name "computed_table" :schema nil :is_writable true}
         (t2/select-one select-cols (:id computed-table))
         db)
        (#'sync-tables/update-table-metadata-if-needed!
         {:name "normal_table" :schema nil :is_writable true}
         (t2/select-one select-cols (:id normal-table))
         db))
      (testing "computed table should remain non-writable"
        (is (false? (t2/select-one-fn :is_writable :model/Table (:id computed-table)))))
      (testing "normal table should be updated to writable"
        (is (true? (t2/select-one-fn :is_writable :model/Table (:id normal-table))))))))

(deftest no-spurious-update-when-metadata-unchanged-test
  (testing (str "update-table-metadata-if-needed! should not issue an UPDATE (which would bump updated_at) "
                "when none of the tracked metadata fields have changed. Regression test for GHY-3272 — "
                "a customer with a trigger on metabase_table.updated_at was seeing it fire on every sync.")
    (mt/with-temp [:model/Database db {:engine ::toucanery/toucanery}
                   :model/Table    tbl {:name                    "stable_table"
                                        :db_id                   (u/the-id db)
                                        :description             nil
                                        :database_require_filter nil
                                        :estimated_row_count     100
                                        :initial_sync_status     "complete"
                                        :visibility_type         nil
                                        :is_writable             false
                                        :data_authority          :unconfigured}]
      (let [select-cols        (into [:model/Table :id :name :schema :data_authority]
                                     @#'sync-tables/keys-to-update)
            matching-metadata  {:name                    "stable_table"
                                :schema                  nil
                                :description             nil
                                :database_require_filter nil
                                :estimated_row_count     100
                                :is_writable             false}
            initial-updated-at (t2/select-one-fn :updated_at :model/Table (:id tbl))]
        (testing "no-op sync does not bump updated_at"
          (#'sync-tables/update-table-metadata-if-needed!
           matching-metadata
           (t2/select-one select-cols (:id tbl))
           db)
          (is (= initial-updated-at
                 (t2/select-one-fn :updated_at :model/Table (:id tbl)))))
        (testing "a real change still bumps updated_at"
          (#'sync-tables/update-table-metadata-if-needed!
           (assoc matching-metadata :estimated_row_count 999)
           (t2/select-one select-cols (:id tbl))
           db)
          (is (not= initial-updated-at
                    (t2/select-one-fn :updated_at :model/Table (:id tbl))))
          (is (= 999
                 (t2/select-one-fn :estimated_row_count :model/Table (:id tbl)))))))))

(deftest create-or-reactivate-tables-deterministic-id-order-test
  (testing "new tables are inserted sorted by [schema name] so auto-increment ids are assigned deterministically"
    (let [metadatas #{{:schema "public" :name "zebra"}
                      {:schema "alpha"  :name "beta"}
                      {:schema "public" :name "apple"}
                      {:schema "public" :name "mango"}}]
      (mt/with-temp [:model/Database db {}]
        (#'sync-tables/create-tables! db metadatas)
        (is (= ["beta" "apple" "mango" "zebra"]
               (map :name (t2/select [:model/Table :name]
                                     :db_id (u/the-id db)
                                     {:order-by [[:id :asc]]}))))))))

(deftest sample-database-tables-data-authority-test
  (testing "Tables from sample databases should be marked as :ingested"
    (mt/with-temp [:model/Database sample-db {:is_sample true}
                   :model/Database normal-db {:is_sample false}]
      (let [sample-table-metadata {:name "sample_table"}
            normal-table-metadata {:name "normal_table"}]
        (testing "creating a table in a sample database"
          (let [created-table (sync-tables/create-table! sample-db sample-table-metadata)]
            (is (= :ingested (:data_authority created-table)))))
        (testing "creating a table in a normal database"
          (let [created-table (sync-tables/create-table! normal-db normal-table-metadata)]
            (is (= :unconfigured (:data_authority created-table)))))
        (testing "reactivating a table in a sample database"
          (mt/with-temp [:model/Table existing-table {:db_id          (:id sample-db)
                                                      :name           "existing_sample_table"
                                                      :active         false
                                                      :data_authority :computed}]
            (sync-tables/create-or-reactivate-table! sample-db {:name "existing_sample_table"})
            (let [updated-table (t2/select-one :model/Table (:id existing-table))]
              (is (= :ingested (:data_authority updated-table)))
              (is (:active updated-table)))))))))

(deftest remove-tables-with-too-long-names-test
  (testing "Tables whose name is too long to store in the app DB are dropped, so they don't abort the creation pass"
    (let [remove-too-long @#'sync-tables/remove-tables-with-too-long-names
          database        (t2/instance :model/Database {:id 1, :name "db", :engine :h2})
          tbl             (fn [nm] {:name nm, :schema "public"})
          ok              (tbl "short_name")
          too-long        (tbl (apply str (repeat 300 "a")))]
      (testing "an over-long name is removed while the rest are kept"
        (is (= #{ok} (remove-too-long database #{ok too-long}))))
      (testing "everything is kept when all names fit"
        (is (= #{ok} (remove-too-long database #{ok}))))
      (testing "boundary: a name of exactly the max length is kept; one character longer is dropped"
        (let [at-limit   (tbl (apply str (repeat 256 "a")))
              over-limit (tbl (apply str (repeat 257 "a")))]
          (is (= #{at-limit} (remove-too-long database #{at-limit over-limit})))))
      (testing "a table whose schema (dataset) name is too long is also dropped"
        (let [long-schema {:name "t", :schema (apply str (repeat 300 "s"))}]
          (is (= #{ok} (remove-too-long database #{ok long-schema})))))
      (testing "boundary: a schema of exactly the max length is kept; one character longer is dropped"
        (let [at-limit   {:name "t1", :schema (apply str (repeat 254 "s"))}
              over-limit {:name "t2", :schema (apply str (repeat 255 "s"))}]
          (is (= #{at-limit} (remove-too-long database #{at-limit over-limit}))))))))
