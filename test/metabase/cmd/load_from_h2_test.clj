(ns metabase.cmd.load-from-h2-test
  (:require [clojure.test :refer :all]
            [metabase.cmd.load-from-h2 :as load-from-h2]
            [metabase.db.connection :as mdb.connection]
            [metabase.driver :as driver]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.models :refer [Table]]
            [metabase.test :as mt]
            [metabase.test.data.interface :as tx]
            [toucan.db :as db]
            [metabase.cmd.test-util :as cmd.test-util]))

(deftest load-from-h2-test
  ;; enable this test in the REPL with something like (mt/set-test-drivers! #{:postgres})
  (mt/test-drivers #{:postgres :mysql}
    (let [db-def           {:database-name "dump-test"}
          h2-filename      @cmd.test-util/fixture-db-file-path
          target-db-type   driver/*driver*
          target-jdbc-spec (sql-jdbc.conn/connection-details->spec target-db-type
                             (tx/dbdef->connection-details target-db-type :db db-def))]
      (tx/create-db! target-db-type db-def)
      (binding [mdb.connection/*db-type*   target-db-type
                mdb.connection/*jdbc-spec* target-jdbc-spec]
        (load-from-h2/load-from-h2! h2-filename)
        (binding [db/*quoting-style* (mdb.connection/quoting-style target-db-type)
                  db/*db-connection* target-jdbc-spec]
          (is (= 4
                 (db/count Table)))
          ;; TODO -- better/more complete validation
          )))))
