(ns metabase.cmd.load-from-h2-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.cmd.load-from-h2-test]}
                                                            metabase.test.data/run-mbql-query {:namespaces [metabase.cmd.load-from-h2-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.app-db.liquibase.rollback :as rollback]
   [metabase.app-db.liquibase.versions :as versions]
   [metabase.app-db.setup :as mdb.setup]
   [metabase.app-db.test-util :as mdb.test-util]
   [metabase.cmd.copy :as copy]
   [metabase.cmd.dump-to-h2 :as dump-to-h2]
   [metabase.cmd.load-from-h2 :as load-from-h2]
   [metabase.cmd.test-util :as cmd.test-util]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util.log :as log]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2])
  (:import
   (liquibase.changelog ChangeSet)))

(set! *warn-on-reflection* true)

(defn- do-load-from-h2-test! [db-name thunk]
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
      (tx/destroy-db! target-db-type db-def)
      (tx/create-db! target-db-type db-def)
      (binding [mdb.connection/*application-db* (mdb.connection/application-db target-db-type target-data-source)]
        (load-from-h2/load-from-h2! h2-filename)
        (is (= 4
               (t2/count :model/Table)))
        (thunk)))))

(deftest load-from-h2-test
  (do-load-from-h2-test!
   "dump-test"
   (fn []
     (testing "H2 connection details should not have been copied"
       (is (= {}
              (t2/select-one-fn :details :model/Database :engine :h2)))))))

(deftest load-from-h2-copy-details-enabled-test
  (binding [copy/*copy-h2-database-details* true]
    (do-load-from-h2-test!
     "dump-test-2"
     (fn []
       (testing "H2 connection details SHOULD have been copied"
         (is (=? {:db string?}
                 (t2/select-one-fn :details :model/Database :engine :h2))))))))

(defn get-data-source [db-type db-def]
  (let [connection-details (tx/dbdef->connection-details db-type :db db-def)
        db-spec (sql-jdbc.conn/connection-details->spec db-type connection-details)]
    (mdb.test-util/->ClojureJDBCSpecDataSource db-spec)))

(defn create-current-database!
  [db-type db-def data-source]
  (tx/destroy-db! db-type db-def)
  (tx/create-db! db-type db-def)
  (mdb.setup/setup-db! db-type data-source)
  (search/reset-tracking!))

(defn- dump-filename
  [h2-filename version]
  (str h2-filename "-" version))

(defn- liquibase-latest-major-version
  []
  (t2.conn/with-connection [conn]
    (liquibase/with-liquibase [liquibase conn]
      (let [change-sets (.. liquibase getDatabaseChangeLog getChangeSets)
            ;; the highest `vNN.` major in the changelog. Year-directory migrations (`migrations/2026/...`) have
            ;; version-less ids and sort last, so "the last changeset's id" no longer necessarily carries a version.
            majors      (keep (fn [^ChangeSet cs]
                                (some-> (re-find #"^v(\d+)\." (.getId cs)) second parse-long))
                              change-sets)]
        (if (seq majors)
          (apply max majors)
          (throw (ex-info "no versioned changesets found" {})))))))

(def ^:private current-major-version
  ;; We are interested in the latest version we started preparing
  ;; and we assume that every version has database migrations.
  ;; (Downgrading and upgrading between versions with identical
  ;; databases is trivial, so the difference is probably not really
  ;; interesting.)
  (delay (liquibase-latest-major-version)))

(defn- fabricate-per-major-version-history!
  "A fresh install records only its own version, and [[rollback/rollback-major-version!]] only accepts majors recorded
  for a deployment -- so split the install's single deployment into one per legacy `vNN.` major, as if this database
  had really been upgraded release by release, giving the rollback a boundary at every major."
  []
  (t2.conn/with-connection [conn]
    (liquibase/with-liquibase [liquibase conn]
      (versions/ensure-version-tracking! conn (.getDatabase liquibase))
      (mdb.test-util/split-legacy-majors-into-deployments! conn (liquibase/changelog-table-name liquibase)))))

(defn- migrate-down-then-up-and-create-dump!
  [db-def h2-filename version]
  (let [db-type driver/*driver*
        current-version @current-major-version
        data-source (get-data-source db-type db-def)]
    (binding [mdb.connection/*application-db* (mdb.connection/application-db db-type data-source)]
      (mt/dataset bird-flocks
        ;; make sure the data is there
        (is (= 18
               (ffirst (mt/formatted-rows
                        [int]
                        (mt/run-mbql-query bird
                          {:aggregation [[:count]]})))))
        (let [filename (dump-filename h2-filename version)]
          (when (< version current-version)
            (log/info "rolling back to version" version)
            (t2.conn/with-connection [conn]
              (liquibase/with-liquibase [liquibase conn]
                ;; force: targets more than one major back are outside the default rollback window (current major +
                ;; previous-major boundary); force widens it to the full recorded history. Every target is a recorded
                ;; version courtesy of [[fabricate-per-major-version-history!]]. The default-window rule itself is
                ;; covered in metabase.app-db.liquibase-test.
                (rollback/rollback-major-version! conn liquibase true version))))
          (log/info "creating dump" filename)
          ;; this migrates the DB back to the newest and creates a dump
          (dump-to-h2/dump-to-h2! filename)
          ;; check if after a down and up migration we can still run a query
          (is (= 18 (ffirst (mt/formatted-rows
                             [int]
                             (mt/run-mbql-query bird
                               {:aggregation [[:count]]}))))))))))

(defn- load-dump!
  [db-name h2-filename version]
  (let [db-type driver/*driver*
        db-def {:database-name db-name}
        data-source (get-data-source db-type db-def)]
    (create-current-database! db-type db-def data-source)
    (binding [mdb.connection/*application-db* (mdb.connection/application-db db-type data-source)]
      (mt/dataset sad-toucan-incidents
        (is (= 200
               (ffirst (mt/formatted-rows
                        [int]
                        (mt/run-mbql-query incidents
                          {:aggregation [[:count]]})))))
        (log/info "loading dump" h2-filename "version" version)
        (load-from-h2/load-from-h2! (dump-filename h2-filename version))
        ;; check that we can run the query using data from the dump
        (is (= 18
               (ffirst (mt/formatted-rows
                        [int]
                        (mt/run-mbql-query bird
                          {:aggregation [[:count]]})))))))))

(deftest down-migrate-and-load-dump-test
  (mt/test-drivers #{:mysql :postgres}
    (mt/with-temp-dir [dir nil]
      (let [h2-filename (str dir "/dump")
            current-version (or @current-major-version
                                (throw (ex-info "Couldn't determine current major version" {})))
            supported-downgrades 4
            versions (range current-version (- current-version supported-downgrades) -1)
            db-type driver/*driver*
            source-db-def {:database-name "load-test-source"}
            data-source (get-data-source db-type source-db-def)]
        ;; Create "load-test-source" once and then reuse it because creating it for each supported version, running all
        ;; migrations and populating with data takes a lot of time.
        (log/info "creating database")
        (create-current-database! db-type source-db-def data-source)
        (binding [mdb.connection/*application-db* (mdb.connection/application-db db-type data-source)]
          (fabricate-per-major-version-history!))
        (doseq [version versions]
          (migrate-down-then-up-and-create-dump! source-db-def h2-filename version)
          (load-dump! "load-test-target" h2-filename version))))))
