(ns metabase-enterprise.write-connection.core-test
  "Tests for EE write connection core functions (PRO-86)."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-python.impl]
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase-enterprise.transforms.instrumentation :as transforms.instrumentation]
   [metabase-enterprise.transforms.query-impl]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase-enterprise.write-connection.core :as write-connection]
   [metabase.driver :as driver]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.search.in-place.legacy :as search.legacy]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.warehouse-schema.table :as schema.table]
   [metabase.warehouses.models.database :as database]
   [metabase.write-connection.core :as write-connection.oss]
   [toucan2.core :as t2]))

(deftest get-write-database-id-no-write-connection-test
  (testing "get-write-database-id returns nil when no write connection configured"
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-temp [:model/Database db {}]
        (is (nil? (write-connection/get-write-database-id (:id db)))
            "Should return nil when write_database_id is NULL")
        (is (nil? (write-connection/get-write-database-id db))
            "Should return nil when passed database map")))))

(deftest get-write-database-id-with-write-connection-test
  (testing "get-write-database-id returns write database ID when configured"
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-temp [:model/Database parent-db {}
                     :model/Database write-db {}]
        ;; Link the write database to the parent
        (t2/update! :model/Database (:id parent-db) {:write_database_id (:id write-db)})
        (is (= (:id write-db) (write-connection/get-write-database-id (:id parent-db)))
            "Should return write database ID")
        (is (= (:id write-db) (write-connection/get-write-database-id parent-db))
            "Should work with database map too")))))

(deftest get-effective-database-id-no-write-connection-test
  (testing "get-effective-database-id returns original ID when no write connection"
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-temp [:model/Database db {}]
        (is (= (:id db) (write-connection/get-effective-database-id (:id db)))
            "Should return original ID when no write connection")
        (is (= (:id db) (write-connection/get-effective-database-id db))
            "Should work with database map")))))

(deftest get-effective-database-id-with-write-connection-test
  (testing "get-effective-database-id returns write database ID when configured"
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-temp [:model/Database parent-db {}
                     :model/Database write-db {}]
        (t2/update! :model/Database (:id parent-db) {:write_database_id (:id write-db)})
        (is (= (:id write-db) (write-connection/get-effective-database-id (:id parent-db)))
            "Should return write database ID when configured")
        (is (= (:id write-db) (write-connection/get-effective-database-id parent-db))
            "Should work with database map")))))

(deftest is-write-database?-test
  (testing "is-write-database? correctly identifies write databases"
    (mt/with-temp [:model/Database parent-db {}
                   :model/Database write-db {}
                   :model/Database standalone-db {}]
      ;; Link write-db to parent-db
      (t2/update! :model/Database (:id parent-db) {:write_database_id (:id write-db)})
      (testing "returns false for parent database"
        (is (false? (write-connection/is-write-database? parent-db))))
      (testing "returns true for write database"
        (is (true? (write-connection/is-write-database? write-db))))
      (testing "returns false for standalone database"
        (is (false? (write-connection/is-write-database? standalone-db)))))))

(deftest write-database-lookup-with-map-and-id-test
  (testing "Functions handle both database maps and IDs consistently"
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-temp [:model/Database parent-db {}
                     :model/Database write-db {}]
        (t2/update! :model/Database (:id parent-db) {:write_database_id (:id write-db)})
        (testing "get-write-database-id"
          (is (= (write-connection/get-write-database-id (:id parent-db))
                 (write-connection/get-write-database-id parent-db))
              "Should return same result for ID and map"))
        (testing "get-effective-database-id"
          (is (= (write-connection/get-effective-database-id (:id parent-db))
                 (write-connection/get-effective-database-id parent-db))
              "Should return same result for ID and map"))))))

(deftest cascade-delete-parent-deletes-write-db-test
  (testing "Deleting a parent database also deletes its write database"
    (mt/with-temp [:model/Database write-db {}
                   :model/Database parent-db {:write_database_id (:id write-db)}]
      (let [write-db-id  (:id write-db)
            parent-db-id (:id parent-db)]
        (t2/delete! :model/Database :id parent-db-id)
        (is (not (t2/exists? :model/Database :id parent-db-id))
            "Parent database should be deleted")
        (is (not (t2/exists? :model/Database :id write-db-id))
            "Write database should be cascade-deleted"))))
  (testing "Deleting a write database does NOT delete the parent"
    (mt/with-temp [:model/Database write-db {}
                   :model/Database parent-db {:write_database_id (:id write-db)}]
      (let [write-db-id  (:id write-db)
            parent-db-id (:id parent-db)]
        (t2/delete! :model/Database :id write-db-id)
        (is (not (t2/exists? :model/Database :id write-db-id))
            "Write database should be deleted")
        (is (t2/exists? :model/Database :id parent-db-id)
            "Parent database should still exist")
        (is (nil? (:write_database_id (t2/select-one :model/Database :id parent-db-id)))
            "Parent's write_database_id should be nulled by FK")))))

(deftest get-effective-database-tags-write-connection-test
  (testing "get-effective-database tags the write DB with :connection/type :write and :connection/parent-id"
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-temp [:model/Database parent-db {}
                     :model/Database write-db {}]
        (t2/update! :model/Database (:id parent-db) {:write_database_id (:id write-db)})
        (let [effective (write-connection/get-effective-database (:id parent-db))]
          (is (= (:id write-db) (:id effective)))
          (is (= :write (:connection/type effective)))
          (is (= (:id parent-db) (:connection/parent-id effective))))))))

(deftest get-effective-database-tags-primary-when-no-write-connection-test
  (testing "get-effective-database tags with :connection/type :primary when no write connection"
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-temp [:model/Database db {}]
        (let [effective (write-connection/get-effective-database (:id db))]
          (is (= (:id db) (:id effective)))
          (is (= :primary (:connection/type effective)))
          (is (nil? (:connection/parent-id effective))))))))

(deftest using-write-connection?-test
  (testing "using-write-connection? checks :connection/type on the db map"
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-temp [:model/Database parent-db {}
                     :model/Database write-db {}]
        (t2/update! :model/Database (:id parent-db) {:write_database_id (:id write-db)})
        (let [write-effective   (write-connection/get-effective-database (:id parent-db))
              primary-effective (write-connection/get-effective-database (:id write-db))]
          (is (true? (write-connection.oss/using-write-connection? write-effective)))
          (is (false? (write-connection.oss/using-write-connection? primary-effective))))))))

(deftest transform-details-db-id-uses-parent-id-test
  (testing "Both MBQL and Python transforms use parent DB ID in :db-id of transform-details"
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-temp [:model/Database parent-db {}
                     :model/Database write-db {}]
        (t2/update! :model/Database (:id parent-db) {:write_database_id (:id write-db)})
        (let [captured-db-ids (atom {})
              sentinel        (ex-info "test-sentinel" {:type ::sentinel})
              capture-and-throw
              (fn [_run-id _driver transform-details & _]
                (swap! captured-db-ids assoc
                       (if (contains? transform-details :query) :mbql :python)
                       (:db-id transform-details))
                (throw sentinel))]
          (with-redefs [transforms.util/run-cancelable-transform!        capture-and-throw
                        transforms.util/compile-source                   (constantly {:query "SELECT 1" :params []})
                        transforms.util/qualified-table-name             (constantly :test/output)
                        transforms.util/required-database-features       (constantly #{})
                        transforms.util/db-routing-enabled?              (constantly false)
                        transforms.util/try-start-unless-already-running (constantly {:id 1})
                        transforms.instrumentation/with-timing           (fn [_ _ body-fn] (body-fn))
                        driver/connection-spec                           (constantly {})]
            (try
              (transforms.execute/execute!
               {:id     1
                :source {:type "query" :query {:database (:id parent-db)}}
                :target {:type "table" :schema "test_schema" :name "output"}}
               nil)
              (catch Exception e
                (when-not (= ::sentinel (:type (ex-data e)))
                  (throw e)))))
          (with-redefs [transforms.util/run-cancelable-transform!        capture-and-throw
                        transforms.util/python-transform?                (constantly true)
                        transforms.util/qualified-table-name             (constantly :test/output)
                        transforms.util/try-start-unless-already-running (constantly {:id 2})
                        transforms.instrumentation/with-timing           (fn [_ _ body-fn] (body-fn))
                        driver/connection-spec                           (constantly {})]
            (try
              (transforms.execute/execute!
               {:id     2
                :source {:type "python"}
                :target {:database (:id parent-db) :type "table" :schema "test_schema" :name "output"}}
               {})
              (catch Exception e
                (when-not (= ::sentinel (:type (ex-data e)))
                  (throw e)))))
          (is (= (:id parent-db) (:mbql @captured-db-ids))
              "MBQL transform uses parent DB ID")
          (is (= (:id parent-db) (:python @captured-db-ids))
              "Python transform uses parent DB ID"))))))

(deftest write-db-permissions-fail-closed-test
  (testing "Write databases deny mi/can-read? and mi/can-write? for all users"
    (mt/with-temp [:model/Database parent-db {}
                   :model/Database write-db {}]
      (database/link-write-database! (:id parent-db) (:id write-db))
      (testing "Regular user"
        (mt/with-test-user :rasta
          (is (false? (mi/can-read? write-db))
              "can-read? returns false for write DB")
          (is (false? (mi/can-write? write-db))
              "can-write? returns false for write DB")))
      (testing "Admin user"
        (mt/with-test-user :crowberto
          (is (false? (mi/can-read? write-db))
              "can-read? returns false for write DB even for admin")
          (is (false? (mi/can-write? write-db))
              "can-write? returns false for write DB even for admin")))
      (testing "Parent DB is unaffected"
        (mt/with-test-user :rasta
          (is (true? (mi/can-read? parent-db))
              "can-read? returns true for parent DB"))))))

(deftest serdes-extract-excludes-write-databases-test
  (testing "serdes extract-query for Database excludes write databases"
    (mt/with-temp [:model/Database parent-db {}
                   :model/Database write-db {}]
      (t2/update! :model/Database (:id parent-db) {:write_database_id (:id write-db)})
      (let [extracted-ids (into #{} (map :id) (serdes/extract-query "Database" {}))]
        (is (contains? extracted-ids (:id parent-db))
            "Parent database should be included in serdes extract")
        (is (not (contains? extracted-ids (:id write-db)))
            "Write database should be excluded from serdes extract")))))

(deftest legacy-search-excludes-write-databases-test
  (testing "Legacy search for 'database' model excludes write databases"
    (mt/with-temp [:model/Database parent-db {:name "parent-search-test-db"}
                   :model/Database write-db {:name "write-search-test-db"}]
      (t2/update! :model/Database (:id parent-db) {:write_database_id (:id write-db)})
      (let [search-ctx {:search-string               nil
                        :archived?                   false
                        :models                      #{"database"}
                        :model-ancestors?            false
                        :current-user-id             (mt/user->id :crowberto)
                        :is-superuser?               true
                        :is-data-analyst?            false
                        :current-user-perms          #{"/"}
                        :calculate-available-models? false}
            results    (t2/query (search.legacy/full-search-query search-ctx))
            result-ids (into #{} (map :id) results)]
        (is (contains? result-ids (:id parent-db))
            "Parent database should appear in legacy search results")
        (is (not (contains? result-ids (:id write-db)))
            "Write database should NOT appear in legacy search results")))))

(deftest present-table-strips-write-database-id-test
  (testing "present-table strips :write_database_id from the :db hydration"
    (let [table  {:db     {:id 1 :name "Test DB" :write_database_id 42}
                  :schema "public"}
          result (schema.table/present-table table)]
      (is (not (contains? (:db result) :write_database_id))))))

(deftest sync-schema-blocks-write-databases-test
  (testing "POST /api/table/:id/sync_schema"
    (mt/with-temp [:model/Database parent-db {:engine "h2", :details (:details (mt/db))}
                   :model/Database write-db {:engine "h2", :details (:details (mt/db))}
                   :model/Table write-tbl {:db_id (:id write-db) :schema "PUBLIC"}
                   :model/Table parent-tbl {:db_id (:id parent-db) :schema "PUBLIC"}]
      (database/link-write-database! (:id parent-db) (:id write-db))
      (testing "returns 404 for tables belonging to write databases"
        (is (= "Not found."
               (mt/user-http-request :crowberto :post 404
                                     (format "table/%d/sync_schema" (u/the-id write-tbl))))))
      (testing "parent database tables can still be synced"
        (let [sync-called? (promise)]
          (with-redefs [sync/sync-table! (fn [_] (deliver sync-called? true))]
            (mt/user-http-request :crowberto :post 200
                                  (format "table/%d/sync_schema" (u/the-id parent-tbl)))
            (is (true? (deref sync-called? 10000 :sync-never-called)))))))))

(deftest write-database-id-cache-test
  (testing "write-database-id? cache is updated correctly through the link-unlink lifecycle"
    (mt/with-temp [:model/Database parent-db {}
                   :model/Database write-db {}]
      (let [write-db-id (:id write-db)]
        (testing "before linking, write DB is not recognized as a write database"
          (is (false? (database/is-write-database? write-db))))
        (testing "after linking parent -> write DB"
          (database/link-write-database! (:id parent-db) write-db-id)
          (is (true? (database/is-write-database? write-db))))
        (testing "after unlinking"
          (database/unlink-write-database! (:id parent-db) write-db-id)
          (is (false? (database/is-write-database? write-db))))))))

(deftest get-write-database-id-cache-test
  (testing "get-write-database-id cache is updated correctly through the link-unlink lifecycle"
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-temp [:model/Database parent-db {}
                     :model/Database write-db {}]
        (let [parent-id   (:id parent-db)
              write-db-id (:id write-db)]
          (testing "before linking, returns nil (and caches nil)"
            (is (nil? (write-connection/get-write-database-id parent-id))))
          (testing "after linking, returns write DB ID (cache invalidated)"
            (database/link-write-database! parent-id write-db-id)
            (is (= write-db-id (write-connection/get-write-database-id parent-id))))
          (testing "after unlinking, returns nil again (cache invalidated)"
            (database/unlink-write-database! parent-id write-db-id)
            (is (nil? (write-connection/get-write-database-id parent-id)))))))))

(deftest feature-flag-gating-test
  (testing "EE write connection functions require :advanced-permissions feature"
    (mt/with-temp [:model/Database parent-db {}
                   :model/Database write-db {}]
      (database/link-write-database! (:id parent-db) (:id write-db))
      (testing "with :advanced-permissions, EE implementation is active"
        (mt/with-premium-features #{:advanced-permissions}
          (is (= (:id write-db) (write-connection.oss/get-write-database-id (:id parent-db))))
          (let [effective (write-connection.oss/get-effective-database (:id parent-db))]
            (is (= :write (:connection/type effective)))
            (is (= (:id parent-db) (:connection/parent-id effective))))))
      (testing "with only :transforms, falls back to OSS stubs"
        (mt/with-premium-features #{:transforms}
          (is (nil? (write-connection.oss/get-write-database-id (:id parent-db))))
          (let [effective (write-connection.oss/get-effective-database (:id parent-db))]
            (is (= :primary (:connection/type effective)))
            (is (nil? (:connection/parent-id effective)))))))))
