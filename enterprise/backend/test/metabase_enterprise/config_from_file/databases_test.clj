(ns metabase-enterprise.config-from-file.databases-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.config-from-file.core :as config-from-file]
   [metabase.db.connection :as mdb.connection]
   [metabase.models :refer [Database Table]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan.db :as db]))

(deftest init-from-config-file-test
  (let [db-type     (mdb.connection/db-type)
        original-db (mt/with-driver db-type (mt/db))]
    (try
      (binding [config-from-file/*supported-versions* {:min 1, :max 1}
                config-from-file/*config*             {:version 1
                                                       :config  {:databases [{:name    "init-from-config-file-test/test-data"
                                                                              :engine  (name db-type)
                                                                              :details (:details original-db)}]}}]
        (testing "Create a Database if it does not already exist"
          (is (= :ok
                 (config-from-file/initialize!)))
          (let [db (db/select-one Database :name "init-from-config-file-test/test-data")]
            (is (partial= {:engine db-type}
                          db))
            (is (= 1
                   (db/count Database :name "init-from-config-file-test/test-data")))
            (testing "do not duplicate if Database already exists"
              (is (= :ok
                     (config-from-file/initialize!)))
              (is (= 1
                     (db/count Database :name "init-from-config-file-test/test-data")))
              (is (partial= {:engine db-type}
                            (db/select-one Database :name "init-from-config-file-test/test-data"))))
            (testing "Database should have been synced"
              (is (= (db/count Table :db_id (u/the-id original-db))
                     (db/count Table :db_id (u/the-id db))))))))
      (finally
        (db/delete! Database :name "init-from-config-file-test/test-data")))))

(deftest ^:parallel init-from-config-file-connection-validation-test
  (testing "Validate connection details when creating a Database from a config file, and error if they are invalid"
    (binding [config-from-file/*supported-versions* {:min 1, :max 1}
              config-from-file/*config*             {:version 1
                                                     :config  {:databases [{:name    "inist-from-config-file-test/test-data-in-memory"
                                                                            :engine  "h2"
                                                                            :details {:db "mem:some-in-memory-db"}}]}}]
      (testing "Create a Database if it does not already exist"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Database cannot be found\."
             (config-from-file/initialize!)))))))
