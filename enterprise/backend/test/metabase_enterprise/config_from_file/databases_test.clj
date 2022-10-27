(ns metabase-enterprise.config-from-file.databases-test
  (:require
   [clojure.test :refer :all]
   [flatland.ordered.map :as ordered-map]
   [metabase-enterprise.config-from-file.core :as config-from-file]
   [metabase.db.connection :as mdb.connection]
   [metabase.models :refer [Database Table]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan.db :as db]))

(def ^:private test-db-name (u/qualified-name ::test-db))

(deftest init-from-config-file-test
  (mt/with-temporary-setting-values [config-from-file-sync-databases true]
    (let [db-type     (mdb.connection/db-type)
          original-db (mt/with-driver db-type (mt/db))]
      (try
        (binding [config-from-file/*supported-versions* {:min 1, :max 1}
                  config-from-file/*config*             {:version 1
                                                         :config  {:databases [{:name    test-db-name
                                                                                :engine  (name db-type)
                                                                                :details (:details original-db)}]}}]
          (testing "Create a Database if it does not already exist"
            (is (= :ok
                   (config-from-file/initialize!)))
            (let [db (db/select-one Database :name test-db-name)]
              (is (partial= {:engine db-type}
                            db))
              (is (= 1
                     (db/count Database :name test-db-name)))
              (testing "do not duplicate if Database already exists"
                (is (= :ok
                       (config-from-file/initialize!)))
                (is (= 1
                       (db/count Database :name test-db-name)))
                (is (partial= {:engine db-type}
                              (db/select-one Database :name test-db-name))))
              (testing "Database should have been synced"
                (is (= (db/count Table :db_id (u/the-id original-db))
                       (db/count Table :db_id (u/the-id db))))))))
        (finally
          (db/delete! Database :name test-db-name))))))

(deftest ^:parallel init-from-config-file-connection-validation-test
  (testing "Validate connection details when creating a Database from a config file, and error if they are invalid"
    (binding [config-from-file/*supported-versions* {:min 1, :max 1}
              config-from-file/*config*             {:version 1
                                                     :config  {:databases [{:name    (str test-db-name "-in-memory")
                                                                            :engine  "h2"
                                                                            :details {:db "mem:some-in-memory-db"}}]}}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Database cannot be found\."
           (config-from-file/initialize!))))))

(deftest disable-sync-test
  (testing "We should be able to disable sync for new Databases by specifying a Setting in the config file"
    ;; make sure we're actually testing something if it was already set to false locally.
    (mt/with-temporary-setting-values [config-from-file-sync-databases true]
      (try
        (binding [config-from-file/*supported-versions* {:min 1, :max 1}
                  config-from-file/*config*             {:version 1
                                                         :config
                                                         ;; `settings:` HAS to come before `databases:`, otherwise the
                                                         ;; flag won't be set when database sync stuff happens.
                                                         ;;
                                                         ;; Using a [[flatland.ordered.map]] here really isn't necessary
                                                         ;; since this map only has two keys and will be created as an
                                                         ;; `ArrayMap`, preserving the originally specified order... but
                                                         ;; using [[ordered-map]] explicitly here makes this constraint
                                                         ;; clearer I think. Also the YAML library reads stuff in as an
                                                         ;; ordered map so this more closely matches the behavior when
                                                         ;; using a file
                                                         (ordered-map/ordered-map
                                                          :settings  {:config-from-file-sync-databases false}
                                                          :databases [{:name    test-db-name
                                                                       :engine  "h2"
                                                                       :details (:details (mt/db))}])}]
          (testing "Create a Database since it does not already exist"
            (is (= :ok
                   (config-from-file/initialize!)))
            (let [db (db/select-one Database :name test-db-name)]
              (is (partial= {:engine :h2}
                            db))
              (is (= 1
                     (db/count Database :name test-db-name)))
              (testing "Database should NOT have been synced"
                (is (zero? (db/count Table :db_id (u/the-id db))))))))
        (finally
          (db/delete! Database :name test-db-name))))))
