(ns ^:mb/driver-tests metabase.model-persistence.api-test
  (:require
   [clojure.test :refer :all]
   [clojurewerkz.quartzite.scheduler :as qs]
   [metabase.model-persistence.task.persist-refresh :as task.persist-refresh]
   [metabase.sync.task.sync-databases :as task.sync-databases]
   [metabase.task :as task]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (org.quartz.impl StdSchedulerFactory)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private default-cron "0 0 0/12 * * ? *")

(defn- do-with-setup! [f]
  (mt/with-temp-scheduler!
    (#'task.persist-refresh/job-init!)
    (mt/with-temporary-setting-values [:persisted-models-enabled true]
      (mt/with-temp [:model/Database db {:settings {:persist-models-enabled true}}]
        (task.persist-refresh/schedule-persistence-for-database! db default-cron)
        (f db)))))

(defmacro ^:private with-setup!
  "Sets up a temp scheduler, a temp database and enabled persistence"
  [db-binding & body]
  `(do-with-setup! (fn [~db-binding] ~@body)))

(deftest set-refresh-schedule-test
  (testing "Setting new cron schedule reschedules refresh tasks"
    (with-setup! db
      (is (= default-cron (get-in (task.persist-refresh/job-info-by-db-id)
                                  [(:id db) :schedule])))
      (let [new-schedule "0 0 0/12 * * ? *"]
        (mt/user-http-request :crowberto :post 204 "persist/set-refresh-schedule"
                              {:cron new-schedule})
        (is (= new-schedule
               (get-in (task.persist-refresh/job-info-by-db-id)
                       [(:id db) :schedule]))))))
  (testing "Prevents setting a year value"
    (with-setup! db
      (let [bad-schedule "0 0 0/12 * * ? 1995"]
        (is (= "Must be a valid cron string not specifying a year"
               (mt/user-http-request :crowberto :post 400 "persist/set-refresh-schedule"
                                     {:cron bad-schedule})))
        (is (= default-cron
               (get-in (task.persist-refresh/job-info-by-db-id)
                       [(:id db) :schedule])))))))

(deftest persisted-info-by-id-test
  (with-setup! db
    (mt/with-temp
      [:model/Card          model {:database_id (u/the-id db), :type :model}
       :model/PersistedInfo pinfo {:database_id (u/the-id db), :card_id (u/the-id model)}]
      (testing "Should require a non-negative persisted-info-id"
        (is (= "API endpoint does not exist."
               (mt/user-http-request :crowberto :get 404 (format "persist/%d" -1)))))
      (testing "Should not get info when the persisted-info-id doesn't exist"
        (is (= "Not found."
               (mt/user-http-request :crowberto :get 404 (format "persist/%d" Integer/MAX_VALUE)))))
      (testing "Should get info when the ID exists"
        (is (=? {:active  true
                 :card_id (u/the-id model)
                 :id      (u/the-id pinfo)
                 :state   "persisted"}
                (mt/user-http-request :crowberto :get 200 (format "persist/%d" (u/the-id pinfo)))))))))

(deftest persisted-info-by-card-id-test
  (with-setup! db
    (mt/with-temp
      [:model/Card          model {:database_id (u/the-id db), :type :model}
       :model/PersistedInfo pinfo {:database_id (u/the-id db), :card_id (u/the-id model)}]
      (testing "Should require a non-negative card-id"
        (is (=? "API endpoint does not exist."
                (mt/user-http-request :crowberto :get 404 (format "persist/card/%d" -1)))))
      (testing "Should not get info when the card-id doesn't exist"
        (is (= "Not found."
               (mt/user-http-request :crowberto :get 404 (format "persist/card/%d" Integer/MAX_VALUE)))))
      (testing "Should get info when the ID exists"
        (is (=? {:active  true
                 :card_id (u/the-id model)
                 :id      (u/the-id pinfo)
                 :state   "persisted"}
                (mt/user-http-request :crowberto :get 200 (format "persist/card/%d" (u/the-id model)))))))))

;;;
;;; Card tests
;;;

(defn- do-with-persistence-setup! [f]
  ;; mt/with-temp-scheduler! actually just reuses the current scheduler. The scheduler factory caches by name set in
  ;; the resources/quartz.properties file and we reuse that scheduler
  (let [sched (.getScheduler
               (StdSchedulerFactory. (doto (java.util.Properties.)
                                       (.setProperty "org.quartz.scheduler.instanceName" (str (gensym "card-api-test")))
                                       (.setProperty "org.quartz.scheduler.instanceID" "AUTO")
                                       (.setProperty "org.quartz.properties" "non-existant")
                                       (.setProperty "org.quartz.threadPool.threadCount" "6")
                                       (.setProperty "org.quartz.threadPool.class" "org.quartz.simpl.SimpleThreadPool"))))]
    ;; a binding won't work since we need to cross thread boundaries
    (with-redefs [task/scheduler (constantly sched)]
      (try
        (qs/standby sched)
        (#'task.persist-refresh/job-init!)
        (#'task.sync-databases/job-init)
        (mt/with-temporary-setting-values [:persisted-models-enabled true]
          ;; Use a postgres DB because it supports the :persist-models feature
          (mt/with-temp [:model/Database db {:settings {:persist-models-enabled true} :engine :postgres}]
            (f db)))
        (finally
          (qs/shutdown sched))))))

(defmacro ^:private with-persistence-setup!
  "Sets up a temp scheduler, a temp database and enabled persistence. Scheduler will be in standby mode so that jobs
  won't run. Just check for trigger presence."
  [db-binding & body]
  `(do-with-persistence-setup! (fn [~db-binding] ~@body)))

(defn- job-info-for-individual-refresh
  "Return a set of PersistedInfo ids of all jobs scheduled for individual refreshes."
  []
  (some->> (deref #'task.persist-refresh/refresh-job-key)
           task/job-info
           :triggers
           (map :data)
           (filter (comp #{"individual"} #(get % "type")))
           (map #(get % "persisted-id"))
           set))

(deftest card-refresh-persistence
  (testing "Can schedule refreshes for models"
    (with-persistence-setup! db
      (mt/with-temp
        [:model/Card          model      {:type :model :database_id (u/the-id db)}
         :model/Card          notmodel   {:type :question :database_id (u/the-id db)}
         :model/Card          archived   {:type :model :archived true :database_id (u/the-id db)}
         :model/PersistedInfo pmodel     {:card_id (u/the-id model) :database_id (u/the-id db)}
         :model/PersistedInfo pnotmodel  {:card_id (u/the-id notmodel) :database_id (u/the-id db)}
         :model/PersistedInfo parchived  {:card_id (u/the-id archived) :database_id (u/the-id db)}]
        (testing "Can refresh models"
          (mt/user-http-request :crowberto :post 204 (format "persist/card/%d/refresh" (u/the-id model)))
          (is (contains? (job-info-for-individual-refresh)
                         (u/the-id pmodel))
              "Missing refresh of model"))
        (testing "Won't refresh archived models"
          (mt/user-http-request :crowberto :post 400 (format "persist/card/%d/refresh" (u/the-id archived)))
          (is (not (contains? (job-info-for-individual-refresh)
                              (u/the-id pnotmodel)))
              "Scheduled refresh of archived model"))
        (testing "Won't refresh cards no longer models"
          (mt/user-http-request :crowberto :post 400 (format "persist/card/%d/refresh" (u/the-id notmodel)))
          (is (not (contains? (job-info-for-individual-refresh)
                              (u/the-id parchived)))
              "Scheduled refresh of archived model"))))))

(deftest card-unpersist-persist-model-test
  (with-persistence-setup! db
    (mt/with-temp
      [:model/Card          model     {:database_id (u/the-id db), :type :model}
       :model/PersistedInfo pmodel    {:database_id (u/the-id db), :card_id (u/the-id model)}]
      (testing "Can't unpersist models without :cache-granular-controls feature flag enabled"
        (mt/with-premium-features #{}
          (mt/user-http-request :crowberto :post 402 (format "persist/card/%d/unpersist" (u/the-id model)))
          (is (= "persisted"
                 (t2/select-one-fn :state :model/PersistedInfo :id (u/the-id pmodel))))))
      (testing "Can unpersist models with the :cache-granular-controls feature flag enabled"
        (mt/with-premium-features #{:cache-granular-controls}
          (mt/user-http-request :crowberto :post 204 (format "persist/card/%d/unpersist" (u/the-id model)))
          (is (= "off"
                 (t2/select-one-fn :state :model/PersistedInfo :id (u/the-id pmodel))))))
      (testing "Can't re-persist models with the :cache-granular-controls feature flag enabled"
        (mt/with-premium-features #{}
          (mt/user-http-request :crowberto :post 402 (format "persist/card/%d/persist" (u/the-id model)))
          (is (= "off"
                 (t2/select-one-fn :state :model/PersistedInfo :id (u/the-id pmodel))))))
      (testing "Can re-persist models with the :cache-granular-controls feature flag enabled"
        (mt/with-premium-features #{:cache-granular-controls}
          (mt/user-http-request :crowberto :post 204 (format "persist/card/%d/persist" (u/the-id model)))
          (is (= "creating"
                 (t2/select-one-fn :state :model/PersistedInfo :id (u/the-id pmodel)))))))
    (mt/with-temp
      [:model/Card          notmodel  {:database_id (u/the-id db), :type :question}
       :model/PersistedInfo pnotmodel {:database_id (u/the-id db), :card_id (u/the-id notmodel)}]
      (mt/with-premium-features #{:cache-granular-controls}
        (testing "Allows unpersisting non-model cards"
          (mt/user-http-request :crowberto :post 204 (format "persist/card/%d/unpersist" (u/the-id notmodel)))
          (is (= "off"
                 (t2/select-one-fn :state :model/PersistedInfo :id (u/the-id pnotmodel)))))
        (testing "Can't re-persist non-model cards"
          (is (= "Card is not a model"
                 (mt/user-http-request :crowberto :post 400 (format "persist/card/%d/persist" (u/the-id notmodel))))))))
    (mt/with-temp
      [:model/Card notmodel {:database_id (u/the-id db), :type :question}]
      (mt/with-premium-features #{:cache-granular-controls}
        (testing "Does not return error status when unpersisting a card that is not persisted"
          (mt/user-http-request :crowberto :post 204 (format "persist/card/%d/unpersist" (u/the-id notmodel))))))))

;;;
;;; Database tests
;;;

(deftest persist-database-test
  (mt/test-drivers (mt/normal-drivers-with-feature :persist-models)
    (let [db-id (:id (mt/db))]
      (mt/with-temp
        [:model/Card card {:database_id db-id
                           :type        :model}]
        (mt/with-temporary-setting-values [persisted-models-enabled false]
          (testing "requires persist setting to be enabled"
            (is (= "Persisting models is not enabled."
                   (mt/user-http-request :crowberto :post 400 (str "persist/database/" db-id "/persist"))))))

        (mt/with-temporary-setting-values [persisted-models-enabled true]
          (testing "only users with permissions can persist a database"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :post 403 (str "persist/database/" db-id "/persist")))))

          (testing "should be able to persit an database"
            (mt/user-http-request :crowberto :post 204 (str "persist/database/" db-id "/persist"))
            (is (= "creating" (t2/select-one-fn :state 'PersistedInfo
                                                :database_id db-id
                                                :card_id     (:id card))))
            (is (t2/select-one-fn (comp :persist-models-enabled :settings)
                                  :model/Database
                                  :id db-id))
            (is (get-in (mt/user-http-request :crowberto :get 200
                                              (str "database/" db-id))
                        [:settings :persist-models-enabled])))
          (testing "it's okay to trigger persist even though the database is already persisted"
            (mt/user-http-request :crowberto :post 204 (str "persist/database/" db-id "/persist"))))))))

(deftest unpersist-database-test
  (mt/test-drivers (mt/normal-drivers-with-feature :persist-models)
    (let [db-id (:id (mt/db))]
      (mt/with-temp
        [:model/Card _ {:database_id db-id
                        :type        :model}]
        (testing "only users with permissions can persist a database"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post 403 (str "persist/database/" db-id "/unpersist")))))
        (mt/with-temporary-setting-values [persisted-models-enabled true]
          (testing "should be able to persit an database"
            ;; trigger persist first
            (mt/user-http-request :crowberto :post 204 (str "persist/database/" db-id "/unpersist"))
            (is (nil? (t2/select-one-fn (comp :persist-models-enabled :settings)
                                        :model/Database
                                        :id db-id))))
          (testing "it's okay to unpersist even though the database is not persisted"
            (mt/user-http-request :crowberto :post 204 (str "persist/database/" db-id "/unpersist"))))))))
