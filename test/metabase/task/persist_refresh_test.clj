(ns metabase.task.persist-refresh-test
  (:require [clojure.test :refer :all]
            [clojurewerkz.quartzite.conversion :as qc]
            [medley.core :as m]
            [metabase.models :refer [Card Database PersistedInfo TaskHistory]]
            [metabase.task.persist-refresh :as pr]
            [metabase.test :as mt]
            [metabase.util :as u]
            [potemkin.types :as p]
            [toucan.db :as db])
  (:import [org.quartz CronScheduleBuilder CronTrigger]))

(p/defprotocol+ GetSchedule
  (schedule-string [_]))

(extend-protocol GetSchedule
  CronScheduleBuilder
  (schedule-string [x] (schedule-string (.build x)))
  CronTrigger
  (schedule-string [x] (.getCronExpression x)))

(deftest cron-schedule-test
  (testing "creates schedule per hour when less than 24 hours"
    (is (= "0 0 0/8 * * ? *"
           (schedule-string (#'pr/cron-schedule 8 "00:00"))))
    (testing "when anchored"
      (is (= "0 30 1/8 * * ? *"
             (schedule-string (#'pr/cron-schedule 8 "01:30"))))))
  (testing "creates schedule string per day when 24 hours"
    (is (= "0 0 0 * * ? *"
           (schedule-string (#'pr/cron-schedule 24 "00:00"))))
    (testing "when anchored"
      (is (= "0 30 1 * * ? *"
             (schedule-string (#'pr/cron-schedule 24 "01:30")))))))

(deftest trigger-job-info-test
  (testing "Database refresh trigger"
    (let [tggr (#'pr/database-trigger {:id 1} 5 "00:00")]
      (is (= {"db-id" 1 "type" "database"}
             (qc/from-job-data (.getJobDataMap tggr))))
      (is (= "0 0 0/5 * * ? *"
             (schedule-string tggr)))
      (is (= "metabase.task.PersistenceRefresh.database.trigger.1"
             (.. tggr getKey getName))))
    (let [tggr (#'pr/database-trigger {:id 1} 24 "00:00")]
      (is (= {"db-id" 1 "type" "database"}
             (qc/from-job-data (.getJobDataMap tggr))))
      (is (= "0 0 0 * * ? *"
             (schedule-string tggr)))))
  (testing "Individual refresh trigger"
    (let [tggr (#'pr/individual-trigger {:card_id 5 :id 1})]
      (is (= {"persisted-id" 1 "type" "individual"}
             (qc/from-job-data (.getJobDataMap tggr))))
      (is (= "metabase.task.PersistenceRefresh.individual.trigger.1"
             (.. tggr getKey getName))))))

(defn- job-info
  [& dbs]
  (let [ids  (into #{} (map u/the-id dbs))]
    (m/map-vals
      #(select-keys % [:data :schedule :key])
      (select-keys (pr/job-info-by-db-id) ids))))

(deftest reschedule-refresh-test
  (mt/with-temp-scheduler
    (mt/with-temp* [Database [db-1 {:options {:persist-models-enabled true}}]
                    Database [db-2 {:options {:persist-models-enabled true}}]]
      (#'pr/job-init!)
      (mt/with-temporary-setting-values [persisted-model-refresh-interval-hours 4
                                         persisted-model-refresh-anchor-time "00:00"]
        (pr/reschedule-refresh!)
        (is (= {(u/the-id db-1) {:data {"db-id" (u/the-id db-1) "type" "database"}
                                 :schedule "0 0 0/4 * * ? *"
                                 :key (format "metabase.task.PersistenceRefresh.database.trigger.%d" (u/the-id db-1))}
                (u/the-id db-2) {:data {"db-id" (u/the-id db-2) "type" "database"}
                                 :schedule "0 0 0/4 * * ? *"
                                 :key (format "metabase.task.PersistenceRefresh.database.trigger.%d" (u/the-id db-2))}}
               (job-info db-1 db-2))))
      (mt/with-temporary-setting-values [persisted-model-refresh-interval-hours 8
                                         persisted-model-refresh-anchor-time "00:00"]
        (pr/reschedule-refresh!)
        (is (= {(u/the-id db-1) {:data {"db-id" (u/the-id db-1) "type" "database"}
                                 :schedule "0 0 0/8 * * ? *"
                                 :key (format "metabase.task.PersistenceRefresh.database.trigger.%d" (u/the-id db-1))}
                (u/the-id db-2) {:data {"db-id" (u/the-id db-2) "type" "database"}
                                 :schedule "0 0 0/8 * * ? *"
                                 :key (format "metabase.task.PersistenceRefresh.database.trigger.%d" (u/the-id db-2))}}
               (job-info db-1 db-2))))
      (mt/with-temporary-setting-values [persisted-model-refresh-interval-hours 8
                                         persisted-model-refresh-anchor-time "01:30"]
        (pr/reschedule-refresh!)
        (is (= {(u/the-id db-1) {:data {"db-id" (u/the-id db-1) "type" "database"}
                                 :schedule "0 30 1/8 * * ? *"
                                 :key (format "metabase.task.PersistenceRefresh.database.trigger.%d" (u/the-id db-1))}
                (u/the-id db-2) {:data {"db-id" (u/the-id db-2) "type" "database"}
                                 :schedule "0 30 1/8 * * ? *"
                                 :key (format "metabase.task.PersistenceRefresh.database.trigger.%d" (u/the-id db-2))}}
               (job-info db-1 db-2)))))))


(deftest refresh-tables!'-test
  (mt/with-model-cleanup [TaskHistory]
    (mt/with-temp* [Database [db {:options {:persist-models-enabled true}}]
                    Card     [model1 {:dataset true :database_id (u/the-id db)}]
                    Card     [model2 {:dataset true :database_id (u/the-id db)}]
                    PersistedInfo [p1 {:card_id (u/the-id model1) :database_id (u/the-id db)}]
                    PersistedInfo [p2 {:card_id (u/the-id model2) :database_id (u/the-id db)}]]
      (testing "Calls refresh on each persisted-info row"
        (let [call-count (atom 0)
              test-refresher (reify pr/Refresher
                               (refresh! [_ _database _definition _dataset-query]
                                 (swap! call-count inc)
                                 {:state :success})
                               (unpersist! [_ _database _persisted-info]))]
          (#'pr/refresh-tables! (u/the-id db) test-refresher)
          (is (= 2 @call-count))
          (is (partial= {:task "persist-refresh"
                         :task_details {:success 2 :error 0}}
                        (db/select-one TaskHistory
                                       :db_id (u/the-id db)
                                       :task "persist-refresh"
                                       {:order-by [[:id :desc]]})))))
      (testing "Handles errors and continues"
        (let [call-count (atom 0)
              test-refresher (reify pr/Refresher
                               (refresh! [_ _database _definition _dataset-query]
                                 (swap! call-count inc)
                                 ;; throw on first persist
                                 (when (= @call-count 1)
                                   (throw (ex-info "DBs are risky" {:ka :boom})))
                                 {:state :success})
                               (unpersist! [_ _database _persisted-info]))]
          (#'pr/refresh-tables! (u/the-id db) test-refresher)
          (is (= 2 @call-count))
          (is (partial= {:task "persist-refresh"
                         :task_details {:success 1 :error 1}}
                        (db/select-one TaskHistory
                                       :db_id (u/the-id db)
                                       :task "persist-refresh"
                                       {:order-by [[:id :desc]]}))))))
    (testing "Deletes any in a deletable state"
      (mt/with-temp* [Database [db {:options {:persist-models-enabled true}}]
                      Card     [model3 {:dataset true :database_id (u/the-id db)}]
                      PersistedInfo [deletable {:card_id (u/the-id model3) :database_id (u/the-id db)
                                                :state "deletable"}]]
        (let [called-on (atom #{})
              test-refresher (reify pr/Refresher
                               (refresh! [_ _ _ _])
                               (unpersist! [_ _database persisted-info]
                                 (swap! called-on conj (u/the-id persisted-info))))]
          (#'pr/prune-deletables! test-refresher [deletable])
          ;; don't assert equality if there are any deletable in the app db
          (is (contains? @called-on (u/the-id deletable)))
          (is (partial= {:task "unpersist-tables"
                         :task_details {:success 1 :error 0}}
                        (db/select-one TaskHistory
                                       :task "unpersist-tables"
                                       {:order-by [[:id :desc]]}))))))))

(comment
  (run-tests)
  )
