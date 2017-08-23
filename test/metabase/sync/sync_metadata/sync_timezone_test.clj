(ns metabase.sync.sync-metadata.sync-timezone-test
  (:require [clj-time.core :as time]
            [metabase.models.database :refer [Database]]
            [metabase.sync.sync-metadata.sync-timezone :as sync-tz]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]
            [metabase.util :as u]
            [toucan.db :as db]))

(defn- db-timezone [db-or-id]
  (db/select-one-field :timezone Database :id (u/get-id db-or-id)))

;; This tests populating the timezone field for a given database. The
;; sync happens automatically, so this test removes it first to ensure
;; that it gets set when missing
(datasets/expect-with-engines #{:h2 :postgres}
  [true true true]
  (data/dataset test-data
    (let [db              (db/select-one Database [:name "test-data"])
          tz-on-load      (db-timezone db)
          _               (db/update! Database (:id db) :timezone nil)
          tz-after-update (db-timezone db)]
      (sync-tz/sync-timezone! db)

      ;; On startup is the timezone specified?
      [(boolean (time/time-zone-for-id tz-on-load))
       ;; Check to make sure the test removed the timezone
       (nil? tz-after-update)
       ;; Check that the value was set again after sync
       (boolean (time/time-zone-for-id (db-timezone db)))])))
