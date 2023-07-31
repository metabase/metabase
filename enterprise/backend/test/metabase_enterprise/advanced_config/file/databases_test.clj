(ns metabase-enterprise.advanced-config.file.databases-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-config.file :as advanced-config.file]
   [metabase.db.connection :as mdb.connection]
   [metabase.models :refer [Database Table]]
   [metabase.public-settings.premium-features-test :as premium-features-test]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :each (fn [thunk]
                      (binding [advanced-config.file/*supported-versions* {:min 1, :max 1}]
                        (premium-features-test/with-premium-features #{:config-text-file}
                          (thunk)))))

(def ^:private test-db-name (u/qualified-name ::test-db))

(deftest init-from-config-file-test
  (mt/with-temporary-setting-values [config-from-file-sync-databases true]
    (let [db-type     (mdb.connection/db-type)
          original-db (mt/with-driver db-type (mt/db))]
      (try
        (binding [advanced-config.file/*config* {:version 1
                                                 :config  {:databases [{:name    test-db-name
                                                                        :engine  (name db-type)
                                                                        :details (:details original-db)}]}}]
          (testing "Create a Database if it does not already exist"
            (is (= :ok
                   (advanced-config.file/initialize!)))
            (let [db (t2/select-one Database :name test-db-name)]
              (is (partial= {:engine db-type}
                            db))
              (is (= 1
                     (t2/count Database :name test-db-name)))
              (testing "do not duplicate if Database already exists"
                (is (= :ok
                       (advanced-config.file/initialize!)))
                (is (= 1
                       (t2/count Database :name test-db-name)))
                (is (partial= {:engine db-type}
                              (t2/select-one Database :name test-db-name))))
              (testing "Database should have been synced"
                (is (= (t2/count Table :db_id (u/the-id original-db))
                       (t2/count Table :db_id (u/the-id db))))))))
        (finally
          (t2/delete! Database :name test-db-name))))))

(deftest init-from-config-file-connection-validation-test
  (testing "Validate connection details when creating a Database from a config file, and error if they are invalid"
    (binding [advanced-config.file/*config* {:version 1
                                             :config  {:databases [{:name    (str test-db-name "-in-memory")
                                                                    :engine  "h2"
                                                                    :details {:db "mem:some-in-memory-db"}}]}}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Database cannot be found\."
           (advanced-config.file/initialize!))))))

(deftest disable-sync-test
  (testing "We should be able to disable sync for new Databases by specifying a Setting in the config file"
    ;; make sure we're actually testing something if it was already set to false locally.
    (mt/with-temporary-setting-values [config-from-file-sync-databases true]
      (try
        (binding [advanced-config.file/*config* {:version 1
                                                 :config  {:settings  {:config-from-file-sync-databases false}
                                                           :databases [{:name    test-db-name
                                                                        :engine  "h2"
                                                                        :details (:details (mt/db))}]}}]
          (testing "Create a Database since it does not already exist"
            (is (= :ok
                   (advanced-config.file/initialize!)))
            (let [db (t2/select-one Database :name test-db-name)]
              (is (partial= {:engine :h2}
                            db))
              (is (= 1
                     (t2/count Database :name test-db-name)))
              (testing "Database should NOT have been synced"
                (is (zero? (t2/count Table :db_id (u/the-id db))))))))
        (finally
          (t2/delete! Database :name test-db-name))))))
