(ns metabase.driver.h2-test
  (:require [expectations :refer [expect]]
            [metabase
             [db :as mdb]
             [driver :as driver]
             [query-processor :as qp]]
            [metabase.driver.h2 :as h2]
            [metabase.models.database :refer [Database]]
            [metabase.test.data.datasets :refer [expect-with-driver]]
            [metabase.test.util :as tu]
            [toucan.db :as db]))

;; Check that the functions for exploding a connection string's options work as expected
(expect
  ["file:my-file" {"OPTION_1" "TRUE", "OPTION_2" "100", "LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON" "NICE_TRY"}]
  (#'h2/connection-string->file+options "file:my-file;OPTION_1=TRUE;OPTION_2=100;;LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON=NICE_TRY"))

(expect
  "file:my-file;OPTION_1=TRUE;OPTION_2=100;LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON=NICE_TRY"
  (#'h2/file+options->connection-string "file:my-file" {"OPTION_1" "TRUE", "OPTION_2" "100", "LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON" "NICE_TRY"}))


;; Check that we add safe connection options to connection strings
(expect
  "file:my-file;LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON=NICE_TRY;IFEXISTS=TRUE;ACCESS_MODE_DATA=r"
  (#'h2/connection-string-set-safe-options "file:my-file;;LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON=NICE_TRY"))

;; Check that we override shady connection string options set by shady admins with safe ones
(expect
  "file:my-file;LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON=NICE_TRY;IFEXISTS=TRUE;ACCESS_MODE_DATA=r"
  (#'h2/connection-string-set-safe-options "file:my-file;;LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON=NICE_TRY;IFEXISTS=FALSE;ACCESS_MODE_DATA=rws"))

;; make sure we return the USER from db details if it is a keyword key in details...
(expect
  "cam"
  (#'h2/db-details->user {:db "file:my_db.db", :USER "cam"}))

;; or a string key...
(expect
  "cam"
  (#'h2/db-details->user {:db "file:my_db.db", "USER" "cam"}))

;; or part of the `db` connection string itself
(expect
  "cam"
  (#'h2/db-details->user {:db "file:my_db.db;USER=cam"}))


;; Make sure we *cannot* connect to a non-existent database
(expect
  ::exception-thrown
  (try (driver/can-connect? :h2 {:db (str (System/getProperty "user.dir") "/toucan_sightings")})
       (catch org.h2.jdbc.JdbcSQLException e
         (and (re-matches #"Database .+ not found .+" (.getMessage e))
              ::exception-thrown))))

;; Check that we can connect to a non-existent Database when we enable potentailly unsafe connections (e.g. to the
;; Metabase database)
(expect true
  (binding [mdb/*allow-potentailly-unsafe-connections* true]
    (driver/can-connect? :h2 {:db (str (System/getProperty "user.dir") "/pigeon_sightings")})))

(expect-with-driver :h2
  "UTC"
  (tu/db-timezone-id))

;; Check that we're not allowed to run SQL against an H2 database with a non-admin account
(expect
  "Running SQL queries against H2 databases using the default (admin) database user is forbidden."
  ;; Insert a fake Database. It doesn't matter that it doesn't actually exist since query processing should
  ;; fail immediately when it realizes this DB doesn't have a USER
  (let [db (db/insert! Database, :name "Fake-H2-DB", :engine "h2", :details {:db "mem:fake-h2-db"})]
    (try
      (:error (qp/process-query {:database (:id db)
                                 :type     :native
                                 :native   {:query "SELECT 1"}}))
      (finally (db/delete! Database :name "Fake-H2-DB")))))
