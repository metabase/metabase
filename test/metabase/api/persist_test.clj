(ns metabase.api.persist-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.database :refer [Database]]
   [metabase.task.persist-refresh :as task.persist-refresh]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.tools.with-temp :as t2.with-temp]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private default-cron "0 0 0/12 * * ? *")

(defn- do-with-setup [f]
  (mt/with-temp-scheduler
    (#'task.persist-refresh/job-init!)
    (mt/with-temporary-setting-values [:persisted-models-enabled true]
      (mt/with-temp [Database db {:settings {:persist-models-enabled true}}]
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

(deftest persisted-info-by-id-test
  (with-setup db
    (t2.with-temp/with-temp
      [:model/Card          model     {:database_id (u/the-id db), :dataset true}
       :model/PersistedInfo pmodel    {:database_id (u/the-id db), :card_id (u/the-id model)}]
      (testing "Should require a non-negative persisted-info-id"
        (is (= "API endpoint does not exist."
               (mt/user-http-request :crowberto :get 404 (format "persist/%d" -1)))))
      (testing "Should not get info when the persisted-info-id doesn't exist"
        (is (= "Not found."
               (mt/user-http-request :crowberto :get 404 (format "persist/%d" Integer/MAX_VALUE)))))
      (testing "Should get info when the ID exists"
        (is (=? {:active true
                  :card_id (u/the-id model)
                  :id (u/the-id model)
                  :state "persisted"}
                 (mt/user-http-request :crowberto :get 200 (format "persist/%d" (u/the-id pmodel)))))))))

(deftest persisted-info-by-card-id-test
  (with-setup db
    (t2.with-temp/with-temp
      [:model/Card          model     {:database_id (u/the-id db), :dataset true}
       :model/PersistedInfo _         {:database_id (u/the-id db), :card_id (u/the-id model)}]
      (testing "Should require a non-negative card-id"
        (is (= "API endpoint does not exist."
               (mt/user-http-request :crowberto :get 404 (format "persist/card/%d" -1)))))
      (testing "Should not get info when the card-id doesn't exist"
        (is (= "Not found."
               (mt/user-http-request :crowberto :get 404 (format "persist/card/%d" (+ 1 (u/the-id model)))))))
      (testing "Should get info when the ID exists"
        (is (partial= {:active true
                       :card_id (u/the-id model)
                       :id (u/the-id model)
                       :state "persisted"}
                      (mt/user-http-request :crowberto :get 200 (format "persist/card/%d" (u/the-id model)))))))))
