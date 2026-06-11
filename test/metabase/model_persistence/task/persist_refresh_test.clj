(ns metabase.model-persistence.task.persist-refresh-test
  (:require
   [clojure.test :refer :all]
   [clojurewerkz.quartzite.conversion :as qc]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.channel.email.messages :as messages]
   [metabase.channel.init]
   [metabase.driver.connection :as driver.conn]
   [metabase.events.core :as events]
   [metabase.model-persistence.init]
   [metabase.model-persistence.task.persist-refresh :as task.persist-refresh]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.test :as mt]
   [metabase.util :as u]
   [potemkin.types :as p]
   [toucan2.core :as t2])
  (:import
   (org.quartz CronScheduleBuilder CronTrigger)))

(set! *warn-on-reflection* true)

(comment metabase.channel.init/keep-me
         metabase.model-persistence.init/keep-me)

(p/defprotocol+ ^:private GetSchedule
  (^:private schedule-string [_]))

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
  (mt/with-temp-scheduler!
    (mt/with-temp [:model/Database db-1 {:settings {:persist-models-enabled true}}
                   :model/Database db-2 {:settings {:persist-models-enabled true}}]
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

(deftest fault-tolerance-test
  (mt/with-premium-features #{:cache-granular-controls}
    (mt/with-model-cleanup [:model/TaskHistory]
      (mt/with-temp [:model/Database db {:settings {:persist-models-enabled true}}
                     :model/Card model {:type :model :database_id (u/the-id db)}
                     :model/PersistedInfo persisted-info {:card_id (u/the-id model) :database_id (u/the-id db)}]
        (let [test-refresher (reify task.persist-refresh/Refresher
                               (refresh! [_ _database _definition _card]
                                 {:state :success})
                               (unpersist! [_ _database _persisted-info]))
              original-update! (mt/original-fn #'t2/update!)]
          (testing "If saving the `persisted` (or `error`) state fails..."
            (mt/with-dynamic-fn-redefs [t2/update! (fn [model id update]
                                                     (when (= "persisted" (:state update))
                                                       (throw (ex-info "simulated error" {})))
                                                     (original-update! model id update))]
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"simulated error"
                                    (#'task.persist-refresh/refresh-tables! (u/the-id db) test-refresher nil))))
            (testing "the PersistedInfo is left in the `refreshing` state"
              (is (= "refreshing" (t2/select-one-fn :state :model/PersistedInfo :id (u/the-id persisted-info)))))
            (testing "but a subsequent refresh run will refresh the table"
              (#'task.persist-refresh/refresh-tables! (u/the-id db) test-refresher nil)
              (is (= "persisted" (t2/select-one-fn :state :model/PersistedInfo :id (u/the-id persisted-info)))))))))))

(deftest task-establishes-no-write-connection-context-test
  (testing "The persist-refresh task layer leaves *connection-type* at :default; refresh! and unpersist!
            implementations are responsible for declaring write themselves (so a read sub-step like query
            compilation is not forced into a write context)."
    (mt/with-model-cleanup [:model/TaskHistory]
      (mt/with-temp [:model/Database     db {:settings {:persist-models-enabled true}}
                     :model/Card         model {:type :model :database_id (u/the-id db)}
                     :model/PersistedInfo _refreshable {:card_id (u/the-id model) :database_id (u/the-id db)}
                     :model/Card         model2 {:type :model :database_id (u/the-id db)}
                     :model/PersistedInfo deletable {:card_id         (u/the-id model2)
                                                     :database_id     (u/the-id db)
                                                     :state           "deletable"
                                                     ;; old enough to be prunable
                                                     :state_change_at (t/minus (t/local-date-time) (t/hours 2))}]
        (testing "refresh! receives :default"
          (let [seen      (atom ::unset)
                refresher (reify task.persist-refresh/Refresher
                            (refresh! [_ _database _definition _card]
                              (reset! seen @#'driver.conn/*connection-type*)
                              {:state :success})
                            (unpersist! [_ _database _persisted-info]))]
            (#'task.persist-refresh/refresh-tables! (u/the-id db) refresher nil)
            (is (= :default @seen))))
        (testing "unpersist! receives :default"
          (let [seen      (atom ::unset)
                refresher (reify task.persist-refresh/Refresher
                            (refresh! [_ _database _definition _card] {:state :success})
                            (unpersist! [_ _database _persisted-info]
                              (reset! seen @#'driver.conn/*connection-type*)))]
            (#'task.persist-refresh/prune-deletables! refresher [deletable])
            (is (= :default @seen))))))))

(deftest refresh-tables!'-test
  (mt/with-model-cleanup [:model/TaskHistory]
    (mt/with-temp [:model/Database db {:settings {:persist-models-enabled true}}
                   :model/Card     model1 {:type :model :database_id (u/the-id db)}
                   :model/Card     model2 {:type :model :database_id (u/the-id db)}
                   :model/Card     archived {:archived true :type :model :database_id (u/the-id db)}
                   :model/Card     unmodeled {:type :question :database_id (u/the-id db)}
                   :model/PersistedInfo _p1 {:card_id (u/the-id model1) :database_id (u/the-id db)}
                   :model/PersistedInfo _p2 {:card_id (u/the-id model2) :database_id (u/the-id db)}
                   :model/PersistedInfo _parchived {:card_id (u/the-id archived) :database_id (u/the-id db)}
                   :model/PersistedInfo _punmodeled {:card_id (u/the-id unmodeled) :database_id (u/the-id db)}]
      (testing "Calls refresh on each persisted-info row"
        (let [card-ids (atom #{})
              test-refresher (reify task.persist-refresh/Refresher
                               (refresh! [_ _database _definition card]
                                 (swap! card-ids conj (:id card))
                                 {:state :success})
                               (unpersist! [_ _database _persisted-info]))]
          (#'task.persist-refresh/refresh-tables! (u/the-id db) test-refresher nil)
          (testing "Does not refresh archived cards or cards no longer models."
            (is (= #{(u/the-id model1) (u/the-id model2)} @card-ids)))
          (is (partial= {:task "persist-refresh"
                         :task_details {:success 2 :error 0}}
                        (t2/select-one :model/TaskHistory
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
          (#'task.persist-refresh/refresh-tables! (u/the-id db) test-refresher nil)
          (is (= 2 @call-count))
          (is (partial= {:task "persist-refresh"
                         :task_details {:success 1 :error 1}}
                        (t2/select-one :model/TaskHistory
                                       :db_id (u/the-id db)
                                       :task "persist-refresh"
                                       {:order-by [[:id :desc]]}))))))
    (testing "Deletes any in a deletable state"
      (mt/with-temp [:model/Database db {:settings {:persist-models-enabled true}}
                     :model/Card     model3 {:type :model :database_id (u/the-id db)}
                     :model/Card     archived {:archived true :type :model :database_id (u/the-id db)}
                     :model/Card     unmodeled {:type :question :database_id (u/the-id db)}
                     :model/PersistedInfo parchived {:card_id (u/the-id archived) :database_id (u/the-id db)}
                     :model/PersistedInfo punmodeled {:card_id (u/the-id unmodeled) :database_id (u/the-id db)}
                     :model/PersistedInfo deletable {:card_id (u/the-id model3) :database_id (u/the-id db)
                                                     :state "deletable"
                                                     ;; need an "old enough" state change
                                                     :state_change_at (t/minus (t/local-date-time) (t/hours 2))}
                     ;; Record not in "deletable" state, but with nil card_id
                     :model/PersistedInfo deletable2 {:card_id nil :database_id (u/the-id db)}]
        (let [called-on (atom #{})
              test-refresher (reify task.persist-refresh/Refresher
                               (refresh! [_ _ _ _]
                                 (is false "refresh! called on a model that should not be refreshed"))
                               (unpersist! [_ _database persisted-info]
                                 (swap! called-on conj (u/the-id persisted-info))))]
          (testing "Query finds deletable, archived, and unmodeled persisted infos"
            (let [queued-for-deletion (into #{} (map :id) (#'task.persist-refresh/deletable-models))]
              (doseq [deletable-persisted [deletable punmodeled parchived]]
                (is (contains? queued-for-deletion (u/the-id deletable-persisted))))))
          ;; we manually pass in the deleteable ones to not catch others in a running instance
          (#'task.persist-refresh/prune-deletables! test-refresher [deletable parchived punmodeled])
          (testing "We delete persisted_info records for all of the pruned"
            (let [persisted-records (t2/select :model/PersistedInfo :id [:in (map :id [parchived punmodeled deletable])])
                  existing (map (comp
                                 (update-keys {parchived 'parchived
                                               punmodeled 'punmodeled
                                               deletable 'deletable
                                               deletable2 'deletable2}
                                              :id)
                                 :id)
                                persisted-records)]
              (is (= [] existing))))
          ;; don't assert equality if there are any deletable in the app db
          (doseq [deletable-persisted [deletable punmodeled parchived]]
            (is (contains? @called-on (u/the-id deletable-persisted))))
          (is (partial= {:task "unpersist-tables"
                         :task_details {:success 3 :error 0, :skipped 0}}
                        (t2/select-one :model/TaskHistory
                                       :task "unpersist-tables"
                                       {:order-by [[:id :desc]]}))))))))
(deftest save-task-history-test
  (mt/with-model-cleanup [:model/TaskHistory]
    (testing "if tasks succeed, task_details should be saved and status is sucecss"
      (let [task-name (mt/random-name)]
        (#'task.persist-refresh/save-task-history! task-name (mt/id)
                                                   (fn []
                                                     {:foo "bar"}))
        (is (=? {:task         task-name
                 :task_details {:foo "bar"}
                 :status       :success}
                (t2/select-one :model/TaskHistory :task task-name)))))))

(deftest save-task-history-test-2
  (mt/with-model-cleanup [:model/TaskHistory]
    (testing "if the task fails, task history should have status is faield"
      (let [task-name (mt/random-name)]
        (#'task.persist-refresh/save-task-history! task-name (mt/id)
                                                   (fn []
                                                     {:error-details ["some-error"]}))
        (is (=? {:task         task-name
                 :task_details {:error-details ["some-error"]}
                 :status       :failed}
                (t2/select-one :model/TaskHistory :task task-name)))))))

(deftest save-task-history-test-3
  (mt/with-model-cleanup [:model/TaskHistory]
    (testing "send an email if persist-refresh fails"
      (let [email-sent (atom false)]
        ;; TODO -- a real test that actually made sure this function worked instead of swapping it out would be nice.
        (mt/with-dynamic-fn-redefs [task.persist-refresh/publish-refresh-error-event! (fn [& _args]
                                                                                        (reset! email-sent true))]
          (#'task.persist-refresh/save-task-history! "persist-refresh" (mt/id)
                                                     (fn []
                                                       {:error-details ["some-error"]}))
          (is (true? @email-sent)))))))

(deftest persisted-model-refresh-error-event-accepts-quartz-trigger-test
  (with-redefs [messages/send-persistent-model-error-email! (fn [& _] nil)]
    (let [^org.quartz.Trigger trigger (#'task.persist-refresh/database-trigger {:id 1} "0 0 0/8 * * ? *")]
      (is (identical?
           trigger
           (:trigger (events/publish-event!
                      :event/persisted-model-refresh-error
                      {:database-id     1
                       :persisted-infos [{:id       1
                                          :error    "boom"
                                          :database {:id 1}
                                          :card     {:collection nil}}]
                       :trigger         trigger})))))))

(deftest publish-refresh-error-event-sends-admin-email-test
  (mt/with-fake-inbox
    (mt/with-model-cleanup [:model/TaskHistory]
      (mt/with-temp [:model/Database       db             {:settings {:persist-models-enabled true}}
                     :model/Card           model          {:type :model :database_id (u/the-id db)}
                     :model/PersistedInfo  persisted-info {:card_id     (u/the-id model)
                                                           :database_id (u/the-id db)
                                                           :state       "persisted"}]
        (let [^org.quartz.Trigger trigger (#'task.persist-refresh/database-trigger db "0 0 0/8 * * ? *")]
          (#'task.persist-refresh/save-task-history!
           "persist-refresh" (u/the-id db)
           (fn []
             {:success       0
              :error         1
              :trigger       trigger
              :error-details [{:persisted-info-id (u/the-id persisted-info)
                               :error             "simulated refresh failure"}]})))
        (let [msgs (get @mt/inbox "crowberto@metabase.com")
              body (-> msgs first :body first :content str)]
          (is (= 1 (count msgs)))
          (is (re-find #"Model cache refresh failed" (str (:subject (first msgs)))))
          (is (re-find #"Last run trigger" body))
          (is (re-find #"Scheduled" body)))))))
