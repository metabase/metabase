(ns metabase.sync.sync-metadata.sync-timezone-test
  (:require [clj-time.core :as time]
            [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.models.database :refer [Database]]
            [metabase.sync.sync-metadata.sync-timezone :as sync-tz]
            [metabase.sync.util-test :as sut]
            [metabase.test :as mt]
            [metabase.util :as u]
            [toucan.db :as db]))

(defn- db-timezone [db-or-id]
  (db/select-one-field :timezone Database :id (u/the-id db-or-id)))

(deftest sync-timezone-test
  (mt/test-drivers #{:h2 :postgres}
    (testing (str "This tests populating the timezone field for a given database. The sync happens automatically, so "
                  "this test removes it first to ensure that it gets set when missing")
      (mt/dataset test-data
        (let [db                               (mt/db)
              tz-on-load                       (db-timezone db)
              _                                (db/update! Database (:id db) :timezone nil)
              tz-after-update                  (db-timezone db)
              ;; It looks like we can get some stale timezone information depending on which thread is used for querying the
              ;; database in sync. Clearing the connection pool to ensure we get the most updated TZ data
              _                                (driver/notify-database-updated driver/*driver* db)
              {:keys [step-info task-history]} (sut/sync-database! "sync-timezone" db)]
          (testing "only step keys"
            (is (= {:timezone-id "UTC"}
                   (sut/only-step-keys step-info))))
          (testing "task details"
            (is (= {:timezone-id "UTC"}
                   (:task_details task-history))))
          (testing "On startup is the timezone specified?"
            (is (time/time-zone-for-id tz-on-load)))
          (testing "Check to make sure the test removed the timezone"
            (is (nil? tz-after-update)))
          (testing "Check that the value was set again after sync"
            (is (time/time-zone-for-id (db-timezone db)))))))))
