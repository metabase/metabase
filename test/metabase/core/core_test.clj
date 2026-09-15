(ns metabase.core.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.core.core :as core]
   [metabase.sample-data.impl :as sample-data.impl]
   [metabase.settings.core :as setting]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
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
      (mt/with-dynamic-fn-redefs [config/load-sample-content? (constantly true)]
        (#'core/reconcile-sample-database!))
      (let [sample-db (t2/select-one :model/Database :is_sample true)]
        (is (some? sample-db))
        (is (= :sqlite (:engine sample-db)))))))

(deftest validate-network-policy-settings-stops-startup-test
  (testing "an *-allowed-networks variable that does not name a policy stops startup: nothing else validates what
           is in the environment, and serving on a policy nobody chose is not an option"
    (mt/with-temp-env-var-value! [mb-warehouse-allowed-networks "allow-everything"]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Invalid MB_WAREHOUSE_ALLOWED_NETWORKS"
                            (#'core/validate-env-vars)))))
  (testing "the Settings to check are read off the registry by name, so a new *-allowed-networks Setting is covered
           the day it is defined rather than the day somebody remembers to list it"
    (is (every? (set (#'core/network-policy-settings))
                [:warehouse-allowed-networks
                 :http-channel-allowed-networks
                 :map-tile-server-allowed-networks
                 :oidc-allowed-networks
                 :llm-allowed-networks]))
    (doseq [setting-name (#'core/network-policy-settings)]
      (testing setting-name
        (tu/do-with-temp-env-var-value!
         (setting/setting-env-map-name setting-name)
         "allow-everything"
         (fn []
           (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                 #"Invalid MB_"
                                 (#'core/validate-env-vars))))))))
  (testing "valid values, and nothing set at all, pass"
    (mt/with-temp-env-var-value! [mb-warehouse-allowed-networks "allow-private"]
      (is (nil? (#'core/validate-env-vars))))
    (is (nil? (#'core/validate-env-vars)))))
