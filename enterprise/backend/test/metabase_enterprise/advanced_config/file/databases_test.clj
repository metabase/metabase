(ns metabase-enterprise.advanced-config.file.databases-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-config.file :as advanced-config.file]
   [metabase-enterprise.advanced-config.file.databases :as advanced-config.file.databases]
   [metabase.app-db.core :as mdb]
   [metabase.driver.settings :as driver.settings]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(use-fixtures :each (fn [thunk]
                      (binding [advanced-config.file/*supported-versions* {:min 1, :max 1}
                                driver.settings/*allow-testing-h2-connections* true]
                        (mt/with-premium-features #{:config-text-file}
                          (thunk)))))

(def ^:private test-db-name (u/qualified-name ::test-db))

(deftest init-from-config-file-test
  (mt/with-temporary-setting-values [config-from-file-sync-databases true]
    (let [db-type     (mdb/db-type)
          original-db (mt/with-driver db-type (mt/db))
          config      {:version 1
                       :config  {:databases [{:name    test-db-name
                                              :engine  (name db-type)
                                              :details (:details original-db)}]}}]
      (try
        (binding [advanced-config.file/*config* config]
          (testing "Create a Database if it does not already exist"
            (is (= :ok
                   (advanced-config.file/initialize!)))
            (let [db (t2/select-one :model/Database :name test-db-name)]
              (is (partial= {:engine db-type}
                            db))
              (is (= 1
                     (t2/count :model/Database :name test-db-name)))
              (testing "do not duplicate if Database already exists"
                (is (= :ok
                       (advanced-config.file/initialize!)))
                (is (= 1
                       (t2/count :model/Database :name test-db-name)))
                (is (partial= {:engine db-type}
                              (t2/select-one :model/Database :name test-db-name))))
              (testing "updates db"
                (is (= :ok
                       (binding [advanced-config.file/*config*
                                 (assoc-in config [:config :databases 0 :description] "foo")]
                         (advanced-config.file/initialize!))))
                (is (partial= {:description "foo"}
                              (t2/select-one :model/Database :name test-db-name))))
              (testing "does not re-set attached dwh db keys on update"
                (is (= :ok
                       (binding [advanced-config.file/*config*
                                 (update-in config [:config :databases 0] merge
                                            {:is_attached_dwh      true
                                             :uploads_enabled      true
                                             :uploads_schema_name  "db_123"
                                             :uploads_table_prefix "upload_"})]
                         (advanced-config.file/initialize!))))
                (is (partial= {:is_attached_dwh      true
                               :uploads_enabled      false
                               :uploads_schema_name  nil
                               :uploads_table_prefix nil}
                              (t2/select-one :model/Database :name test-db-name)))))))
        (finally
          (t2/delete! :model/Database :name test-db-name))))))

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

(deftest sync-test
  (testing "`init-from-config-file!` returns syncs database in a separate thread by default"
    ;; unset setting to test default behavior
    (mt/with-temporary-setting-values [config-from-file-sync-databases nil]
      (try
        (let [sync-future (@#'advanced-config.file.databases/init-from-config-file! {:name    test-db-name
                                                                                     :engine  "h2"
                                                                                     :details (:details (mt/db))})]
          (is (future? sync-future))
          (deref sync-future 5000 :timeout)
          (is (= 1 (t2/count :model/Database :name test-db-name))))
        (finally
          (t2/delete! :model/Database :name test-db-name))))))

(defn- test-cruft-tables! [crufted-table-setting freq message]
  (mt/with-temporary-setting-values [config-from-file-sync-databases nil]
    (try
      (let [sync-future (@#'advanced-config.file.databases/init-from-config-file!
                         {:name    test-db-name
                          :engine  "h2"
                          :details (:details (mt/db))
                          :settings {:auto-cruft-tables crufted-table-setting}})]
        (is (future? sync-future))
        ;; wait for the sync to finish or crash out after 5 seconds
        (deref sync-future 5000 :timeout)
        (is (= 1 (t2/count :model/Database :name test-db-name)))
        (let [db (t2/select-one :model/Database :name test-db-name)
              vis-types (t2/select-fn-vec :visibility_type :model/Table :db_id (u/the-id db))]
          (is (= freq (frequencies vis-types))
              message)))
      (finally
        (t2/delete! :model/Database :name test-db-name)))))

(deftest sync-cruft-tables-test
  (testing "tables marked crufty should be marked as such in the database"
    (test-cruft-tables! []           {nil 8}          "No tables marked crufty")
    (test-cruft-tables! ["^venues$"] {:cruft 1 nil 7} "VENUES table is marked crufty")
    (test-cruft-tables! ["."]        {:cruft 8}       "All tables marked crufty")))

(deftest cruft-hidden-tables-test
  (mt/with-temporary-setting-values [config-from-file-sync-databases nil]
    (try
      (let [sync-future (@#'advanced-config.file.databases/init-from-config-file!
                         {:name    test-db-name
                          :engine  "h2"
                          :details (:details (mt/db))})]
        (is (future? sync-future))
        ;; wait for the sync to finish or crash out after 5 seconds
        (deref sync-future 5000 :timeout)
        (is (= 1 (t2/count :model/Database :name test-db-name)))
        (let [db (t2/select-one :model/Database :name test-db-name)
              _hide_tables-> (t2/update! :model/Table :db_id (u/the-id db) {:visibility_type :hidden})
              vis-types (t2/select-fn-vec :visibility_type :model/Table :db_id (u/the-id db))]
          ;; Now, all the tables are hidden, so do another sync with empty auto-cruft-tables setting
          ;; and make sure they are still hidden:
          (is (= {:hidden 8} (frequencies vis-types)))
          (sync-metadata/sync-db-metadata! db)
          (testing "Hidden tables stay hidden"
            (let [vis-types (t2/select-fn-vec :visibility_type :model/Table :db_id (u/the-id db))]
              (is (= {:hidden 8} (frequencies vis-types)))))))
      (finally
        (t2/delete! :model/Database :name test-db-name)))))

(defn- test-cruft-columns! [crufted-field-setting freq message]
  (mt/with-temporary-setting-values [config-from-file-sync-databases nil]
    (try
      (let [sync-future (@#'advanced-config.file.databases/init-from-config-file!
                         {:name    test-db-name
                          :engine  "h2"
                          :details (:details (mt/db))
                          :settings {:auto-cruft-columns crufted-field-setting}})]
        (is (future? sync-future))
         ;; wait for the sync to finish or crash out after 5 seconds
        (deref sync-future 5000 :timeout)
        (sync-metadata/sync-db-metadata! (t2/select-one :model/Database :name test-db-name))
        (is (= 1 (t2/count :model/Database :name test-db-name)))
        (let [db (t2/select-one :model/Database :name test-db-name)
              tables (t2/select :model/Table :db_id (u/the-id db))
              fields (t2/select :model/Field :table_id [:in (map :id tables)])]
          (is (= freq (frequencies (map :visibility_type fields)))
              message)))
      (finally
        (t2/delete! :model/Database :name test-db-name)))))

(deftest sync-cruft-columns-test
  (testing "columns (aka fields) marked crufty should be marked as such in the database"
    (test-cruft-columns! [] {:normal 52} "No fields marked crufty")
    (test-cruft-columns! ["id"] {:normal 38, :details-only 14}  "All id fields marked crufty")))

(deftest disable-sync-test
  (testing "We should be able to disable sync for new Databases by specifying a Setting in the config file"
    ;; make sure we're actually testing something if it was already set to false locally.
    (mt/with-temporary-setting-values [config-from-file-sync-databases true]
      (try
        (binding [advanced-config.file/*config* {:version 1
                                                 :config {:settings {:config-from-file-sync-databases false}}}]
          (is (= :ok (advanced-config.file/initialize!)))
          (let [sync-future (@#'advanced-config.file.databases/init-from-config-file! {:name    test-db-name
                                                                                       :engine  "h2"
                                                                                       :details (:details (mt/db))})]
            (is nil? sync-future)
            (let [db (t2/select-one :model/Database :name test-db-name)]
              (is (partial= {:engine :h2}
                            db))
              (is (= 1 (t2/count :model/Database :name test-db-name)))
              (testing "Database should NOT have been synced"
                (is (zero? (t2/count :model/Table :db_id (u/the-id db))))))))
        (finally
          (t2/delete! :model/Database :name test-db-name))))))

(deftest delete-test
  (testing "We should be able to delete Databases from the config file if we pass the confirmation string"
    (mt/with-temp [:model/Database _ {:name   test-db-name
                                      :engine "h2"}]
      (try
        (binding [advanced-config.file/*config* {:version 1
                                                 :config  {:settings  {:config-from-file-sync-databases false}
                                                           :databases [{:name    test-db-name
                                                                        :engine  "h2"
                                                                        :details {}
                                                                        :delete  (format "DELETE_WITH_DEPENDENTS:%s" test-db-name)}]}}]
          (is (= :ok
                 (advanced-config.file/initialize!)))
          (is (not (t2/exists? :model/Database :name test-db-name))))
        (finally
          (t2/delete! :model/Database :name test-db-name)))))
  (testing "We should not delete Databases from the config file if the confirmation string mismatches"
    (mt/with-temp [:model/Database _ {:name   test-db-name
                                      :engine "h2"}]
      (try
        (binding [advanced-config.file/*config* {:version 1
                                                 :config  {:settings  {:config-from-file-sync-databases false}
                                                           :databases [{:name    test-db-name
                                                                        :engine  "h2"
                                                                        :details {}
                                                                        :delete  "DELETE_WITH_DEPENDENTS:copy-paste-mistake"}]}}]
          (is (thrown-with-msg?
               ExceptionInfo
               (re-pattern (format "To delete database \"%s\" set `delete` to \"DELETE_WITH_DEPENDENTS:%s\"" test-db-name test-db-name))
               (advanced-config.file/initialize!)))
          (is (t2/exists? :model/Database :name test-db-name)))
        (finally
          (t2/delete! :model/Database :name test-db-name))))))
