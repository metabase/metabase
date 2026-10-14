(ns metabase.actions.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.util :as driver.u]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- extract-disabled-reasons*
  "Extract disabled reasons from enabled-for-db? call. If no reasons, rethrow the exception."
  [enabled-for-db? db]
  (try
    (when-not (enabled-for-db? db)
      [:no-explicit-reason])
    (catch Exception e
      (or (some->> (:setting/disabled-reasons (ex-data e)) (map :key))
          (throw e)))))

;; validate-settable-for-db! only validates and throws despite the bang; nothing is mutated
#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defn- can-configure-data-editing-for-db? [db]
  (try
    (let [driver-support? (fn [db feature] (driver.u/supports? (driver.u/database->driver db) feature db))]
      (setting/validate-settable-for-db! :database-enable-table-editing db driver-support?))
    true
    (catch Exception _
      false)))

(deftest database-enable-table-editing-enabled-for-db?-test
  (testing "enabled-for-db? returns appropriate disabled reasons"
    (mt/with-premium-features #{:table-data-editing}
      (let [enabled-for-db?  (:enabled-for-db? (#'setting/resolve-setting :database-enable-table-editing))
            disabled-reasons (partial extract-disabled-reasons* enabled-for-db?)]
        (testing "returns database routing reason for destination databases"
          (mt/with-temp [:model/Database router-db {:initial_sync_status "complete"}
                         :model/Database target-db {:initial_sync_status "complete", :router_database_id (:id router-db)}
                         :model/Table    _         {:db_id (:id router-db) :is_writable true}]
            ;; Give the destination a writable table so routing is its only disabled reason (not
            ;; `no-writable-tables`). A destination can't have tables in production, so a normal
            ;; `with-temp :model/Table` trips the destination-permission guard — insert it directly.
            (t2/insert-returning-pk! (t2/table-name :model/Table)
                                     {:db_id       (:id target-db)
                                      :name        "destination-table"
                                      :is_writable true
                                      :active      true
                                      :created_at  :%now
                                      :updated_at  :%now})
            (is (= [:setting/database-routing]
                   (disabled-reasons router-db)))
            (is (= [:setting/database-routing]
                   (disabled-reasons target-db)))
            (is (false? (can-configure-data-editing-for-db? router-db)))
            (is (false? (can-configure-data-editing-for-db? target-db)))))
        (testing "returns sync in progress reason when sync is incomplete"
          (mt/with-temp [:model/Database db {:initial_sync_status "incomplete"}]
            (is (= [:database-metadata/sync-in-progress] (disabled-reasons db)))
            (is (can-configure-data-editing-for-db? db))))
        (testing "succeeds when database has writable tables"
          (mt/with-temp [:model/Database db {:initial_sync_status "complete"}
                         :model/Table _table {:db_id (:id db) :is_writable true}]
            (is (= nil (disabled-reasons db)))
            (is (can-configure-data-editing-for-db? db))))
        (testing "returns missing permissions reason when tables have unknown write-ability"
          (mt/with-temp [:model/Database db {:initial_sync_status "complete"}
                         :model/Table _table {:db_id (:id db) :is_writable nil}]
            (is (= [:database-metadata/not-populated] (disabled-reasons db)))
            (is (can-configure-data-editing-for-db? db))))
        (testing "returns no writable tables reason when all tables are not writable"
          (mt/with-temp [:model/Database db {:initial_sync_status "complete"}
                         :model/Table _table {:db_id (:id db) :is_writable false}]
            (is (= [:permissions/no-writable-table] (disabled-reasons db)))
            (is (false? (can-configure-data-editing-for-db? db)))))
        (testing "returns no writable tables reason when database has no tables"
          (mt/with-temp [:model/Database db {:initial_sync_status "complete"}]
            (is (= [:permissions/no-writable-table] (disabled-reasons db)))
            (is (false? (can-configure-data-editing-for-db? db)))))))))

(defn- enable-actions!
  [expected-status db-id]
  (mt/user-http-request :crowberto :put expected-status (str "database/" db-id)
                        {:settings {:database-enable-actions true}}))

(defn- actions-enabled-in-app-db? [db-id]
  (boolean (:database-enable-actions (t2/select-one-fn :settings :model/Database db-id))))

(deftest database-enable-actions-refused-with-database-routing-test
  (testing "PUT /api/database/:id refuses to enable actions on a database involved in routing"
    (testing "on a router database"
      (mt/with-temp [:model/Database      {db-id :id} {:engine :h2}
                     :model/DatabaseRouter _          {:database_id db-id :user_attribute "db_name"}]
        (is (re-find #"is not enabled for this database" (enable-actions! 400 db-id)))
        (is (false? (actions-enabled-in-app-db? db-id)))))
    (testing "on a router database that has destinations"
      (mt/with-temp [:model/Database      {db-id :id} {:engine :h2}
                     :model/DatabaseRouter _          {:database_id db-id :user_attribute "db_name"}
                     :model/Database      _           {:engine :h2 :router_database_id db-id}]
        (is (re-find #"is not enabled for this database" (enable-actions! 400 db-id)))
        (is (false? (actions-enabled-in-app-db? db-id)))))
    (testing "on a destination database of a router"
      (mt/with-temp [:model/Database      {router-db-id :id} {:engine :h2}
                     :model/DatabaseRouter _                 {:database_id router-db-id :user_attribute "db_name"}
                     :model/Database      {dest-db-id :id}   {:engine :h2 :router_database_id router-db-id}]
        (is (re-find #"is not enabled for this database" (enable-actions! 400 dest-db-id)))
        (is (false? (actions-enabled-in-app-db? dest-db-id)))))
    (testing "but a database with no routing is left alone"
      (mt/with-temp [:model/Database {db-id :id} {:engine :h2}]
        (is (true? (get-in (enable-actions! 200 db-id) [:settings :database-enable-actions])))))))

(defn- actions-disabled-reasons
  [db-id]
  (get-in (mt/user-http-request :crowberto :get 200 (str "database/" db-id "/settings-available"))
          [:settings :database-enable-actions]))

(deftest database-enable-actions-reports-routing-as-a-disabled-reason-test
  (testing "GET /api/database/:id/settings-available names database routing, and says why"
    (let [refused {:enabled false
                   :reasons [{:key     "setting/database-routing"
                              :type    "error"
                              :message "Actions are not supported with database routing."}]}]
      (testing "on a router database"
        (mt/with-temp [:model/Database      {db-id :id} {:engine :h2}
                       :model/DatabaseRouter _          {:database_id db-id :user_attribute "db_name"}]
          (is (=? refused (actions-disabled-reasons db-id)))))
      (testing "on a router database that has destinations"
        (mt/with-temp [:model/Database      {db-id :id} {:engine :h2}
                       :model/DatabaseRouter _          {:database_id db-id :user_attribute "db_name"}
                       :model/Database      _           {:engine :h2 :router_database_id db-id}]
          (is (=? refused (actions-disabled-reasons db-id))))))))
