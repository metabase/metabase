(ns metabase.api.persist-test
  (:require [clojure.test :refer :all]
            [metabase.models.database :refer [Database]]
            [metabase.task.persist-refresh :as task.persist-refresh]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private default-cron "0 0 0/12 * * ? *")

(defn- do-with-setup [f]
  (mt/with-temp-scheduler
    (#'task.persist-refresh/job-init!)
    (mt/with-temporary-setting-values [:persisted-models-enabled true]
      (mt/with-temp* [Database [db {:options {:persist-models-enabled true}}]]
        (task.persist-refresh/schedule-persistence-for-database! db default-cron)
        (f db)))))

(defmacro ^:private with-setup
  "Sets up a temp scheduler, a temp database and enabled persistence"
  [db-binding & body]
  `(do-with-setup (fn [~db-binding] ~@body)))

(deftest set-refresh-schedule-test
  (testing "Setting new cron schedule reschedules refresh tasks"
    (with-setup db
      (is (= default-cron (get-in (task.persist-refresh/job-info-by-db-id)
                                  [(:id db) :schedule])))
      (let [new-schedule "0 0 0/12 * * ? *"]
        (mt/user-http-request :crowberto :post 204 "persist/set-refresh-schedule"
                              {:cron new-schedule})
        (is (= new-schedule
               (get-in (task.persist-refresh/job-info-by-db-id)
                       [(:id db) :schedule]))))))
  (testing "Prevents setting a year value"
    (with-setup db
      (let [bad-schedule "0 0 0/12 * * ? 1995"]
        (is (= "Must be a valid cron string not specifying a year"
               (mt/user-http-request :crowberto :post 400 "persist/set-refresh-schedule"
                                     {:cron bad-schedule})))
        (is (= default-cron
               (get-in (task.persist-refresh/job-info-by-db-id)
                       [(:id db) :schedule])))))))
