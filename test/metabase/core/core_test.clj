(ns metabase.core.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.core.core :as core]
   [metabase.sample-data.impl :as sample-data.impl]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest reconcile-sample-database-migrates-stale-engine-test
  (testing "A sample database left on the previous bundled engine is migrated at startup. The step keys off the
           presence of the sample database rather than off `has-user-setup`, which reports a new install on
           every boot of an instance with no users and so would strand a stale engine forever."
    (mt/with-model-cleanup [:model/Database]
      (let [h2-db (t2/insert-returning-instance! :model/Database
                                                 {:name "Sample Database" :engine :h2 :is_sample true
                                                  :details (#'sample-data.impl/try-to-extract-sample-database! :h2)})]
        (sync/sync-database! h2-db)
        (let [before-tables (t2/select-fn-set :id :model/Table :db_id (:id h2-db))]
          (#'core/reconcile-sample-database!)
          (let [after (t2/select-one :model/Database :id (:id h2-db))]
            (testing "the record is migrated to the bundled engine, details and all"
              (is (= :sqlite (:engine after)))
              (is (= (#'sample-data.impl/try-to-extract-sample-database! :sqlite) (:details after))))
            (testing "the existing database is reused rather than a second one added"
              (is (= 1 (t2/count :model/Database :is_sample true)))
              (is (= before-tables (t2/select-fn-set :id :model/Table :db_id (:id h2-db)))))))))))

(deftest reconcile-sample-database-is-quiet-when-current-test
  (testing "Reconciling a sample database that already matches the bundled one logs no error. Routing this
           case through `extract-and-sync-sample-database!` instead used to derive the database from an
           update that returns no primary keys when nothing changed, failing with `Not something with an
           ID: nil` on every boot."
    (mt/with-model-cleanup [:model/Database]
      (let [db       (t2/insert-returning-instance! :model/Database
                                                    {:name "Sample Database" :engine :sqlite :is_sample true
                                                     :details (#'sample-data.impl/try-to-extract-sample-database! :sqlite)})
            _        (sync/sync-database! db)
            messages (mt/with-log-messages-for-level [messages [metabase.sample-data.impl :error]]
                       (#'core/reconcile-sample-database!)
                       (messages))]
        (is (= [] (mapv :message messages)))
        (is (= 1 (t2/count :model/Database :is_sample true)))
        (is (= :sqlite (:engine (t2/select-one :model/Database :id (:id db)))))))))

(deftest reconcile-sample-database-adds-missing-database-test
  (testing "With no sample database present the bundled one is added, so fresh installs still get it"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db! :create-sample-content? false)
      (with-redefs [config/load-sample-content? (constantly true)]
        (#'core/reconcile-sample-database!))
      (let [sample-db (t2/select-one :model/Database :is_sample true)]
        (is (some? sample-db))
        (is (= :sqlite (:engine sample-db)))))))
