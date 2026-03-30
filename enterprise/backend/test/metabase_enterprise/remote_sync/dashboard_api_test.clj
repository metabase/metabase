(ns metabase-enterprise.remote-sync.dashboard-api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :each (fn [f]
                      (mt/with-temporary-setting-values [remote-sync-type :read-write]
                        (f))))

(deftest api-update-dashboard-collection-id-remote-synced-dependency-checking-success-test
  (testing "PUT /api/dashboard/:id with collection_id in remote-synced succeeds when all dependencies are in remote-synced"
    (mt/with-temp [:model/Collection {remote-synced-id :id} {:name "Remote-Synced" :location "/" :is_remote_synced true}
                   :model/Collection {target-id :id} {:name "Target" :location (format "/%d/" remote-synced-id) :is_remote_synced true}
                   :model/Collection {source-id :id} {:name "Source" :location "/" :type nil}
                   :model/Dashboard {dash-id :id} {:name "Dashboard to Move"
                                                   :collection_id source-id}
                   :model/Card {remote-synced-card-id :id} {:name "Remote-Synced Card"
                                                            :collection_id remote-synced-id
                                                            :dataset_query (mt/native-query {:query "SELECT 1"})}
                   :model/Card {dependent-card-id :id} {:name "Dependent Card"
                                                        :collection_id remote-synced-id
                                                        :dataset_query (mt/mbql-query nil {:source-table (str "card__" remote-synced-card-id)})}
                   :model/DashboardCard _ {:dashboard_id dash-id
                                           :card_id dependent-card-id}]
      ;; This should succeed because the dependency (remote-synced-card) is in a remote-synced collection
      (let [response (mt/user-http-request :crowberto :put 200 (str "dashboard/" dash-id)
                                           {:collection_id target-id})]
        ;; Verify the dashboard was moved
        (is (= target-id (:collection_id response))
            "Dashboard should be moved to remote-synced collection")))))

(deftest api-update-dashboard-collection-id-remote-synced-dependency-checking-failure-test
  (testing "PUT /api/dashboard/:id with collection_id in remote-synced throws 400 when dependencies exist outside remote-synced"
    (mt/with-temp [:model/Collection {non-remote-synced-id :id} {:name "Non-Remote-Synced" :location "/" :type nil}
                   :model/Collection {remote-synced-id :id} {:name "Remote-Synced" :location "/" :is_remote_synced true}
                   :model/Collection {target-id :id} {:name "Target" :location (format "/%d/" remote-synced-id) :is_remote_synced true}
                   :model/Collection {source-id :id} {:name "Source" :location "/" :type nil}
                   :model/Dashboard {dash-id :id} {:name "Dashboard to Move"
                                                   :collection_id source-id}
                   :model/Card {non-remote-synced-card-id :id} {:name "Non-Remote-Synced Card"
                                                                :collection_id non-remote-synced-id
                                                                :dataset_query (mt/native-query {:query "SELECT 1"})}
                   :model/Card {dependent-card-id :id} {:name "Dependent Card"
                                                        :collection_id source-id
                                                        :dataset_query (mt/mbql-query nil {:source-table (str "card__" non-remote-synced-card-id)})}
                   :model/DashboardCard _ {:dashboard_id dash-id
                                           :card_id dependent-card-id}]
      ;; This should return 400 because the dependency (non-remote-synced-card) is not in a remote-synced collection
      (let [response (mt/user-http-request :crowberto :put 400 (str "dashboard/" dash-id)
                                           {:collection_id target-id})]
        ;; Verify error response contains dependency information
        (is (str/includes? (:message response) "content that is not remote synced")
            "Error message should mention content that is not remote synced"))

      ;; Verify the transaction was rolled back - dashboard should not be moved
      (let [unchanged-dash (t2/select-one :model/Dashboard :id dash-id)]
        (is (= source-id (:collection_id unchanged-dash))
            "Dashboard collection_id should remain unchanged after failed move")))))

(deftest api-update-dashboard-collection-id-remote-synced-dependency-checking-transaction-rollback-test
  (testing "PUT /api/dashboard/:id transaction rollback when dependency check fails"
    (mt/with-temp [:model/Collection {non-remote-synced-id :id} {:name "Non-Remote-Synced" :location "/" :type nil}
                   :model/Collection {remote-synced-id :id} {:name "Remote-Synced" :location "/" :is_remote_synced true}
                   :model/Collection {target-id :id} {:name "Target" :location (format "/%d/" remote-synced-id) :is_remote_synced true}
                   :model/Collection {source-id :id} {:name "Source" :location "/" :type nil}
                   :model/Dashboard {dash-id :id} {:name "Dashboard to Move"
                                                   :collection_id source-id}
                   :model/Card {non-remote-synced-card-id :id} {:name "Non-Remote-Synced Card"
                                                                :collection_id non-remote-synced-id
                                                                :dataset_query (mt/native-query {:query "SELECT 1"})}
                   :model/Card {dependent-card-id :id} {:name "Dependent Card"
                                                        :collection_id source-id
                                                        :dataset_query (mt/mbql-query nil {:source-table (str "card__" non-remote-synced-card-id)})}
                   :model/DashboardCard _ {:dashboard_id dash-id
                                           :card_id dependent-card-id}]
      ;; This should return 400 with transaction rollback
      (mt/user-http-request :crowberto :put 400 (str "dashboard/" dash-id)
                            {:collection_id target-id})

      ;; Verify the transaction was completely rolled back
      (let [unchanged-dash (t2/select-one :model/Dashboard :id dash-id)]
        (is (= source-id (:collection_id unchanged-dash))
            "Dashboard collection_id should remain unchanged after transaction rollback")))))

(deftest api-update-dashboard-outside-remote-synced-no-dependency-checking-test
  (testing "PUT /api/dashboard/:id to non-remote-synced collection does not check dependencies"
    (mt/with-temp [:model/Collection {non-remote-synced-id :id} {:name "Non-Remote-Synced" :location "/" :type nil}
                   :model/Collection {target-id :id} {:name "Target" :location "/" :type nil}
                   :model/Collection {source-id :id} {:name "Source" :location "/" :type nil}
                   :model/Dashboard {dash-id :id} {:name "Dashboard to Move"
                                                   :collection_id source-id}
                   :model/Card {non-remote-synced-card-id :id} {:name "Non-Remote-Synced Card"
                                                                :collection_id non-remote-synced-id
                                                                :dataset_query (mt/native-query {:query "SELECT 1"})}
                   :model/Card {dependent-card-id :id} {:name "Dependent Card"
                                                        :collection_id source-id
                                                        :dataset_query (mt/mbql-query nil {:source-table (str "card__" non-remote-synced-card-id)})}
                   :model/DashboardCard _ {:dashboard_id dash-id
                                           :card_id dependent-card-id}]
      ;; This should succeed because we're not moving into a remote-synced collection
      (let [response (mt/user-http-request :crowberto :put 200 (str "dashboard/" dash-id)
                                           {:collection_id target-id})]
        ;; Verify the dashboard was moved
        (is (= target-id (:collection_id response))
            "Dashboard should be moved to new collection")))))

(deftest api-copy-dashboard-into-remote-synced-dependency-checking-success-test
  (testing "POST /api/dashboard/:id/copy into remote-synced succeeds when all dependencies are in remote-synced"
    (mt/with-temp [:model/Collection {remote-synced-id :id} {:name "Remote-Synced" :location "/" :is_remote_synced true}
                   :model/Collection {target-id :id} {:name "Target" :location (format "/%d/" remote-synced-id) :is_remote_synced true}
                   :model/Collection {source-id :id} {:name "Source" :location "/" :type nil}
                   :model/Dashboard {dash-id :id} {:name "Dashboard to Copy"
                                                   :collection_id source-id}
                   :model/Card {remote-synced-card-id :id} {:name "Remote-Synced Card"
                                                            :collection_id remote-synced-id
                                                            :dataset_query (mt/native-query {:query "SELECT 1"})}
                   :model/Card {dependent-card-id :id} {:name "Dependent Card"
                                                        :collection_id remote-synced-id
                                                        :dataset_query (mt/mbql-query nil {:source-table (str "card__" remote-synced-card-id)})}
                   :model/DashboardCard _ {:dashboard_id dash-id
                                           :card_id dependent-card-id}]
      ;; This should succeed because the dependency (remote-synced-card) is in a remote-synced collection
      (let [response (mt/user-http-request :crowberto :post 200 (format "dashboard/%d/copy" dash-id)
                                           {:collection_id target-id})]
        ;; Verify the copied dashboard is in the remote-synced collection
        (is (= target-id (:collection_id response))
            "Copied dashboard should be in remote-synced collection")
        (is (not= dash-id (:id response))
            "Copied dashboard should have different ID")))))

(deftest api-copy-dashboard-into-remote-synced-dependency-checking-failure-test
  (testing "POST /api/dashboard/:id/copy into remote-synced throws 400 when dependencies exist outside remote-synced"
    (mt/with-temp [:model/Collection {non-remote-synced-id :id} {:name "Non-Remote-Synced" :location "/" :type nil}
                   :model/Collection {remote-synced-id :id} {:name "Remote-Synced" :location "/" :is_remote_synced true}
                   :model/Collection {target-id :id} {:name "Target" :location (format "/%d/" remote-synced-id) :is_remote_synced true}
                   :model/Collection {source-id :id} {:name "Source" :location "/" :type nil}
                   :model/Dashboard {dash-id :id} {:name "Dashboard to Copy"
                                                   :collection_id source-id}
                   :model/Card {non-remote-synced-card-id :id} {:name "Non-Remote-Synced Card"
                                                                :collection_id non-remote-synced-id
                                                                :dataset_query (mt/native-query {:query "SELECT 1"})}
                   :model/Card {dependent-card-id :id} {:name "Dependent Card"
                                                        :collection_id source-id
                                                        :dataset_query (mt/mbql-query nil {:source-table (str "card__" non-remote-synced-card-id)})}
                   :model/DashboardCard _ {:dashboard_id dash-id
                                           :card_id dependent-card-id}]
      ;; This should return 400 because the dependency (non-remote-synced-card) is not in a remote-synced collection
      (let [response (mt/user-http-request :crowberto :post 400 (format "dashboard/%d/copy" dash-id)
                                           {:collection_id target-id})]
        ;; Verify error response contains dependency information
        (is (str/includes? (:message response) "content that is not remote synced")
            "Error message should mention content that is not remote synced"))

      ;; Verify no dashboard was created
      (is (= 1 (t2/count :model/Dashboard :name "Dashboard to Copy"))
          "No new dashboard should be created after failed copy"))))

(deftest api-copy-dashboard-outside-remote-synced-no-dependency-checking-test
  (testing "POST /api/dashboard/:id/copy to non-remote-synced collection does not check dependencies"
    (mt/with-temp [:model/Collection {non-remote-synced-id :id} {:name "Non-Remote-Synced" :location "/" :type nil}
                   :model/Collection {target-id :id} {:name "Target" :location "/" :type nil}
                   :model/Collection {source-id :id} {:name "Source" :location "/" :type nil}
                   :model/Dashboard {dash-id :id} {:name "Dashboard to Copy"
                                                   :collection_id source-id}
                   :model/Card {non-remote-synced-card-id :id} {:name "Non-Remote-Synced Card"
                                                                :collection_id non-remote-synced-id
                                                                :dataset_query (mt/native-query {:query "SELECT 1"})}
                   :model/Card {dependent-card-id :id} {:name "Dependent Card"
                                                        :collection_id source-id
                                                        :dataset_query (mt/mbql-query nil {:source-table (str "card__" non-remote-synced-card-id)})}
                   :model/DashboardCard _ {:dashboard_id dash-id
                                           :card_id dependent-card-id}]
      ;; This should succeed because we're not copying into a remote-synced collection
      (let [response (mt/user-http-request :crowberto :post 200 (format "dashboard/%d/copy" dash-id)
                                           {:collection_id target-id})]
        ;; Verify the copied dashboard is in the target collection
        (is (= target-id (:collection_id response))
            "Copied dashboard should be in target collection")
        (is (not= dash-id (:id response))
            "Copied dashboard should have different ID")))))
