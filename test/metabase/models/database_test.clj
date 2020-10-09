(ns metabase.models.database-test
  (:require [cheshire.core :refer [decode encode]]
            [clojure
             [string :as str]
             [test :refer :all]]
            [metabase
             [models :refer [Database]]
             [task :as task]
             [test :as mt]]
            [metabase.middleware.session :as mw.session]
            [metabase.models
             [database :as mdb]
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

(deftest sensitive-data-redacted-test
  (let [encode-decode (fn [obj] (decode (encode obj)))
        ;; this is trimmed for the parts we care about in the test
        pg-db         (mdb/map->DatabaseInstance
                       {:description nil
                        :name        "testpg"
                        :details     {:additional-options            nil
                                      :ssl                           false
                                      :password                      "Password1234"
                                      :tunnel-host                   "localhost"
                                      :port                          5432
                                      :dbname                        "mydb"
                                      :host                          "localhost"
                                      :tunnel-enabled                true
                                      :tunnel-auth-option            "ssh-key"
                                      :tunnel-port                   22
                                      :tunnel-private-key            "PRIVATE KEY IS HERE"
                                      :user                          "metabase"
                                      :tunnel-user                   "a-tunnel-user"
                                      :tunnel-private-key-passphrase "Password1234"}
                        :id          3})
        bq-db         (mdb/map->DatabaseInstance
                       {:description nil
                        :name        "testbq"
                        :details     {:use-service-account  nil
                                      :dataset-id           "office_checkins"
                                      :service-account-json "SERVICE-ACCOUNT-JSON-HERE"
                                      :use-jvm-timezone     false
                                      :project-id           "metabase-bigquery-driver"}
                        :id          2
                        :engine      :bigquery})]
    (testing "sensitive fields are redacted when database details are encoded"
      (testing "details removed for non-admin users"
        (mw.session/with-current-user
          (mt/user->id :rasta)
          (is (= {"description" nil
                  "name"        "testpg"
                  "id"          3}
                 (encode-decode pg-db)))
          (is (= {"description" nil
                  "name"        "testbq"
                  "id"          2
                  "engine"      "bigquery"}
                 (encode-decode bq-db)))))

      (testing "details are obfuscated for admin users"
        (mw.session/with-current-user
          (mt/user->id :crowberto)
          (is (= {"description" nil
                  "name"        "testpg"
                  "details"     {"tunnel-user"                   "a-tunnel-user"
                                 "dbname"                        "mydb"
                                 "host"                          "localhost"
                                 "tunnel-auth-option"            "ssh-key"
                                 "tunnel-private-key-passphrase" "**MetabasePass**"
                                 "additional-options"            nil
                                 "tunnel-port"                   22
                                 "user"                          "metabase"
                                 "tunnel-private-key"            "**MetabasePass**"
                                 "ssl"                           false
                                 "tunnel-enabled"                true
                                 "port"                          5432
                                 "password"                      "**MetabasePass**"
                                 "tunnel-host"                   "localhost"}
                  "id"          3}
                 (encode-decode pg-db)))
          (is (= {"description" nil
                  "name"        "testbq"
                  "details"     {"use-service-account"  nil
                                 "dataset-id"           "office_checkins"
                                 "service-account-json" "**MetabasePass**"
                                 "use-jvm-timezone"     false
                                 "project-id"           "metabase-bigquery-driver"}
                  "id"          2
                  "engine"      "bigquery"}
                 (encode-decode bq-db))))))))
