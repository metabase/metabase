(ns metabase.db.custom-migrations-test
  "Tests to make sure the custom migrations work as expected."
  (:require
   [clojure.test :refer :all]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.scheduler :as qs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.db.schema-migrations-test.impl :as impl]
   [metabase.models
    :refer [Database
            Field
            Table]]
   [metabase.task :as task]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(jobs/defjob AbandonmentEmail [_] :default)

(deftest delete-abandonment-email-task-test
  (testing "Migration v46.00-086: Delete the abandonment email task"
    (impl/test-migrations ["v46.00-086"] [migrate!]
      (try (do (task/start-scheduler!)
               (let [abandonment-emails-job-key     "metabase.task.abandonment-emails.job"
                     abandonment-emails-trigger-key "metabase.task.abandonment-emails.trigger"
                     ;; this corresponds to the job and trigger removed in metabase#27348
                     job     (jobs/build
                              (jobs/of-type AbandonmentEmail)
                              (jobs/with-identity (jobs/key abandonment-emails-job-key)))
                     trigger (triggers/build
                              (triggers/with-identity (triggers/key abandonment-emails-trigger-key))
                              (triggers/start-now)
                              (triggers/with-schedule
                                (cron/cron-schedule "0 0 12 * * ? *")))]
                 (task/schedule-task! job trigger)
                 (testing "before the migration, the job and trigger exist"
                   (is (some? (qs/get-job (@#'task/scheduler) (jobs/key abandonment-emails-job-key))))
                   (is (some? (qs/get-trigger (@#'task/scheduler) (triggers/key abandonment-emails-trigger-key)))))
                 ;; stop the scheduler because the scheduler won't be started when migrations start
                 (task/stop-scheduler!)
                 (migrate!)
                 ;; check the job and trigger are deleted
                 (task/start-scheduler!)
                 (testing "after the migration, the job and trigger are deleted"
                   (is (nil? (qs/get-job (@#'task/scheduler) (jobs/key abandonment-emails-job-key))))
                   (is (nil? (qs/get-trigger (@#'task/scheduler) (triggers/key abandonment-emails-trigger-key)))))))
           (finally (task/stop-scheduler!))))))

(deftest migrate-field-json-unfolding-type-test
  (testing "Migration v47.00-003: set base-type to type/JSON for JSON database-types for postgres and mysql"
    (impl/test-migrations ["v47.00-003"] [migrate!]
      (let [[enabled-db-id
             enabled-by-default-db-1-id
             enabled-by-default-db-2-id
             disabled-db-id] (t2/insert-returning-pks! Database [{:name    "enabled"
                                                                  :engine  "postgres"
                                                                  :details {:json-unfolding true}}
                                                                 {:name    "enabled by default"
                                                                  :engine  "postgres"
                                                                  :details {}}
                                                                 {:name    "enabled by default"
                                                                  :engine  "postgres"
                                                                  :details {:json-unfolding nil}}
                                                                 {:name    "disabled"
                                                                  :engine  "postgres"
                                                                  :details {:json-unfolding false}}])
            ;; create a table for each database
            [enabled-table-id
             enabled-by-default-table-1-id
             enabled-by-default-table-2-id
             disabled-table-id] (t2/insert-returning-pks! Table (for [db-id [enabled-db-id
                                                                             enabled-by-default-db-1-id
                                                                             enabled-by-default-db-2-id
                                                                             disabled-db-id]]
                                                                  {:db_id db-id :name "Table" :active true}))
            ;; create a JSON field for each table
            [enabled-field-id
             enabled-by-default-field-1-id
             enabled-by-default-field-2-id
             disabled-field-id] (t2/insert-returning-pks! Field (for [table-id [enabled-table-id
                                                                                enabled-by-default-table-1-id
                                                                                enabled-by-default-table-2-id
                                                                                disabled-table-id]]
                                                                  {:table_id      table-id
                                                                   :name          "Field"
                                                                   :active        true
                                                                   :base_type     :type/JSON
                                                                   :database_type "json"}))
            _                  (migrate!)
            id->json-unfolding (t2/select-pk->fn :json_unfolding Field)]
        (are [field-id expected] (= expected (get id->json-unfolding field-id))
          enabled-field-id              true       ; {:json-unfolding true}
          enabled-by-default-field-1-id true       ; {}
          enabled-by-default-field-2-id true       ; {:json-unfolding nil}
          disabled-field-id             false))))) ; {:json-unfolding false}
