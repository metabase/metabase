(ns metabase.app-db.snapshot-test-util.local-test
  (:require
   [babashka.fs :as fs]
   [clojure.java.jdbc :as jdbc]
   [clojure.java.shell :as shell]
   [clojure.test :refer :all]
   [metabase.app-db.schema-migrations-test.impl :as impl]
   [metabase.app-db.snapshot-test-util :as snapshot]
   [metabase.app-db.snapshot-test-util.cache :as cache]
   [metabase.app-db.snapshot-test-util.generate :as generate]
   [metabase.app-db.snapshot-test-util.local :as snapshot.local]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.util.encryption-test :as encryption-test]))

(set! *warn-on-reflection* true)

(deftest missing-client-test
  (mt/with-dynamic-fn-redefs [fs/which (constantly nil)]
    (is (map? (snapshot.local/dump-options :h2 nil nil)))
    (doseq [flavor [:mysql :mariadb :mariadb-legacy-timestamp :postgres]]
      (is (nil? (snapshot.local/dump-options flavor {:host "localhost"} nil))))))

(defn- postgres-connection [major]
  (reify java.sql.Connection
    (getMetaData [_]
      (reify java.sql.DatabaseMetaData
        (getDatabaseMajorVersion [_] major)))))

(deftest postgres-client-version-test
  (doseq [[output server-major expected?]
          [["pg_dump (PostgreSQL) 18.7 (Ubuntu 18.7-1.pgdg26.04+2)\n" 19 false]
           ["pg_dump (PostgreSQL) 19.0 (Debian 19.0-2.pgdg13+1)\n" 19 true]
           ["pg_dump (PostgreSQL) 19.1\n" 18 true]
           ["pg_dump (PostgreSQL) 19beta1\n" 19 true]
           ["unrecognized version\n" 19 false]]]
    (testing (str output "server major " server-major)
      (mt/with-dynamic-fn-redefs [fs/which (constantly "/bin/pg_dump")
                                  shell/sh (fn [& args]
                                             (is (= ["/bin/pg_dump" "--version"] args))
                                             {:exit 0 :out output})]
        (is (= expected? (some? (snapshot.local/dump-options :postgres {:host "localhost"}
                                                             (postgres-connection server-major)))))))))

(deftest unavailable-postgres-version-test
  (doseq [probe [(constantly {:exit 1 :out "" :err "cannot run"})
                 (fn [& _] (throw (java.io.IOException. "client removed")))]]
    (mt/with-dynamic-fn-redefs [fs/which (constantly "/bin/pg_dump")
                                shell/sh probe]
      (is (nil? (snapshot.local/dump-options :postgres {:host "localhost"} (postgres-connection 19)))))))

(deftest other-clients-do-not-probe-version-test
  (mt/with-dynamic-fn-redefs [fs/which identity
                              shell/sh (fn [& _] (throw (ex-info "Unexpected version probe" {})))]
    (doseq [flavor [:h2 :mysql :mariadb :mariadb-legacy-timestamp]]
      (is (some? (snapshot.local/dump-options flavor {:host "localhost"} nil))))))

(deftest client-arguments-test
  (doseq [flavor [:mysql :postgres]]
    (let [called (atom nil)]
      (mt/with-dynamic-fn-redefs [shell/sh (fn [& args]
                                             (reset! called args)
                                             {:exit 0 :out "dumped"})]
        (is (= "dumped" (#'snapshot.local/run-client! flavor {:password "bird-secret"}
                                                      "/bin/dump" "--host=bird-host"))))
      (let [[command host _ env] @called]
        (is (= ["/bin/dump" "--host=bird-host"] [command host]))
        (is (= "bird-secret" (get env (if (= flavor :postgres) "PGPASSWORD" "MYSQL_PWD"))))))))

(deftest client-failure-test
  (mt/with-dynamic-fn-redefs [shell/sh (constantly {:exit 1 :err "dump failed"})]
    (is (thrown-with-msg? Exception #"Snapshot dump client failed"
                          (#'snapshot.local/run-client! :postgres {} "pg_dump")))))

(deftest server-dump-round-trip-test
  (when (= "true" (config/config-str :mb-app-db-snapshot-regeneration-test))
    (encryption-test/with-secret-key nil
      (mt/test-drivers #{:mysql :postgres}
        (let [flavor driver/*driver*
              sql (generate/do-with-empty-db!
                   flavor
                   (fn [^java.sql.Connection conn {:keys [exec! details]}]
                     (#'impl/migrate-to-start-uncached! conn flavor "v45.00-002")
                     (.commit conn)
                     (mt/with-dynamic-fn-redefs [fs/which identity
                                                 shell/sh (fn [& args]
                                                            {:exit 0 :out (apply exec! (take-while string? args))})]
                       (snapshot.local/dump! (snapshot.local/dump-options
                                              flavor (assoc details :host "127.0.0.1" :port (if (= flavor :mysql) 3306 5432)) conn) conn))))]
          (generate/do-with-empty-db!
           flavor
           (fn [conn _server]
             (snapshot/load-sql! conn flavor sql)
             (is (= [{:id "v45.00-001"}]
                    (jdbc/query {:connection conn} ["SELECT id FROM DATABASECHANGELOG WHERE id = 'v45.00-001'"])))
             (is (seq (jdbc/query {:connection conn} ["SELECT * FROM DATABASECHANGELOG_VERSION"])))
             (is (empty? (jdbc/query {:connection conn} ["SELECT id FROM DATABASECHANGELOG WHERE id = 'v45.00-002'"])))
             (impl/run-migrations-in-range! conn ["v45.00-002" "v45.00-002"])
             (is (= [{:id "v45.00-002"}]
                    (jdbc/query {:connection conn} ["SELECT id FROM DATABASECHANGELOG WHERE id = 'v45.00-002'"]))))))))))

(deftest older-postgres-client-setup-test
  (when (= "true" (config/config-str :mb-app-db-snapshot-regeneration-test))
    (encryption-test/with-secret-key nil
      (generate/do-with-empty-db!
       :postgres
       (fn [^java.sql.Connection conn {:keys [details]}]
         (with-bindings {#'impl/*snapshot-connection-details* details}
           (mt/with-dynamic-fn-redefs [fs/which (constantly "pg_dump")
                                       shell/sh (fn [& args]
                                                  (is (= ["pg_dump" "--version"] args))
                                                  {:exit 0
                                                   :out (str "pg_dump (PostgreSQL) "
                                                             (dec (.getDatabaseMajorVersion (.getMetaData conn))) ".7")})
                                       cache/ensure-snapshot! (fn [& _] (throw (ex-info "Unexpected cache use" {})))]
             (#'impl/migrate-to-start! conn :postgres "v45.00-002")
             (is (= [{:id "v45.00-001"}]
                    (jdbc/query {:connection conn} ["SELECT id FROM DATABASECHANGELOG WHERE id = 'v45.00-001'"])))
             (is (empty? (jdbc/query {:connection conn} ["SELECT id FROM DATABASECHANGELOG WHERE id = 'v45.00-002'"])))
             (impl/run-migrations-in-range! conn ["v45.00-002" "v45.00-002"])
             (is (= [{:id "v45.00-002"}]
                    (jdbc/query {:connection conn} ["SELECT id FROM DATABASECHANGELOG WHERE id = 'v45.00-002'"]))))))))))
