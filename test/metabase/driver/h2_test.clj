(ns metabase.driver.h2-test
  (:require [expectations :refer :all]
            [metabase.driver.h2 :refer :all]
            [metabase.test.util :refer [resolve-private-fns]]))

(resolve-private-fns metabase.driver.h2 database->connection-details)

;; # Check that database->connection-details works with both new-style and legacy details
;; ## new-style
(expect {:db
         "file:/Users/cam/birdly/bird_sightings.db;AUTO_SERVER=TRUE;DB_CLOSE_DELAY=-1"}
  (database->connection-details {:details {:db "file:/Users/cam/birdly/bird_sightings.db;AUTO_SERVER=TRUE;DB_CLOSE_DELAY=-1"}}))

;; ## legacy
(expect {:db "file:/Users/cam/birdly/bird_sightings.db;AUTO_SERVER=TRUE;DB_CLOSE_DELAY=-1"}
  (database->connection-details {:details {:conn_str "file:/Users/cam/birdly/bird_sightings.db;AUTO_SERVER=TRUE;DB_CLOSE_DELAY=-1"}}))
