(ns metabase.sync.analyze.table-row-count-test
  "Tests for the sync logic that updates a Table's row count."
  (:require [metabase
             [query-processor-test :as qp-test]
             [util :as u]]
            [metabase.models.table :refer [Table]]
            [metabase.sync.analyze.table-row-count :as table-row-count]
            [metabase.test.data :as data]
            [toucan.db :as db]
            [toucan.util.test :as tt]
            [metabase.test.data.datasets :as datasets]))

;; test that syncing table row counts works
;; TODO - write a Druid version of this test. Works slightly differently since Druid doesn't have a 'venues' table
;; TODO - not sure why this doesn't work on Oracle. Seems to be an issue with the test rather than with the Oracle driver
(datasets/expect-with-engines (disj qp-test/non-timeseries-engines :oracle)
  100
  (tt/with-temp Table [venues-copy (let [venues-table (Table (data/id :venues))]
                                     (assoc (select-keys venues-table [:schema :name :db_id])
                                       :rows 0))]
    (table-row-count/update-row-count! venues-copy)
    (db/select-one-field :rows Table :id (u/get-id venues-copy))))
