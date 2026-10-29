(ns metabase-enterprise.database-routing.connections-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-routing.common :as database-routing.common]
   [metabase-enterprise.database-routing.e2e-test :as e2e]
   [metabase-enterprise.test :as met]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.database-routing.core :as database-routing]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.util :as driver.u]
   [metabase.sync.core :as sync]
   [metabase.sync.field-values :as sync.field-values]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- query-h2
  "Rows of `sql` run straight against the H2 file of `db`."
  [db sql]
  (sql-jdbc.execute/do-with-connection-with-options
   :h2 (mdb/spec :h2 (:details db)) {}
   (fn [^java.sql.Connection conn]
     (jdbc/query {:connection conn} [sql]))))

(defn- owner-of-row-1
  "The `owner` of row 1 of `acct` in the H2 file of `db`."
  [db]
  (:owner (first (query-h2 db "SELECT \"owner\" FROM \"acct\" WHERE \"id\" = 1"))))

(defn- set-owner-of-row-1!
  "Sets the `owner` of row 1 of `acct` through the connection that implicit actions open on `router-id`."
  [router-id owner]
  (sql-jdbc.actions/do-with-jdbc-transaction
   router-id
   (fn [^java.sql.Connection conn]
     (jdbc/execute! {:connection conn} ["UPDATE \"acct\" SET \"owner\" = ? WHERE \"id\" = 1" owner] {:transaction? false}))))

(deftest implicit-actions-write-to-destination-test
  (mt/with-premium-features #{:database-routing}
    (binding [driver.settings/*allow-testing-h2-connections* true]
      (met/with-user-attributes! :rasta {"db_name" "destination-db-1"}
        (e2e/with-routing-setup! [router-db [[dest-1 "destination-db-1"]]]
          (doseq [db [router-db dest-1]]
            (e2e/execute-statement! db "CREATE TABLE \"acct\" (\"id\" INT PRIMARY KEY, \"owner\" TEXT NOT NULL)")
            (e2e/execute-statement! db "GRANT ALL ON \"acct\" TO GUEST"))
          (e2e/execute-statement! router-db "INSERT INTO \"acct\" VALUES (1, 'tenant-b')")
          (e2e/execute-statement! dest-1 "INSERT INTO \"acct\" VALUES (1, 'tenant-a')")
          (let [router-id (u/the-id router-db)]
            (mt/with-temp [:model/DatabaseRouter _ {:database_id router-id :user_attribute "db_name"}]
              (mt/with-current-user (mt/user->id :rasta)
                (set-owner-of-row-1! router-id "by-rasta"))
              (testing "a routed user's implicit action writes with the destination's credentials"
                (is (= {:router "tenant-b" :destination "by-rasta"}
                       {:router (owner-of-row-1 router-db) :destination (owner-of-row-1 dest-1)})))
              (mt/with-current-user (mt/user->id :crowberto)
                (set-owner-of-row-1! router-id "by-crowberto"))
              (testing "an admin without the attribute writes with the router's credentials"
                (is (= {:router "by-crowberto" :destination "by-rasta"}
                       {:router (owner-of-row-1 router-db) :destination (owner-of-row-1 dest-1)}))))))))))

(defn- owner-via-connection
  "The `owner` of row 1 of `acct`, read through a connection for the Database with `database-id`."
  [database-id]
  (sql-jdbc.execute/do-with-connection-with-options
   :h2 database-id {}
   (fn [^java.sql.Connection conn]
     (:owner (first (jdbc/query {:connection conn} ["SELECT \"owner\" FROM \"acct\" WHERE \"id\" = 1"]))))))

(deftest connections-go-to-users-destination-test
  (mt/with-premium-features #{:database-routing}
    (binding [driver.settings/*allow-testing-h2-connections* true]
      (met/with-user-attributes! :rasta {"db_name" "destination-db-1"}
        (e2e/with-routing-setup! [router-db [[dest-1 "destination-db-1"]]]
          (doseq [[db owner] [[router-db "router"] [dest-1 "destination"]]]
            (e2e/execute-statement! db "CREATE TABLE \"acct\" (\"id\" INT PRIMARY KEY, \"owner\" TEXT NOT NULL)")
            (e2e/execute-statement! db "GRANT ALL ON \"acct\" TO GUEST")
            (e2e/execute-statement! db (format "INSERT INTO \"acct\" VALUES (1, '%s')" owner)))
          (let [router-id (u/the-id router-db)]
            (mt/with-temp [:model/DatabaseRouter _ {:database_id router-id :user_attribute "db_name"}]
              (testing "a routed user's connection to the router goes to their destination"
                (mt/with-current-user (mt/user->id :rasta)
                  (is (= "destination" (owner-via-connection router-id)))
                  (is (= (u/the-id dest-1)
                         (::driver.conn/database-id (driver.conn/effective-details (driver.u/lib-database router-id)))))))
              (testing "an admin without the attribute connects to the router"
                (mt/with-current-user (mt/user->id :crowberto)
                  (is (= "router" (owner-via-connection router-id)))))
              (testing "with no user bound, the connection is refused"
                (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Anonymous users cannot access a database with routing enabled"
                                      (owner-via-connection router-id))))
              (testing "with no user bound, allowed anonymous access goes to the router"
                (database-routing/with-anonymous-router-access
                  (is (= "router" (owner-via-connection router-id)))))
              (testing "with only the user id cleared, the query and its connection agree that no user is bound"
                (mt/with-current-user (mt/user->id :rasta)
                  (binding [api/*current-user-id* nil]
                    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Anonymous users cannot access a database with routing enabled"
                                          (database-routing.common/router-db->destination-db-id (driver.u/lib-database router-id))))
                    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Anonymous users cannot access a database with routing enabled"
                                          (owner-via-connection router-id)))
                    (database-routing/with-anonymous-router-access
                      (is (nil? (database-routing.common/router-db->destination-db-id (driver.u/lib-database router-id))))
                      (is (= "router" (owner-via-connection router-id)))))))
              (testing "allowed anonymous access goes to the router even inside a routed user's request"
                (mt/with-current-user (mt/user->id :rasta)
                  (database-routing/with-anonymous-router-access
                    (is (= "router" (owner-via-connection router-id))))))
              (testing "a routed user can't connect to a lapsed router"
                (mt/with-premium-features #{}
                  (mt/with-current-user (mt/user->id :rasta)
                    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Database Routing"
                                          (owner-via-connection router-id))))
                  (testing "and destinations stay reachable only through their router"
                    (mt/with-current-user (mt/user->id :crowberto)
                      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"(?i)cannot query a destination database directly"
                                            (owner-via-connection (u/the-id dest-1))))))
                  (is (database-routing/db-routing-enabled? (driver.u/lib-database router-id))))))))))))

(deftest routed-users-sync-router-itself-test
  (testing "a routed user's sync, analysis and field value scans read the router itself, so its shared metadata stays the router's"
    (mt/with-premium-features #{:database-routing}
      (binding [driver.settings/*allow-testing-h2-connections* true]
        (met/with-user-attributes! :rasta {"db_name" "destination-db-1"}
          (e2e/with-routing-setup! [router-db [[dest-1 "destination-db-1"]]]
            (e2e/execute-statement! router-db "CREATE TABLE \"acct\" (\"id\" INT PRIMARY KEY, \"owner\" TEXT)")
            (e2e/execute-statement! router-db "INSERT INTO \"acct\" VALUES (1, 'router-owner')")
            (e2e/execute-statement! dest-1 "CREATE TABLE \"acct\" (\"id\" INT PRIMARY KEY, \"owner\" TEXT, \"tenant_secret\" TEXT)")
            (e2e/execute-statement! dest-1 "INSERT INTO \"acct\" VALUES (1, 'tenant-owner', 'secret')")
            (sync/sync-database! (:id router-db) {:scan :schema})
            (let [router-id (u/the-id router-db)
                  table     (t2/select-one :model/Table :db_id router-id :name "acct")
                  owner     (t2/select-one :model/Field :table_id (:id table) :name "owner")]
              (field-values/create-or-update-full-field-values! owner)
              (mt/with-temp [:model/DatabaseRouter _ {:database_id router-id :user_attribute "db_name"}]
                (mt/with-current-user (mt/user->id :rasta)
                  (doseq [[step f] {"table sync"      #(sync/sync-table! table)
                                    "metadata sync"   #(sync/sync-db-metadata! router-id)
                                    "analysis"        #(sync/analyze-db! router-id)
                                    "refingerprint"   #(sync/refingerprint-field! owner)
                                    "table values"    #(sync/update-field-values-for-table! table)
                                    "field values"    #(field-values/create-or-update-full-field-values! owner)}]
                    (testing step
                      (f)))))
              (is (= #{"id" "owner"}
                     (t2/select-fn-set :name :model/Field :table_id (:id table) :active true)))
              (is (= ["router-owner"] (:values (field-values/get-latest-full-field-values (:id owner))))))))))))

(deftest routed-users-keep-shared-values-test
  (testing "a routed user's on-demand values refresh reads the router itself"
    (mt/with-premium-features #{:database-routing}
      (binding [driver.settings/*allow-testing-h2-connections* true]
        (met/with-user-attributes! :rasta {"db_name" "destination-db-1"}
          (e2e/with-routing-setup! [router-db [[dest-1 "destination-db-1"]]]
            (doseq [[db owner] [[router-db "router-owner"] [dest-1 "tenant-owner"]]]
              (e2e/execute-statement! db "CREATE TABLE \"acct\" (\"id\" INT PRIMARY KEY, \"owner\" TEXT)")
              (e2e/execute-statement! db "GRANT ALL ON \"acct\" TO GUEST")
              (e2e/execute-statement! db (format "INSERT INTO \"acct\" VALUES (1, '%s')" owner)))
            (sync/sync-database! (:id router-db) {:scan :schema})
            (let [router-id (u/the-id router-db)
                  table     (t2/select-one :model/Table :db_id router-id :name "acct")
                  owner     (t2/select-one :model/Field :table_id (:id table) :name "owner")]
              (t2/update! :model/Field (:id owner) {:has_field_values "list"})
              (field-values/create-or-update-full-field-values! (t2/select-one :model/Field (:id owner)))
              (t2/update! :model/Database router-id {:is_on_demand true})
              (mt/with-temp [:model/DatabaseRouter _ {:database_id router-id :user_attribute "db_name"}]
                (mt/with-current-user (mt/user->id :rasta)
                  (sync.field-values/update-field-values-for-on-demand-dbs! [(:id owner)]))
                (is (= ["router-owner"] (:values (field-values/get-latest-full-field-values (:id owner)))))))))))))
