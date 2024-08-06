(ns metabase.driver.sql-jdbc.connection-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.auth-provider :as auth-provider]
   [metabase.config :as config]
   [metabase.core :as mbc]
   [metabase.db :as mdb]
   [metabase.driver :as driver]
   [metabase.driver.h2 :as h2]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.test-util :as sql-jdbc.tu]
   [metabase.driver.util :as driver.u]
   [metabase.models :refer [Database Secret]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.test.data.interface :as tx]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [metabase.util.ssh :as ssh]
   [metabase.util.ssh-test :as ssh-test]
   [next.jdbc :as next.jdbc]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (org.h2.tools Server)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :once ssh-test/do-with-mock-servers)

(deftest can-connect-with-details?-test
  (testing "Should not be able to connect without setting h2/*allow-testing-h2-connections*"
    (is (not (driver.u/can-connect-with-details? :h2 (:details (data/db))))))
  (binding [h2/*allow-testing-h2-connections* true]
    (is (driver.u/can-connect-with-details? :h2 (:details (data/db))))
    (testing "Lie and say Test DB is Postgres. `can-connect?` should fail"
      (is (not (driver.u/can-connect-with-details? :postgres (:details (data/db))))))
    (testing "Random made-up DBs should fail"
      (is (not (driver.u/can-connect-with-details? :postgres {:host   "localhost"
                                                              :port   5432
                                                              :dbname "ABCDEFGHIJKLMNOP"
                                                              :user   "rasta"}))))
    (testing "Things that you can connect to, but are not DBs, should fail"
      (is (not (driver.u/can-connect-with-details? :postgres {:host "google.com", :port 80}))))))

(deftest db->pooled-connection-spec-test
  (mt/test-driver :h2
    (testing "creating and removing specs works"
      ;; need to create a new, nonexistent h2 db
      (let [destroyed?         (atom false)
            original-destroy   @#'sql-jdbc.conn/destroy-pool!
            connection-details {:db "mem:connection_test"}
            spec               (mdb/spec :h2 connection-details)]
        (with-redefs [sql-jdbc.conn/destroy-pool! (fn [id destroyed-spec]
                                                    (original-destroy id destroyed-spec)
                                                    (reset! destroyed? true))]
          (sql-jdbc.execute/do-with-connection-with-options
           :h2
           spec
           {:write? true}
           (fn [conn]
             (next.jdbc/execute! conn ["CREATE TABLE birds (name varchar)"])
             (next.jdbc/execute! conn ["INSERT INTO birds values ('rasta'),('lucky')"])
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
                 (driver/notify-database-updated :h2 database)
                 (is (not (contains? @@#'sql-jdbc.conn/database-id->connection-pool
                                     (u/id database)))))
               (testing "the pool has been destroyed"
                 (is @destroyed?))))))))))

(deftest ^:parallel c3p0-datasource-name-test
  (mt/test-drivers (sql-jdbc.tu/sql-jdbc-drivers)
    (testing "The dataSourceName c3p0 property is set properly for a database"
      (let [db         (mt/db)
            props      (sql-jdbc.conn/data-warehouse-connection-pool-properties driver/*driver* db)
            [_ db-nm]  (re-matches (re-pattern (format "^db-%d-%s-(.*)$" (u/the-id db) (name driver/*driver*)))
                                   (get props "dataSourceName"))]
        (is (some? db-nm))
        ;; ensure that, for any sql-jdbc driver anyway, we found *some* DB name to use in this String
        (is (not= db-nm "null"))))))

(deftest ^:parallel same-connection-details-result-in-equal-specs-test
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
                (and (string? (:host details))
                     (str/includes? (:host details) "localhost"))
                (update :host str/replace "localhost" "127.0.0.1")

                (and (string? (:host details))
                     (str/includes? (:host details) "127.0.0.1"))
                (update :host str/replace "127.0.0.1" "localhost")

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
    (mt/with-temp [Secret secret {:name       "file based secret"
                                  :kind       :perm-cert
                                  :source     nil
                                  :value      (.getBytes "super secret")
                                  :creator_id (mt/user->id :crowberto)}]
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
            _ (is (= :metabase-enterprise.audit-app.audit/installed status))
            _ (is (= 13371337 audit-db-id))
            first-pool (sql-jdbc.conn/db->pooled-connection-spec audit-db-id)
            second-pool (sql-jdbc.conn/db->pooled-connection-spec audit-db-id)]
        (is (= first-pool second-pool))
        (is (= ::audit-db-not-in-cache!
               (get @#'sql-jdbc.conn/database-id->connection-pool audit-db-id ::audit-db-not-in-cache!)))))))

(deftest ^:parallel include-unreturned-connection-timeout-test
  (testing "We should be setting unreturnedConnectionTimeout; it should be the same as the query timeout (#33646)"
    (is (=? {"unreturnedConnectionTimeout" integer?}
            (sql-jdbc.conn/data-warehouse-connection-pool-properties :h2 (mt/db))))))

(deftest unreturned-connection-timeout-test
  (testing "We should be able to set jdbc-data-warehouse-unreturned-connection-timeout-seconds via env var (#33646)"
    (mt/with-temp-env-var-value! [mb-jdbc-data-warehouse-unreturned-connection-timeout-seconds "20"]
      (is (= 20
             (sql-jdbc.conn/jdbc-data-warehouse-unreturned-connection-timeout-seconds))))))

(defn- init-h2-tcp-server [port]
  (let [args   ["-tcp" "-tcpPort", (str port), "-tcpAllowOthers" "-tcpDaemon"]
        server (Server/createTcpServer (into-array args))]
    (doto server (.start))))

(deftest test-auth-provider-connection
  (mt/test-drivers #{:postgres}
    (testing "Azure Managed Identity connections can be created and expired passwords get renewed"
      (let [db-details (:details (mt/db))
            oauth-db-details (-> db-details
                                 (dissoc :password)
                                 (assoc :use-auth-provider true
                                        :auth-provider :azure-managed-identity
                                        :azure-managed-identity-client-id "client ID"))
            ;; we return an expired token which forces a renewal when a second connection is requested
            ;; (the first time it is used without checking for expiry)
            expires-in (atom "0")
            connection-creations (atom 0)]
        (binding [auth-provider/*fetch-as-json* (fn [url _headers]
                                                  (is (str/includes? url "client ID"))
                                                  (swap! connection-creations inc)
                                                  {:access_token (:password db-details)
                                                   :expires_in @expires-in})]
          (t2.with-temp/with-temp [Database oauth-db {:engine (tx/driver), :details oauth-db-details}]
            (mt/with-db oauth-db
              (try
                ;; since Metabase is running and using the pool of this DB, the sync might fail
                ;; if the connection pool is shut down during the sync
                (sync/sync-database! (mt/db))
                (catch Exception _))
              ;; after "fixing" the expiry, we should get a connection from a pool that doesn't get shut down
              (reset! expires-in "10000")
              (sync/sync-database! (mt/db))
              (is (= [["Polo Lounge"]]
                     (mt/rows (mt/run-mbql-query venues {:filter [:= $id 60] :fields [$name]}))))
              ;; we must have created more than one connection
              (is (> @connection-creations 1)))))))))

(deftest test-ssh-tunnel-connection
  ;; TODO: Formerly this test ran against "all JDBC drivers except this big list":
  ;; (apply disj (sql-jdbc.tu/sql-jdbc-drivers)
  ;;        :sqlite :h2 :oracle :vertica :presto-jdbc :bigquery-cloud-sdk :redshift :athena
  ;;        (tqpt/timeseries-drivers))
  ;; which does not leave very many drivers!
  ;; That form is not extensible by 3P driver authors who need to exclude their driver as well. Since some drivers
  ;; (eg. Oracle) do seem to support SSH tunnelling but still fail on this test, it's not clear if this should be
  ;; controlled by a driver feature, a ^:dynamic override, or something else.
  ;; For now I'm making this test run against only `#{:postgres :mysql :snowflake}` like the below.
  (mt/test-drivers #{:postgres :mysql :snowflake}
    (testing "ssh tunnel is established"
      (let [tunnel-db-details (assoc (:details (mt/db))
                                     :tunnel-enabled true
                                     :tunnel-host "localhost"
                                     :tunnel-auth-option "password"
                                     :tunnel-port ssh-test/ssh-mock-server-with-password-port
                                     :tunnel-user ssh-test/ssh-username
                                     :tunnel-pass ssh-test/ssh-password)]
        (t2.with-temp/with-temp [Database tunneled-db {:engine (tx/driver), :details tunnel-db-details}]
          (mt/with-db tunneled-db
            (sync/sync-database! (mt/db))
            (is (= [["Polo Lounge"]]
                   (mt/rows (mt/run-mbql-query venues {:filter [:= $id 60] :fields [$name]}))))))))))

(deftest test-ssh-tunnel-reconnection
  ;; for now, run against Postgres and mysql, although in theory it could run against many different kinds
  (mt/test-drivers #{:postgres :mysql :snowflake}
    (testing "ssh tunnel is reestablished if it becomes closed, so subsequent queries still succeed"
      (let [tunnel-db-details (assoc (:details (mt/db))
                                     :tunnel-enabled true
                                     :tunnel-host "localhost"
                                     :tunnel-auth-option "password"
                                     :tunnel-port ssh-test/ssh-mock-server-with-password-port
                                     :tunnel-user ssh-test/ssh-username
                                     :tunnel-pass ssh-test/ssh-password)]
        (t2.with-temp/with-temp [Database tunneled-db {:engine (tx/driver), :details tunnel-db-details}]
          (mt/with-db tunneled-db
            (sync/sync-database! (mt/db))
            (letfn [(check-row []
                      (is (= [["Polo Lounge"]]
                             (mt/rows (mt/run-mbql-query venues {:filter [:= $id 60] :fields [$name]})))))]
              ;; check that some data can be queried
              (check-row)
              ;; kill the ssh tunnel; fortunately, we have an existing function that can do that
              (ssh/close-tunnel! (sql-jdbc.conn/db->pooled-connection-spec (mt/db)))
              ;; check the query again; the tunnel should have been reestablished
              (check-row))))))))

(deftest test-ssh-tunnel-connection-h2
  (testing (str "We need a customized version of this test for H2, because H2 requires bringing up its TCP server to tunnel into. "
                "It will bring up a new H2 TCP server, pointing to an existing DB file (stored in source control, called 'tiny-db', "
                "with a single table called 'my_tbl' and a GUEST user with password 'guest'); it will then use an SSH tunnel over "
                "localhost to connect to this H2 server's TCP port to execute native queries against that table.")
    (mt/with-driver :h2
      (testing "ssh tunnel is established"
        (let [h2-port (tu/find-free-port)
              server  (init-h2-tcp-server h2-port)
              ;; Use ACCESS_MODE_DATA=r to avoid updating the DB file
              uri     (format "tcp://localhost:%d/./test_resources/ssh/tiny-db;USER=GUEST;PASSWORD=guest;ACCESS_MODE_DATA=r" h2-port)
              h2-db   {:port               h2-port
                       :host               "localhost"
                       :db                 uri
                       :tunnel-enabled     true
                       :tunnel-host        "localhost"
                       :tunnel-auth-option "password"
                       :tunnel-port        ssh-test/ssh-mock-server-with-password-port
                       :tunnel-user        ssh-test/ssh-username
                       :tunnel-pass        ssh-test/ssh-password}]
          (try
            (t2.with-temp/with-temp [Database db {:engine :h2, :details h2-db}]
              (mt/with-db db
                (sync/sync-database! db)
                (is (= {:cols [{:base_type    :type/Text
                                :effective_type :type/Text
                                :display_name "COL1"
                                :field_ref    [:field "COL1" {:base-type :type/Text}]
                                :name         "COL1"
                                :source       :native}
                               {:base_type    :type/Decimal
                                :effective_type :type/Decimal
                                :display_name "COL2"
                                :field_ref    [:field "COL2" {:base-type :type/Decimal}]
                                :name         "COL2"
                                :source       :native}]
                        :rows [["First Row"  19.10M]
                               ["Second Row" 100.40M]
                               ["Third Row"  91884.10M]]}
                       (-> {:query "SELECT col1, col2 FROM my_tbl;"}
                           (mt/native-query)
                           (qp/process-query)
                           (qp.test-util/rows-and-cols))))))
            (finally (.stop ^Server server))))))))

(deftest test-ssh-tunnel-reconnection-h2
  (testing (str "We need a customized version of this test for H2, because H2 requires bringing up its TCP server to tunnel into. "
                "It will bring up a new H2 TCP server, pointing to an existing DB file (stored in source control, called 'tiny-db', "
                "with a single table called 'my_tbl' and a GUEST user with password 'guest'); it will then use an SSH tunnel over "
                "localhost to connect to this H2 server's TCP port to execute native queries against that table.")
    (mt/with-driver :h2
      (testing "ssh tunnel is reestablished if it becomes closed, so subsequent queries still succeed (H2 version)"
        (let [h2-port (tu/find-free-port)
              server  (init-h2-tcp-server h2-port)
              ;; Use ACCESS_MODE_DATA=r to avoid updating the DB file
              uri     (format "tcp://localhost:%d/./test_resources/ssh/tiny-db;USER=GUEST;PASSWORD=guest;ACCESS_MODE_DATA=r" h2-port)
              h2-db   {:port               h2-port
                       :host               "localhost"
                       :db                 uri
                       :tunnel-enabled     true
                       :tunnel-host        "localhost"
                       :tunnel-auth-option "password"
                       :tunnel-port        ssh-test/ssh-mock-server-with-password-port
                       :tunnel-user        ssh-test/ssh-username
                       :tunnel-pass        ssh-test/ssh-password}]
          (try
            (t2.with-temp/with-temp [Database db {:engine :h2, :details h2-db}]
              (mt/with-db db
                (sync/sync-database! db)
                (letfn [(check-data [] (is (= {:cols [{:base_type    :type/Text
                                                       :effective_type :type/Text
                                                       :display_name "COL1"
                                                       :field_ref    [:field "COL1" {:base-type :type/Text}]
                                                       :name         "COL1"
                                                       :source       :native}
                                                      {:base_type    :type/Decimal
                                                       :effective_type :type/Decimal
                                                       :display_name "COL2"
                                                       :field_ref    [:field "COL2" {:base-type :type/Decimal}]
                                                       :name         "COL2"
                                                       :source       :native}]
                                               :rows [["First Row"  19.10M]
                                                      ["Second Row" 100.40M]
                                                      ["Third Row"  91884.10M]]}
                                              (-> {:query "SELECT col1, col2 FROM my_tbl;"}
                                                  (mt/native-query)
                                                  (qp/process-query)
                                                  (qp.test-util/rows-and-cols)))))]
                  ;; check that some data can be queried
                  (check-data)
                  ;; kill the ssh tunnel; fortunately, we have an existing function that can do that
                  (ssh/close-tunnel! (sql-jdbc.conn/db->pooled-connection-spec db))
                  ;; check the query again; the tunnel should have been reestablished
                  (check-data))))
            (finally (.stop ^Server server))))))))
