(ns metabase.driver.h2-test
  (:require [expectations :refer :all]
            [metabase.driver.generic-sql.interface :as i]
            [metabase.driver.h2 :refer :all]))

;; # Check that database->connection-details works
;; ## new-style
(expect {:db
         "file:/Users/cam/birdly/bird_sightings.db;AUTO_SERVER=TRUE;DB_CLOSE_DELAY=-1"}
  (i/database->connection-details driver {:details {:db "file:/Users/cam/birdly/bird_sightings.db;AUTO_SERVER=TRUE;DB_CLOSE_DELAY=-1"}}))
