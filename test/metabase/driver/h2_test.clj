(ns metabase.driver.h2-test
  (:require [clojure.java
             [io :as io]
             [jdbc :as jdbc]]
            [expectations :refer :all]
            [metabase
             [driver :as driver]
             [query-processor :as qp]]
            [metabase.driver.h2 :as h2]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.models.database :refer [Database]]
            [metabase.test.data.datasets :refer [expect-with-driver]]
            [metabase.test.util :as tu]
            [toucan.db :as db]))

;; Check that we add safe connection options to connection strings
(expect
  {:classname        "org.h2.Driver"
   :subprotocol      "h2"
   :subname          "file:my-file;SOME_OPTION=TRUE"
   :IFEXISTS         true
   :ACCESS_MODE_DATA "r"}
  (sql-jdbc.conn/connection-details->spec :h2
    {:db "file:my-file;SOME_OPTION=TRUE"}))

;; Make sure we *cannot* connect to a non-existent database
(expect
  org.h2.jdbc.JdbcSQLException
  (driver/can-connect? :h2 {:db (.getAbsolutePath (io/file "toucan_sightings"))}))

(expect                                 ;
  org.h2.jdbc.JdbcSQLException
  (jdbc/query (sql-jdbc.conn/connection-details->spec :h2
                {:db (str "file:" (.getAbsolutePath (io/file "DBThatDoesntExist.db;IFEXISTS=false")))})
              "SELECT 1"))

;; Check that we can connect to a non-existent Database when we enable potentailly unsafe connections (e.g. to the
;; Metabase database)
(expect true
  (binding [h2/*allow-potentailly-unsafe-connections* true]
    (driver/can-connect? :h2 {:db (.getAbsolutePath (io/file "pigeon_sightings"))})))

(expect-with-driver :h2
  "UTC"
  (tu/db-timezone-id))

;; Check that we're not allowed to run SQL against an H2 database with a non-admin account
(expect "Running SQL queries against H2 databases using the default (admin) database user is forbidden."
  ;; Insert a fake Database. It doesn't matter that it doesn't actually exist since query processing should
  ;; fail immediately when it realizes this DB doesn't have a USER
  (let [db (db/insert! Database, :name "Fake-H2-DB", :engine "h2", :details {:db "mem:fake-h2-db"})]
    (try (:error (qp/process-query {:database (:id db)
                                    :type     :native
                                    :native   {:query "SELECT 1"}}))
         (finally (db/delete! Database :name "Fake-H2-DB")))))
