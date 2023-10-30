(ns metabase.cmd.load-from-h2-test
  (:require
   [clojure.test :refer :all]
   [metabase.cmd.copy :as copy]
   [metabase.cmd.dump-to-h2 :as dump-to-h2]
   [metabase.cmd.load-from-h2 :as load-from-h2]
   [metabase.cmd.test-util :as cmd.test-util]
   [metabase.config :as config]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.liquibase :as liquibase]
   [metabase.db.setup :as mdb.setup]
   [metabase.db.test-util :as mdb.test-util]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.models :refer [Table]]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2]))

(defn- load-from-h2-test* [db-name thunk]
  ;; enable this test in the REPL with something like (mt/set-test-drivers! #{:postgres})
  (mt/test-drivers #{:postgres :mysql}
    ;; create a Postgres/MySQL database named `dump-test` (destroying it if it already exists first) and then copy
    ;; things from the [[metabase.cmd.test-util/fixture-db-file-path]] H2 database.
    (let [db-def             {:database-name db-name}
          h2-filename        @cmd.test-util/fixture-db-file-path
          target-db-type     driver/*driver*
          target-data-source (mdb.test-util/->ClojureJDBCSpecDataSource
                              (sql-jdbc.conn/connection-details->spec
                               target-db-type
                               (tx/dbdef->connection-details target-db-type :db db-def)))]
      (tx/create-db! target-db-type db-def)
      (binding [mdb.connection/*application-db* (mdb.connection/application-db target-db-type target-data-source)]
        (load-from-h2/load-from-h2! h2-filename)
        (is (= 4
               (t2/count Table)))
        (thunk)))))

(deftest ^:parallel load-from-h2-test
  (load-from-h2-test*
   "dump-test"
   (fn []
     (testing "H2 connection details should not have been copied"
       (is (= {}
              (t2/select-one-fn :details :model/Database :engine :h2)))))))

(deftest ^:parallel load-from-h2-copy-details-enabled-test
  (binding [copy/*copy-h2-database-details* true]
    (load-from-h2-test*
     "dump-test-2"
     (fn []
       (testing "H2 connection details SHOULD have been copied"
         (is (=? {:db string?}
                (t2/select-one-fn :details :model/Database :engine :h2))))))))

(defn- get-data-source [db-type db-def]
  (let [connection-details (tx/dbdef->connection-details db-type :db db-def)
        db-spec (sql-jdbc.conn/connection-details->spec db-type connection-details)]
    (mdb.test-util/->ClojureJDBCSpecDataSource db-spec)))

(defn- create-current-database
  [db-type db-def data-source]
  (tx/create-db! db-type db-def)
  (mdb.setup/setup-db! db-type data-source true))

(defn- dump-filename
  [h2-filename version]
  (str h2-filename "-" version))

(defn- create-dumps
  [db-name h2-filename versions]
  (let [db-type driver/*driver*
        db-def {:database-name db-name}
        current-version (config/current-major-version)
        data-source (get-data-source db-type db-def)]
    (create-current-database db-type db-def data-source)
    (binding [mdb.connection/*application-db* (mdb.connection/application-db db-type data-source)]
      (mt/dataset bird-flocks
        (doseq [version (sort > versions)]
          (let [filename (dump-filename h2-filename version)]
            (when (< version current-version)
              (t2.conn/with-connection [conn]
                (liquibase/with-liquibase [liquibase conn]
                  (liquibase/rollback-major-version db-type conn liquibase version))))
            (when (= version current-version)
              (is (= 18 (ffirst (mt/formatted-rows [int]
                                  (mt/run-mbql-query bird
                                    {:aggregation [[:count]]}))))))
            (dump-to-h2/dump-to-h2! filename)))))))

(defn- load-dump
  [db-name h2-filename version]
  (let [db-type driver/*driver*
        db-def {:database-name db-name}
        data-source (get-data-source db-type db-def)]
    (create-current-database db-type db-def data-source)
    (binding [mdb.connection/*application-db* (mdb.connection/application-db db-type data-source)]
      (mt/dataset sad-toucan-incidents
        (is (= 200 (ffirst (mt/formatted-rows [int]
                             (mt/run-mbql-query incidents
                               {:aggregation [[:count]]})))))
        (load-from-h2/load-from-h2! (dump-filename h2-filename version))
        (when (= version (config/current-major-version))
          (is (= 18 (ffirst (mt/formatted-rows [int]
                              (mt/run-mbql-query bird
                                {:aggregation [[:count]]}))))))))))

(deftest down-migrate-and-load-dump-test
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-dir [dir nil]
      (let [h2-filename (str dir "/dump")
            current-version (or (config/current-major-version)
                                (throw (ex-info "Couldn't determine current majore version" {})))
            versions (range current-version (- current-version 4) -1)]
        (create-dumps "load-test-source" h2-filename versions)
        (doseq [version versions]
          (load-dump "load-test-target" h2-filename version))))))

(comment
  ;; $ docker run -name meta-postgres15-sample -d metabase/qa-databases:postgres-sample-15
  (metabase.test.data.interface/db-test-env-var! :postgresql :user "metabase")
  (metabase.test.data.interface/db-test-env-var! :postgresql :password "metasample123")
  (mt/set-test-drivers! #{:postgres})
  0)
