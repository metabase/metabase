(ns metabase.task.persist-refresh-test
  (:require
   [clojure.test :refer :all]
   [clojurewerkz.quartzite.conversion :as qc]
   [java-time :as t]
   [medley.core :as m]
   [metabase.models :refer [Card Database PersistedInfo TaskHistory]]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.task.persist-refresh :as task.persist-refresh]
   [metabase.test :as mt]
   [metabase.util :as u]
   [potemkin.types :as p]
   [toucan2.core :as t2])
  (:import [org.quartz CronScheduleBuilder CronTrigger]))

(set! *warn-on-reflection* true)

(p/defprotocol+ GetSchedule
  (schedule-string [_]))

(extend-protocol GetSchedule
  CronScheduleBuilder
  (schedule-string [x] (schedule-string (.build x)))
  CronTrigger
  (schedule-string [x] (.getCronExpression x)))

(deftest ^:parallel cron-schedule-test
  (testing "creates schedule per hour when less than 24 hours"
    (is (= "0 0 0/8 * * ? *"
           (schedule-string (#'task.persist-refresh/cron-schedule "0 0 0/8 * * ? *"))))
    (testing "when anchored"
      (is (= "0 30 1/8 * * ? *"
             (schedule-string (#'task.persist-refresh/cron-schedule "0 30 1/8 * * ? *"))))))
  (testing "creates schedule string per day when 24 hours"
    (is (= "0 0 0 * * ? *"
           (schedule-string (#'task.persist-refresh/cron-schedule "0 0 0 * * ? *"))))
    (testing "when anchored"
      (is (= "0 30 1 * * ? *"
             (schedule-string (#'task.persist-refresh/cron-schedule "0 30 1 * * ? *")))))))

(deftest trigger-job-info-test
  (testing "Database refresh trigger"
    (let [^org.quartz.CronTrigger tggr (#'task.persist-refresh/database-trigger {:id 1} "0 0 0/5 * * ? *")]
      (is (= {"db-id" 1 "type" "database"}
             (qc/from-job-data (.getJobDataMap tggr))))
      (is (= "0 0 0/5 * * ? *"
             (schedule-string tggr)))
      (is (= "metabase.task.PersistenceRefresh.database.trigger.1"
             (.. tggr getKey getName))))
    (let [^org.quartz.CronTrigger tggr (#'task.persist-refresh/database-trigger {:id 1} "0 0 0 * * ? *")]
      (is (= {"db-id" 1 "type" "database"}
             (qc/from-job-data (.getJobDataMap tggr))))
      (is (= "0 0 0 * * ? *"
             (schedule-string tggr))))
    (testing "in report timezone UTC"
      (mt/with-temporary-setting-values [report-timezone "UTC"]
        (let [^org.quartz.CronTrigger tggr (#'task.persist-refresh/database-trigger {:id 1} "0 0 0/5 * * ? *")]
          (is (= "UTC"
                 (.. tggr getTimeZone getID))))))
    (testing "in report timezone LA"
      (mt/with-temporary-setting-values [report-timezone "America/Los_Angeles"]
        (let [^org.quartz.CronTrigger tggr (#'task.persist-refresh/database-trigger {:id 1} "0 0 0/5 * * ? *")]
          (is (= "America/Los_Angeles"
                 (.. tggr getTimeZone getID))))))
    (testing "in system timezone"
      (mt/with-temporary-setting-values [report-timezone nil]
        (let [^org.quartz.CronTrigger tggr (#'task.persist-refresh/database-trigger {:id 1} "0 0 0/5 * * ? *")]
          (is (= (qp.timezone/system-timezone-id)
                 (.. tggr getTimeZone getID)))))))
  (testing "Individual refresh trigger"
    (let [^org.quartz.CronTrigger tggr (#'task.persist-refresh/individual-trigger {:card_id 5 :id 1})]
      (is (= {"persisted-id" 1 "type" "individual"}
             (qc/from-job-data (.getJobDataMap tggr))))
      (is (= "metabase.task.PersistenceRefresh.individual.trigger.1"
             (.. tggr getKey getName))))))

(defn- job-info
  [& dbs]
  (let [ids  (into #{} (map u/the-id dbs))]
    (m/map-vals
     #(select-keys % [:data :schedule :key])
     (select-keys (task.persist-refresh/job-info-by-db-id) ids))))

(deftest reschedule-refresh-test
  (mt/with-temp-scheduler
    (mt/with-temp* [Database [db-1 {:options {:persist-models-enabled true}}]
                    Database [db-2 {:options {:persist-models-enabled true}}]]
      (#'task.persist-refresh/job-init!)
      (mt/with-temporary-setting-values [persisted-model-refresh-cron-schedule "0 0 0/4 * * ? *"]
        (task.persist-refresh/reschedule-refresh!)
        (is (= {(u/the-id db-1) {:data {"db-id" (u/the-id db-1) "type" "database"}
                                 :schedule "0 0 0/4 * * ? *"
                                 :key (format "metabase.task.PersistenceRefresh.database.trigger.%d" (u/the-id db-1))}
                (u/the-id db-2) {:data {"db-id" (u/the-id db-2) "type" "database"}
                                 :schedule "0 0 0/4 * * ? *"
                                 :key (format "metabase.task.PersistenceRefresh.database.trigger.%d" (u/the-id db-2))}}
               (job-info db-1 db-2))))
      (mt/with-temporary-setting-values [persisted-model-refresh-cron-schedule "0 0 0/8 * * ? *"]
        (task.persist-refresh/reschedule-refresh!)
        (is (= {(u/the-id db-1) {:data {"db-id" (u/the-id db-1) "type" "database"}
                                 :schedule "0 0 0/8 * * ? *"
                                 :key (format "metabase.task.PersistenceRefresh.database.trigger.%d" (u/the-id db-1))}
                (u/the-id db-2) {:data {"db-id" (u/the-id db-2) "type" "database"}
                                 :schedule "0 0 0/8 * * ? *"
                                 :key (format "metabase.task.PersistenceRefresh.database.trigger.%d" (u/the-id db-2))}}
               (job-info db-1 db-2))))
      (mt/with-temporary-setting-values [persisted-model-refresh-cron-schedule "0 30 1/8 * * ? *"]
        (task.persist-refresh/reschedule-refresh!)
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
                    Card     [archived {:archived true :dataset true :database_id (u/the-id db)}]
                    Card     [unmodeled {:dataset false :database_id (u/the-id db)}]
                    PersistedInfo [_p1 {:card_id (u/the-id model1) :database_id (u/the-id db)}]
                    PersistedInfo [_p2 {:card_id (u/the-id model2) :database_id (u/the-id db)}]
                    PersistedInfo [_parchived {:card_id (u/the-id archived) :database_id (u/the-id db)}]
                    PersistedInfo [_punmodeled {:card_id (u/the-id unmodeled) :database_id (u/the-id db)}]]
      (testing "Calls refresh on each persisted-info row"
        (let [card-ids (atom #{})
              test-refresher (reify task.persist-refresh/Refresher
                               (refresh! [_ _database _definition card]
                                 (swap! card-ids conj (:id card))
                                 {:state :success})
                               (unpersist! [_ _database _persisted-info]))]
          (#'task.persist-refresh/refresh-tables! (u/the-id db) test-refresher)
          (testing "Does not refresh archived cards or cards no longer models."
            (is (= #{(u/the-id model1) (u/the-id model2)} @card-ids)))
          (is (partial= {:task "persist-refresh"
                         :task_details {:success 2 :error 0}}
                        (t2/select-one TaskHistory
                                       :db_id (u/the-id db)
                                       :task "persist-refresh"
                                       {:order-by [[:id :desc]]})))))
      (testing "Handles errors and continues"
        (let [call-count (atom 0)
              test-refresher (reify task.persist-refresh/Refresher
                               (refresh! [_ _database _definition _card]
                                 (swap! call-count inc)
                                 ;; throw on first persist
                                 (when (= @call-count 1)
                                   (throw (ex-info "DBs are risky" {:ka :boom})))
                                 {:state :success})
                               (unpersist! [_ _database _persisted-info]))]
          (#'task.persist-refresh/refresh-tables! (u/the-id db) test-refresher)
          (is (= 2 @call-count))
          (is (partial= {:task "persist-refresh"
                         :task_details {:success 1 :error 1}}
                        (t2/select-one TaskHistory
                                       :db_id (u/the-id db)
                                       :task "persist-refresh"
                                       {:order-by [[:id :desc]]}))))))
    (testing "Deletes any in a deletable state"
      (mt/with-temp* [Database [db {:options {:persist-models-enabled true}}]
                      Card     [model3 {:dataset true :database_id (u/the-id db)}]
                      Card     [archived {:archived true :dataset true :database_id (u/the-id db)}]
                      Card     [unmodeled {:dataset false :database_id (u/the-id db)}]
                      PersistedInfo [parchived {:card_id (u/the-id archived) :database_id (u/the-id db)}]
                      PersistedInfo [punmodeled {:card_id (u/the-id unmodeled) :database_id (u/the-id db)}]
                      PersistedInfo [deletable {:card_id (u/the-id model3) :database_id (u/the-id db)
                                                :state "deletable"
                                                ;; need an "old enough" state change
                                                :state_change_at (t/minus (t/local-date-time) (t/hours 2))}]]
        (let [called-on (atom #{})
              test-refresher (reify task.persist-refresh/Refresher
                               (refresh! [_ _ _ _]
                                 (is false "refresh! called on a model that should not be refreshed"))
                               (unpersist! [_ _database persisted-info]
                                 (swap! called-on conj (u/the-id persisted-info))))]
          (testing "Query finds deletabable, archived, and unmodeled persisted infos"
            (let [queued-for-deletion (into #{} (map :id) (#'task.persist-refresh/deletable-models))]
              (doseq [deletable-persisted [deletable punmodeled parchived]]
                (is (contains? queued-for-deletion (u/the-id deletable-persisted))))))
          ;; we manually pass in the deleteable ones to not catch others in a running instance
          (#'task.persist-refresh/prune-deletables! test-refresher [deletable parchived punmodeled])
          ;; don't assert equality if there are any deletable in the app db
          (doseq [deletable-persisted [deletable punmodeled parchived]]
            (is (contains? @called-on (u/the-id deletable-persisted))))
          (is (partial= {:task "unpersist-tables"
                         :task_details {:success 3 :error 0, :skipped 0}}
                        (t2/select-one TaskHistory
                                       :task "unpersist-tables"
                                       {:order-by [[:id :desc]]}))))))))
