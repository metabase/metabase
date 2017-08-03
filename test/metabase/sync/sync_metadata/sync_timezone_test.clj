(ns metabase.sync.sync-metadata.sync-timezone-test
  (:require  [expectations :refer :all]
             [toucan.util.test :as tt]
             [metabase.models
              [database :refer [Database]]
              [table :refer [Table]]]
             [toucan.db :as db]
             [metabase.sync.sync-metadata.sync-timezone :as sync-tz]
             [metabase.test.data.datasets :as datasets]
             [metabase.test.data :as data]
             [clj-time.core :as time]
             [metabase.util :as u]))

(defn- db-timezone [db-or-id]
  (db/select-one-field :timezone Database :id (u/get-id db-or-id)))

(datasets/expect-with-engines #{:h2 :postgres}
  [true true true]
  (data/dataset test-data
    (let [db              (db/select-one Database [:name "test-data"])
          tz-on-load      (db-timezone db)
          _               (db/update! Database (:id db) :timezone nil)
          tz-after-update (db-timezone db)]
      (sync-tz/sync-timezone! db)
      [(boolean (time/time-zone-for-id tz-on-load))
       (nil? tz-after-update)
       (boolean (time/time-zone-for-id (db-timezone db)))])))
