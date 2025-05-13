(ns metabase-enterprise.data-editing.scope-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-editing.scope :as scope]
   [metabase-enterprise.data-editing.test-util :as data-editing.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest scope-type-test
  (testing "scope-type correctly classifies scope based on available keys"
    (are [scope expected] (= expected (scope/scope-type scope))
      {:dashcard-id 1, :dashboard-id 2, :collection-id 3, :card-id 4, :table-id 5, :database-id 6}  :dashcard
      {:dashboard-id 1, :collection-id 2}                                                           :dashboard
      {:card-id 1, :table-id 2, :database-id 3}                                                     :card
      {:table-id 1, :database-id 4}                                                                 :table
      {:webhook-id 1, :table-id 2}                                                                  :webhook)))

(deftest hydrate-scope-test
  (mt/with-premium-features #{:table-data-editing}
    (data-editing.tu/with-temp-test-db!
      (with-open [table-ref (data-editing.tu/open-test-table!)]
        (let [db-id      (mt/id)
              table-id   @table-ref
             ;; It's not a model, so we need to manually insert (and delete) the webhook.
              webhook-id (t2/insert-returning-pk! :table_webhook_token {:token      "test-token"
                                                                        :table_id   table-id,
                                                                        :creator_id (mt/user->id :rasta)})]
          (try
            (mt/with-temp [:model/Collection   {collection-id :id}   {:name "Test Collection"}
                           :model/Card         {mbql-card-id :id}    {:dataset_query {:database db-id
                                                                                      :type     :query
                                                                                      :query    {:source-table table-id}}
                                                                      :name          "Test MBQL Card"
                                                                      :collection_id collection-id}
                           :model/Dashboard     {dashboard-id :id}   {:name          "Test Dashboard"
                                                                      :collection_id collection-id}
                           :model/Card          {native-card-id :id} {:dataset_query {:database db-id
                                                                                      :type     :native
                                                                                      :native   {:query "SELECT * FROM venues"}}
                                                                      :name          "Test Native Card"
                                                                      :dashboard_id  dashboard-id}
                           :model/DashboardCard {dashcard-id-1 :id}  {:dashboard_id dashboard-id
                                                                      :card_id      mbql-card-id
                                                                      :row          0
                                                                      :col          0
                                                                      :size_x       4
                                                                      :size_y       4}
                           :model/DashboardCard {dashcard-id-2 :id}  {:dashboard_id dashboard-id
                                                                      :card_id      native-card-id
                                                                      :row          0
                                                                      :col          4
                                                                      :size_x       4
                                                                      :size_y       4}]
              (testing "hydrate-scope for dashcard with MBQL card"
                (let [scope    {:dashcard-id dashcard-id-1}
                      hydrated (scope/hydrate scope)]
                  (is (= #{:dashcard-id :dashboard-id :collection-id :card-id :table-id :database-id}
                         (set (keys hydrated))))
                  (is (= dashcard-id-1 (:dashcard-id hydrated)))
                  (is (= dashboard-id (:dashboard-id hydrated)))
                  (is (= collection-id (:collection-id hydrated)))
                  (is (= mbql-card-id (:card-id hydrated)))
                  (is (= table-id (:table-id hydrated)))
                  (is (= db-id (:database-id hydrated)))))

              (testing "hydrate-scope for dashcard with native card"
                (let [scope    {:dashcard-id dashcard-id-2}
                      hydrated (scope/hydrate scope)]
                  (is (= #{:dashcard-id :dashboard-id :collection-id :card-id}
                         (set (keys hydrated))))
                  (is (= dashcard-id-2 (:dashcard-id hydrated)))
                  (is (= dashboard-id (:dashboard-id hydrated)))
                  (is (= collection-id (:collection-id hydrated)))
                  (is (= native-card-id (:card-id hydrated)))
                  (is (nil? (:table-id hydrated)))))

              (testing "hydrate-scope for dashboard"
                (let [scope    {:dashboard-id dashboard-id}
                      hydrated (scope/hydrate scope)]
                  (is (= #{:dashboard-id :collection-id}
                         (set (keys hydrated))))
                  (is (= dashboard-id (:dashboard-id hydrated)))
                  (is (= collection-id (:collection-id hydrated)))))

              (testing "hydrate-scope for MBQL card"
                (let [scope    {:card-id mbql-card-id}
                      hydrated (scope/hydrate scope)]
                  (is (= #{:card-id :collection-id :table-id :database-id}
                         (set (keys hydrated))))
                  (is (= mbql-card-id (:card-id hydrated)))
                  (is (= collection-id (:collection-id hydrated)))
                  (is (= table-id (:table-id hydrated)))
                  (is (= db-id (:database-id hydrated)))))

              (testing "hydrate-scope for native card"
                (let [scope    {:card-id native-card-id}
                      hydrated (scope/hydrate scope)]
                  (is (= #{:card-id :collection-id}
                         (set (keys hydrated))))
                  (is (= native-card-id (:card-id hydrated)))
                  (is (= collection-id (:collection-id hydrated)))
                  (is (nil? (:table-id hydrated)))))

              (testing "hydrate-scope for table"
                (let [scope    {:table-id table-id}
                      hydrated (scope/hydrate scope)]
                  (is (= #{:table-id :database-id}
                         (set (keys hydrated))))
                  (is (= table-id (:table-id hydrated)))
                  (is (= db-id (:database-id hydrated)))))

              (testing "hydrate-scope for webhook"
                (let [scope    {:webhook-id webhook-id}
                      hydrated (scope/hydrate scope)]
                  (is (= #{:webhook-id :table-id :database-id}
                         (set (keys hydrated))))
                  (is (= webhook-id (:webhook-id hydrated)))
                  (is (= table-id (:table-id hydrated)))
                  (is (= db-id (:database-id hydrated))))))

            (finally
              (t2/delete! :table_webhook_token webhook-id))))))))

(deftest normalize-scope-test
  (mt/with-premium-features #{:table-data-editing}
    (let [dashcard-scope {:dashboard-id  1
                          :dashcard-id   2
                          :card-id       3
                          :table-id      4
                          :collection-id 5
                          :database-id   6}]

      (testing "normalize-scope with dashcard scope"
        (is (= {:dashcard-id 2} (scope/normalize dashcard-scope))))

      (testing "normalize-scope with dashboard scope"
        (is (= {:dashboard-id 1} (scope/normalize {:dashboard-id 1 :collection-id 5}))))

      (testing "normalize-scope with card scope"
        (is (= {:card-id 3} (scope/normalize {:card-id 3 :table-id 4 :collection-id 5 :database-id 6}))))

      (testing "normalize-scope with table scope"
        (is (= {:table-id 4} (scope/normalize {:table-id 4 :database-id 6})))))))
