(ns metabase-enterprise.database-routing.writes-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-routing.e2e-test :as e2e]
   [metabase-enterprise.test :as met]
   [metabase-enterprise.transform-testing.runner :as transform-testing.runner]
   [metabase.app-db.core :as mdb]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.transforms.core :as transforms.core]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.upload.impl :as upload.impl]
   [metabase.util :as u]
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

(deftest implicit-actions-write-to-the-destination-test
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

(deftest routed-users-cannot-run-transforms-or-upload-test
  (mt/with-premium-features #{:database-routing}
    (binding [driver.settings/*allow-testing-h2-connections* true]
      (e2e/with-routing-setup! [router-db [[_dest-1 "destination-db-1"]]]
        (e2e/execute-statement! router-db "CREATE TABLE \"acct\" (\"id\" INT PRIMARY KEY, \"owner\" TEXT NOT NULL)")
        (sync/sync-database! router-db)
        (let [router-id (u/the-id router-db)
              table-id  (t2/select-one-pk :model/Table :db_id router-id :name "acct")
              mp        (lib-be/application-database-metadata-provider router-id)]
          (mt/with-temp [:model/DatabaseRouter _ {:database_id router-id :user_attribute "db_name"}
                         :model/Transform transform {:name   "router transform"
                                                     :source {:type :query :query (lib/native-query mp "SELECT 1")}
                                                     :target {:type "table" :schema "PUBLIC" :name "router_transform" :database router-id}}]
            (met/with-user-attributes! :crowberto {"db_name" "destination-db-1"}
              (mt/with-current-user (mt/user->id :crowberto)
                (testing "a routed user can't run a transform on the router"
                  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"routes your queries"
                                        (transforms.execute/execute! transform))))
                (testing "a routed user can't upload to, append to, replace or delete uploads on the router"
                  (let [db (t2/select-one :model/Database router-id)]
                    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"routes your queries"
                                          (#'upload.impl/check-can-create-upload db "PUBLIC")))
                    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"routes your queries"
                                          (#'upload.impl/check-can-update db {:id table-id :is_upload true})))
                    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"routes your queries"
                                          (#'upload.impl/check-can-delete {:id table-id :is_upload true} db)))))))
            (mt/with-current-user (mt/user->id :crowberto)
              (testing "an admin without the attribute isn't refused as routed"
                (is (not (re-find #"routes your queries"
                                  (or (try (#'upload.impl/check-can-create-upload (t2/select-one :model/Database router-id) "PUBLIC")
                                           (catch clojure.lang.ExceptionInfo e (ex-message e)))
                                      ""))))))))))))

(deftest routed-users-cannot-test-or-touch-transform-targets-test
  (mt/with-premium-features #{:database-routing :transforms-basic :hosting}
    (binding [driver.settings/*allow-testing-h2-connections* true]
      (e2e/with-routing-setup! [router-db [[_dest-1 "destination-db-1"]]]
        (let [router-id (u/the-id router-db)
              mp        (lib-be/application-database-metadata-provider router-id)
              transform {:name   "tenant transform"
                         :source {:type :query :query (lib/native-query mp "SELECT 1")}
                         :target {:type "table" :schema "PUBLIC" :name "tenant_transform" :database router-id}}]
          (mt/with-temp [:model/DatabaseRouter _ {:database_id router-id :user_attribute "db_name"}
                         :model/Transform saved transform]
            (met/with-user-attributes! :crowberto {"db_name" "destination-db-1"}
              (mt/with-current-user (mt/user->id :crowberto)
                (testing "a routed admin can still create and edit transforms on the router"
                  (is (mi/can-create? :model/Transform transform))
                  (is (mi/can-write? saved)))
                (testing "a routed admin can't touch a transform's target table on the router"
                  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"routes your queries"
                                        (transforms.core/check-target-not-routed saved)))
                  (is (= "You can't do this on a database that routes your queries to a destination database."
                         (mt/user-http-request :crowberto :delete 403 (format "transform/%d/table" (:id saved))))))
                (testing "a routed admin can't test a transform on the router"
                  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"routes your queries"
                                        (transform-testing.runner/validate-transform-test (:id saved) [] []))))))))))))
