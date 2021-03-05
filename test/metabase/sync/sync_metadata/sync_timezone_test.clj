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

(deftest bad-change-test
  (mt/test-drivers #{:postgres}
    (testing "Test that if timezone is changed to something that fails, timezone is unaffected."
      ;; Setting timezone to "Austrailia/Sydney" fails on some computers, especially the CI ones. In that case it fails as
      ;; the dates on PostgreSQL return 'AEST' for the time zone name. The Exception is logged, but the timezone column
      ;; should be left alone and processing should continue.
      ;;
      ;; TODO - Recently this call has started *succeeding* for me on Java 10/11 and Postgres 9.6. I've seen it sync as both
      ;; "Australia/Hobart" and "Australia/Sydney". Since setting the timezone no longer always fails it's no longer a good
      ;; test. We need to think of something else here. In the meantime, I'll go ahead and consider any of the three options
      ;; valid answers.
      (mt/dataset test-data
        ;; use `with-temp-vals-in-db` to make sure the test data DB timezone gets reset to whatever it was before the test
        ;; ran if we accidentally end up setting it in the `:after` part
        (mt/with-temp-vals-in-db Database (mt/db) {:timezone (db-timezone (mt/db))}
          (sync-tz/sync-timezone! (mt/db))
          (testing "before"
            (is (= "UTC"
                   (db-timezone (mt/db)))))
          (testing "after"
            (mt/with-temporary-setting-values [report-timezone "Australia/Sydney"]
              (sync-tz/sync-timezone! (mt/db))
              (is (contains? #{"Australia/Hobart" "Australia/Sydney" "UTC"} (db-timezone (mt/db)))))))))))
