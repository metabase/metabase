(ns metabase.cmd.load-from-h2-test
  (:require
   [clojure.test :refer :all]
   [metabase.cmd.copy :as copy]
   [metabase.cmd.dump-to-h2 :as dump-to-h2]
   [metabase.cmd.load-from-h2 :as load-from-h2]
   [metabase.cmd.test-util :as cmd.test-util]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.liquibase :as liquibase]
   [metabase.db.setup :as mdb.setup]
   [metabase.db.test-util :as mdb.test-util]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.models :refer [Table]]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util.log :as log]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2])
  (:import
   (liquibase.changelog ChangeSet)))

(set! *warn-on-reflection* true)

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

(defn get-data-source [db-type db-def]
  (let [connection-details (tx/dbdef->connection-details db-type :db db-def)
        db-spec (sql-jdbc.conn/connection-details->spec db-type connection-details)]
    (mdb.test-util/->ClojureJDBCSpecDataSource db-spec)))

(defn create-current-database
  [db-type db-def data-source]
  (tx/create-db! db-type db-def)
  (mdb.setup/setup-db! db-type data-source true false))

(defn- dump-filename
  [h2-filename version]
  (str h2-filename "-" version))

(defn- liquibase-latest-major-version
  []
  (t2.conn/with-connection [conn]
    (liquibase/with-liquibase [liquibase conn]
      (let [change-sets (.. liquibase getDatabaseChangeLog getChangeSets)
            size (count change-sets)]
        (if (pos? size)
          (let [change-set-id (.getId ^ChangeSet (.get change-sets (dec size)))
                [_ major] (re-find #"v(\d+).*" change-set-id)]
            (if major
              (parse-long major)
              (throw (ex-info "couldn't parse major version from change-set-id " change-set-id
                              {:change-set-id change-set-id}))))
          (throw (ex-info "no changesets found" {})))))))

(def ^:private current-major-version
  ;; We are interested in the latest version we started preparing
  ;; and we assume that every version has database migrations.
  ;; (Downgrading and upgrading between versions with identical
  ;; databases is trivial, so the difference is probably not really
  ;; interesting.)
  (delay (liquibase-latest-major-version)))

(defn- migrate-down-then-up-and-create-dump
  [db-name h2-filename version]
  (let [db-type driver/*driver*
        db-def {:database-name db-name}
        current-version @current-major-version
        data-source (get-data-source db-type db-def)]
    (log/info "creating database")
    (create-current-database db-type db-def data-source)
    (binding [mdb.connection/*application-db* (mdb.connection/application-db db-type data-source)]
      (mt/dataset bird-flocks
        ;; make sure the data is there
        (is (= 18 (ffirst (mt/formatted-rows [int]
                                             (mt/run-mbql-query bird
                                               {:aggregation [[:count]]})))))
        (let [filename (dump-filename h2-filename version)]
          (when (< version current-version)
            (log/info "rolling back to version" version)
            (t2.conn/with-connection [conn]
              (liquibase/with-liquibase [liquibase conn]
                (liquibase/rollback-major-version conn liquibase version))))
          (log/info "creating dump" filename)
          ;; this migrates the DB back to the newest and creates a dump
          (dump-to-h2/dump-to-h2! filename)
          ;; check if after a down and up migration we can still run a query
          (is (= 18 (ffirst (mt/formatted-rows [int]
                                               (mt/run-mbql-query bird
                                                 {:aggregation [[:count]]}))))))))))

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
        (log/info "loading dump" h2-filename "version" version)
        (load-from-h2/load-from-h2! (dump-filename h2-filename version))
        ;; check that we can run the query using data from the dump
        (is (= 18 (ffirst (mt/formatted-rows [int]
                            (mt/run-mbql-query bird
                              {:aggregation [[:count]]})))))))))

(deftest down-migrate-and-load-dump-test
  (mt/test-drivers #{:mysql :postgres}
    (mt/with-temp-dir [dir nil]
      (let [h2-filename (str dir "/dump")
            current-version (or @current-major-version
                                (throw (ex-info "Couldn't determine current major version" {})))
            supported-downgrades 4
            versions (range current-version (- current-version supported-downgrades) -1)]
        (doseq [version versions]
          (migrate-down-then-up-and-create-dump "load-test-source" h2-filename version)
          (load-dump "load-test-target" h2-filename version))))))
