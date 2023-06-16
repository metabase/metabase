(ns metabase.driver.sql-jdbc.connection-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.config :as config]
   [metabase.core :as mbc]
   [metabase.db.spec :as mdb.spec]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.test-util :as sql-jdbc.tu]
   [metabase.driver.util :as driver.u]
   [metabase.models :refer [Database Secret]]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest can-connect-with-details?-test
  (is (= true
         (driver.u/can-connect-with-details? :h2 (:details (data/db)))))
  (testing "Lie and say Test DB is Postgres. `can-connect?` should fail"
    (is (= false
           (driver.u/can-connect-with-details? :postgres (:details (data/db))))))
  (testing "Random made-up DBs should fail"
    (is (= false
           (driver.u/can-connect-with-details? :postgres {:host   "localhost"
                                                          :port   5432
                                                          :dbname "ABCDEFGHIJKLMNOP"
                                                          :user   "rasta"}))))
  (testing "Things that you can connect to, but are not DBs, should fail"
    (is (= false
           (driver.u/can-connect-with-details? :postgres {:host "google.com", :port 80})))))

(deftest db->pooled-connection-spec-test
  (mt/test-driver :h2
    (testing "creating and removing specs works"
      ;; need to create a new, nonexistent h2 db
      (let [destroyed?         (atom false)
            original-destroy   @#'sql-jdbc.conn/destroy-pool!
            connection-details {:db "mem:connection_test"}
            spec               (mdb.spec/spec :h2 connection-details)]
        (with-redefs [sql-jdbc.conn/destroy-pool! (fn [id destroyed-spec]
                                                    (original-destroy id destroyed-spec)
                                                    (reset! destroyed? true))]
          (jdbc/with-db-connection [_conn spec]
            (jdbc/execute! spec ["CREATE TABLE birds (name varchar)"])
            (jdbc/execute! spec ["INSERT INTO birds values ('rasta'),('lucky')"])
            (t2.with-temp/with-temp [Database database {:engine :h2, :details connection-details}]
              (testing "database id is not in our connection map initially"
                ;; deref'ing a var to get the atom. looks weird
                (is (not (contains? @@#'sql-jdbc.conn/database-id->connection-pool
                                    (u/id database)))))
              (testing "when getting a pooled connection it is now in our connection map"
                (let [stored-spec (sql-jdbc.conn/db->pooled-connection-spec database)
                      birds       (jdbc/query stored-spec ["SELECT * FROM birds"])]
                  (is (seq birds))
                  (is (contains? @@#'sql-jdbc.conn/database-id->connection-pool
                                 (u/id database)))))
              (testing "and is no longer in our connection map after cleanup"
                (#'sql-jdbc.conn/set-pool! (u/id database) nil nil)
                (is (not (contains? @@#'sql-jdbc.conn/database-id->connection-pool
                                    (u/id database)))))
              (testing "the pool has been destroyed"
                (is @destroyed?)))))))))

(deftest c3p0-datasource-name-test
  (mt/test-drivers (sql-jdbc.tu/sql-jdbc-drivers)
    (testing "The dataSourceName c3p0 property is set properly for a database"
      (let [db         (mt/db)
            props      (sql-jdbc.conn/data-warehouse-connection-pool-properties driver/*driver* db)
            [_ db-nm]  (re-matches (re-pattern (format "^db-%d-%s-(.*)$" (u/the-id db) (name driver/*driver*)))
                                   (get props "dataSourceName"))]
        (is (some? db-nm))
        ;; ensure that, for any sql-jdbc driver anyway, we found *some* DB name to use in this String
        (is (not= db-nm "null"))))))

(deftest same-connection-details-result-in-equal-specs-test
  (testing "Two JDBC specs created with the same details must be considered equal for the connection pool cache to work correctly"
    ;; this is only really a concern for drivers like Spark SQL that create custom DataSources instead of plain details
    ;; maps -- those DataSources need to be considered equal based on the connection string/properties
    (mt/test-drivers (sql-jdbc.tu/sql-jdbc-drivers)
      (let [details (:details (mt/db))
            spec-1  (sql-jdbc.conn/connection-details->spec driver/*driver* details)
            spec-2  (sql-jdbc.conn/connection-details->spec driver/*driver* details)]
        (is (= spec-1 spec-2))))))

(defn- perturb-db-details [db]
  (update db
          :details
          (fn [details]
            (case driver/*driver*
              :redshift
              (assoc details :additional-options "defaultRowFetchSize=1000")

              (cond-> details
                ;; swap localhost and 127.0.0.1
                (= "localhost" (:host details))
                (assoc :host "127.0.0.1")

                (= "127.0.0.1" (:host details))
                (assoc :host "localhost")

                :else
                (assoc :new-config "something"))))))

(deftest connection-pool-invalidated-on-details-change
  (mt/test-drivers (sql-jdbc.tu/sql-jdbc-drivers)
    (testing "db->pooled-connection-spec marks a connection pool invalid if the db details map changes\n"
      (let [db                       (mt/db)
            hash-change-called-times (atom 0)
            hash-change-fn           (fn [db-id]
                                       (is (= (u/the-id db) db-id))
                                       (swap! hash-change-called-times inc)
                                       nil)]
        (try
          (sql-jdbc.conn/invalidate-pool-for-db! db)
          ;; a little bit hacky to redefine the log fn, but it's the most direct way to test
          (with-redefs [sql-jdbc.conn/log-jdbc-spec-hash-change-msg! hash-change-fn]
            (let [pool-spec-1 (sql-jdbc.conn/db->pooled-connection-spec db)
                  db-hash-1   (get @@#'sql-jdbc.conn/database-id->jdbc-spec-hash (u/the-id db))]
              (testing "hash value calculated correctly for new pooled conn"
                (is (some? pool-spec-1))
                (is (integer? db-hash-1))
                (is (not= db-hash-1 0)))
              (testing "changing DB details results in hash value changing and connection being invalidated"
                (let [db-perturbed (perturb-db-details db)]
                  (testing "The calculated hash should be different"
                    (is (not= (#'sql-jdbc.conn/jdbc-spec-hash db)
                              (#'sql-jdbc.conn/jdbc-spec-hash db-perturbed))))
                  (t2/update! Database (mt/id) {:details (:details db-perturbed)})
                  (let [ ;; this call should result in the connection pool becoming invalidated, and the new hash value
                        ;; being stored based upon these updated details
                        pool-spec-2  (sql-jdbc.conn/db->pooled-connection-spec db-perturbed)
                        db-hash-2    (get @@#'sql-jdbc.conn/database-id->jdbc-spec-hash (u/the-id db))]
                    ;; to throw a wrench into things, kick off a sync of the original db (unperturbed); this
                    ;; simulates a long running sync that began before the perturbed details were saved to the app DB
                    ;; the sync steps SHOULD NOT invalidate the connection pool, because doing so could cause a seesaw
                    ;; effect that continuously invalidates the connection pool on every sync step and query, which
                    ;; wreaks havoc (#18499)
                    ;; instead, the connection pool code will simply fetch the newest DatabaseInstance it
                    ;; can find in the app DB, in the case of a hash mismatch, and check AGAIN to see whether the hash
                    ;; still doesn't match (in this test case, it should actually match this time, because we updated
                    ;; the app DB with the perturbed DatabaseInstance above here)
                    ;; this should still see a hash mismatch in the case that the DB details were updated external to
                    ;; this process (i.e. by a different instance), since our in-memory hash value still wouldn't match
                    ;; even after getting the latest `DatabaseInstance`
                    (sync/sync-database! db {:scan :schema})
                    (is (some? pool-spec-2))
                    (is (= 1 @hash-change-called-times) "One hash change should have been logged")
                    (is (integer? db-hash-2))
                    (is (not= db-hash-2 0))
                    (is (not= db-hash-1 db-hash-2)))))))
          (finally
            ;; restore the original test DB details, no matter what just happened
            (t2/update! Database (mt/id) {:details (:details db)}))))))
  (testing "postgres secrets are stable (#23034)"
    (mt/with-temp* [Secret [secret {:name       "file based secret"
                                    :kind       :perm-cert
                                    :source     nil
                                    :value      (.getBytes "super secret")
                                    :creator_id (mt/user->id :crowberto)}]]
      (let [db {:engine  :postgres
                :details {:ssl                      true
                          :ssl-mode                 "verify-ca"
                          :ssl-root-cert-options    "uploaded"
                          :ssl-root-cert-creator-id (mt/user->id :crowberto)
                          :ssl-root-cert-source     nil
                          :ssl-root-cert-id         (:id secret)
                          :ssl-root-cert-created-at "2022-07-25T15:57:51.556-05:00"}}]
        (is (instance? java.io.File
                       (:sslrootcert (#'sql-jdbc.conn/connection-details->spec :postgres
                                                                               (:details db))))
            "Secrets not loaded for db connections")
        (is (= (#'sql-jdbc.conn/jdbc-spec-hash db)
               (#'sql-jdbc.conn/jdbc-spec-hash db))
            "Same db produced different hashes due to secrets")))))

(deftest connection-pool-does-not-cache-audit-db
  (mt/test-drivers #{:h2 :mysql :postgres}
    (when config/ee-available?
      (t2/delete! 'Database {:where [:= :is_audit true]})
      (let [status (mbc/ensure-audit-db-installed!)
            audit-db-id (t2/select-one-fn :id 'Database {:where [:= :is_audit true]})
            _ (is (= :metabase-enterprise.audit-db/installed status))
            _ (is (= 13371337 audit-db-id))
            first-pool (sql-jdbc.conn/db->pooled-connection-spec audit-db-id)
            second-pool (sql-jdbc.conn/db->pooled-connection-spec audit-db-id)]
        (is (= first-pool second-pool))
        (is (= ::audit-db-not-in-cache!
               (get @#'sql-jdbc.conn/database-id->connection-pool audit-db-id ::audit-db-not-in-cache!)))))))
