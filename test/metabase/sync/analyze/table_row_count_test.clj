(ns metabase.sync.analyze.table-row-count-test
  "Tests for the sync logic that updates a Table's row count."
  (:require [metabase.models.table :refer [Table]]
            [metabase.sync.analyze.table-row-count :as table-row-count]
            [metabase.test :as mt]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.datasets :as datasets]
            [toucan.db :as db]))

;; test that syncing table row counts works
;; TODO - write a Druid version of this test. Works slightly differently since Druid doesn't have a 'venues' table
;; TODO - not sure why this doesn't work on Oracle. Seems to be an issue with the test rather than with the Oracle driver
(datasets/expect-with-drivers (mt/normal-drivers-except #{:oracle})
  100
  (tu/with-temp-vals-in-db Table (data/id :venues) {:rows 0}
      (table-row-count/update-row-count! (Table (data/id :venues)))
      (db/select-one-field :rows Table :id (data/id :venues))))
