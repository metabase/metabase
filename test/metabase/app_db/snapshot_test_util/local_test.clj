(ns metabase.app-db.snapshot-test-util.local-test
  (:require
   [babashka.fs :as fs]
   [clojure.java.jdbc :as jdbc]
   [clojure.java.shell :as shell]
   [clojure.test :refer :all]
   [metabase.app-db.schema-migrations-test.impl :as impl]
   [metabase.app-db.snapshot-test-util :as snapshot]
   [metabase.app-db.snapshot-test-util.generate :as generate]
   [metabase.app-db.snapshot-test-util.local :as snapshot.local]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.util.encryption-test :as encryption-test]))

(set! *warn-on-reflection* true)

(deftest missing-client-test
  (mt/with-dynamic-fn-redefs [fs/which (constantly nil)]
    (is (map? (snapshot.local/dump-options :h2 nil)))
    (doseq [flavor [:mysql :mariadb :mariadb-legacy-timestamp :postgres]]
      (is (nil? (snapshot.local/dump-options flavor {:host "localhost"}))))))

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
                                              flavor (assoc details :host "127.0.0.1" :port (if (= flavor :mysql) 3306 5432))) conn))))]
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
