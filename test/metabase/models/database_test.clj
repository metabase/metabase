(ns metabase.models.database-test
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [metabase
             [models :refer [Database]]
             [task :as task]
             [test :as mt]]
            [metabase.models
             [permissions :as perms]
             [user :as user]]
            [metabase.plugins.classloader :as classloader]
            [schema.core :as s]
            [toucan.db :as db]))

(defn- trigger-for-db [db-id]
  (some (fn [{trigger-key :key, :as trigger}]
          (when (str/ends-with? trigger-key (str \. db-id))
            trigger))
        (:triggers (task/job-info "metabase.task.sync-and-analyze.job"))))

(deftest perms-test
  (testing "After creating a Database, All Users group should get full permissions by default"
    (mt/with-temp Database [db]
      (is (= true
             (perms/set-has-full-permissions? (user/permissions-set (mt/user->id :rasta))
                                              (perms/object-path db)))))))

(deftest tasks-test
  (testing "Sync tasks should get scheduled for a newly created Database"
    (mt/with-temp-scheduler
      (classloader/require 'metabase.task.sync-databases)
      (task/init! :metabase.task.sync-databases/SyncDatabases)
      (mt/with-temp Database [{db-id :id}]
        (is (schema= {:description         (s/eq (format "sync-and-analyze Database %d" db-id))
                      :key                 (s/eq (format "metabase.task.sync-and-analyze.trigger.%d" db-id))
                      :misfire-instruction (s/eq "DO_NOTHING")
                      :state               (s/eq "NORMAL")
                      :may-fire-again?     (s/eq true)
                      :schedule            (s/eq "0 50 * * * ? *")
                      :final-fire-time     (s/eq nil)
                      :data                (s/eq {"db-id" db-id})
                      s/Keyword            s/Any}
                     (trigger-for-db db-id)))

        (testing "When deleting a Database, sync tasks should get removed"
          (db/delete! Database :id db-id)
          (is (= nil
                 (trigger-for-db db-id))))))))
