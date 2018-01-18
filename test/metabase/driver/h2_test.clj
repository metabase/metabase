(ns metabase.driver.h2-test
  (:require [expectations :refer :all]
            [metabase
             [db :as mdb]
             [driver :as driver]]
            [metabase.driver.h2 :as h2]
            [metabase.test.data.datasets :refer [expect-with-engine]]
            [metabase.test.util :as tu])
  (:import metabase.driver.h2.H2Driver))

;; Check that the functions for exploding a connection string's options work as expected
(expect
    ["file:my-file" {"OPTION_1" "TRUE", "OPTION_2" "100", "LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON" "NICE_TRY"}]
  (#'h2/connection-string->file+options "file:my-file;OPTION_1=TRUE;OPTION_2=100;;LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON=NICE_TRY"))

(expect "file:my-file;OPTION_1=TRUE;OPTION_2=100;LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON=NICE_TRY"
  (#'h2/file+options->connection-string "file:my-file" {"OPTION_1" "TRUE", "OPTION_2" "100", "LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON" "NICE_TRY"}))


;; Check that we add safe connection options to connection strings
(expect "file:my-file;LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON=NICE_TRY;IFEXISTS=TRUE;ACCESS_MODE_DATA=r"
  (#'h2/connection-string-set-safe-options "file:my-file;;LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON=NICE_TRY"))

;; Check that we override shady connection string options set by shady admins with safe ones
(expect "file:my-file;LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON=NICE_TRY;IFEXISTS=TRUE;ACCESS_MODE_DATA=r"
  (#'h2/connection-string-set-safe-options "file:my-file;;LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON=NICE_TRY;IFEXISTS=FALSE;ACCESS_MODE_DATA=rws"))


;; Make sure we *cannot* connect to a non-existent database
(expect :exception-thrown
  (try (driver/can-connect? (H2Driver.) {:db (str (System/getProperty "user.dir") "/toucan_sightings")})
       (catch org.h2.jdbc.JdbcSQLException e
         (and (re-matches #"Database .+ not found .+" (.getMessage e))
              :exception-thrown))))

;; Check that we can connect to a non-existent Database when we enable potentailly unsafe connections (e.g. to the
;; Metabase database)
(expect true
  (binding [mdb/*allow-potentailly-unsafe-connections* true]
    (driver/can-connect? (H2Driver.) {:db (str (System/getProperty "user.dir") "/pigeon_sightings")})))

(expect-with-engine :h2
  "UTC"
  (tu/db-timezone-id))
