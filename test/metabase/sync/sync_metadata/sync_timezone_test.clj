(ns metabase.sync.sync-metadata.sync-timezone-test
  (:require [clj-time.core :as time]
            [metabase.models.database :refer [Database]]
            [metabase.sync.sync-metadata.sync-timezone :as sync-tz]
            [metabase.sync.util-test :as sut]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.datasets :as datasets]
            [metabase.util :as u]
            [toucan.db :as db]))

(defn- db-timezone [db-or-id]
  (db/select-one-field :timezone Database :id (u/get-id db-or-id)))

;; This tests populating the timezone field for a given database. The
;; sync happens automatically, so this test removes it first to ensure
;; that it gets set when missing
(datasets/expect-with-engines #{:h2 :postgres}
  [{:timezone-id "UTC"} true true true]
  (data/dataset test-data
    (let [db              (data/db)
          tz-on-load      (db-timezone db)
          _               (db/update! Database (:id db) :timezone nil)
          tz-after-update (db-timezone db)]

      ;; It looks like we can get some stale timezone information depending on which thread is used for querying the
      ;; database in sync. Clearing the connection pool to ensure we get the most updated TZ data
      (tu/clear-connection-pool db)

      [(sut/only-step-keys (sut/sync-database! "sync-timezone" db))
       ;; On startup is the timezone specified?
       (boolean (time/time-zone-for-id tz-on-load))
       ;; Check to make sure the test removed the timezone
       (nil? tz-after-update)
       ;; Check that the value was set again after sync
       (boolean (time/time-zone-for-id (db-timezone db)))])))

(datasets/expect-with-engines #{:postgres}
  ["UTC" "UTC"]
  (data/dataset test-data
    (let [db (data/db)]
      (sync-tz/sync-timezone! db)
      [(db-timezone db)
       ;; This call fails as the dates on PostgreSQL return 'AEST'
       ;; for the time zone name. The exception is logged, but the
       ;; timezone column should be left alone and processing should
       ;; continue
       (tu/with-temporary-setting-values [report-timezone "Australia/Sydney"]
         (do
           (sync-tz/sync-timezone! db)
           (db-timezone db)))])))
