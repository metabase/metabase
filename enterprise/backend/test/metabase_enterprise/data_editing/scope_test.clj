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
      {:model-id 1, :table-id 2, :database-id 3}                                                    :model
      {:table-id 1, :database-id 4}                                                                 :table
      {:webhook-id 1, :table-id 2}                                                                  :webhook)))

(deftest hydrate-test
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
                                                                      :database_id   db-id
                                                                      :name          "Test MBQL Card"
                                                                      :collection_id collection-id}
                           :model/Card         {mbql-model-id :id}   {:dataset_query {:database db-id
                                                                                      :type     :query
                                                                                      :query    {:source-table table-id}}
                                                                      :database_id   db-id
                                                                      :name          "Test MBQL Model"
                                                                      :collection_id collection-id
                                                                      :dataset       true}
                           :model/Card          {native-model-id :id} {:dataset_query {:database db-id
                                                                                       :type     :native
                                                                                       :native   {:query "SELECT * FROM venues"}}
                                                                       :database_id   db-id
                                                                       :name          "Test Native Model"
                                                                       :collection_id collection-id
                                                                       :dataset       true}
                           :model/Dashboard     {dashboard-id :id}   {:name          "Test Dashboard"
                                                                      :collection_id collection-id}
                           :model/Card          {native-card-id :id} {:dataset_query {:database db-id
                                                                                      :type     :native
                                                                                      :native   {:query "SELECT * FROM venues"}}
                                                                      :database_id   db-id
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
              (testing "hydrate for dashcard with MBQL card"
                (is (= {:dashcard-id   dashcard-id-1
                        :dashboard-id  dashboard-id
                        :collection-id collection-id
                        :card-id       mbql-card-id
                        :table-id      table-id
                        :database-id   db-id}
                       (scope/hydrate {:dashcard-id dashcard-id-1}))))

              (testing "hydrate for dashcard with native card"
                (is (= {:dashcard-id   dashcard-id-2
                        :dashboard-id  dashboard-id
                        :collection-id collection-id
                        :card-id       native-card-id}
                       (scope/hydrate {:dashcard-id dashcard-id-2}))))

              (testing "hydrate for dashboard"
                (is (= {:dashboard-id  dashboard-id
                        :collection-id collection-id}
                       (scope/hydrate {:dashboard-id dashboard-id}))))

              (testing "hydrate for MBQL card"
                (is (= {:card-id       mbql-card-id
                        :collection-id collection-id
                        :table-id      table-id
                        :database-id   db-id}
                       (scope/hydrate {:card-id mbql-card-id}))))

              (testing "hydrate for native card"
                (is (= {:card-id       native-card-id
                        :collection-id collection-id}
                       (scope/hydrate {:card-id native-card-id}))))

              (testing "hydrate for MBQL model"
                (is (= {:model-id      mbql-model-id
                        :collection-id collection-id
                        :table-id      table-id
                        :database-id   db-id}
                       (scope/hydrate {:model-id mbql-model-id}))))

              (testing "hydrate for native model"
                (is (= {:model-id      native-model-id
                        :collection-id collection-id}
                       (scope/hydrate {:model-id native-model-id}))))

              (testing "hydrate for table"
                (is (= {:table-id    table-id
                        :database-id db-id}
                       (scope/hydrate {:table-id table-id}))))

              (testing "hydrate for webhook"
                (is (= {:webhook-id  webhook-id
                        :table-id    table-id
                        :database-id db-id}
                       (scope/hydrate {:webhook-id webhook-id})))))

            (finally
              (t2/delete! :table_webhook_token webhook-id))))))))

(deftest normalize-test
  (mt/with-premium-features #{:table-data-editing}
    (testing "normalize with various scopes"
      (is (= {:dashcard-id 2}
             (scope/normalize {:dashboard-id  1
                               :dashcard-id   2
                               :card-id       3
                               :table-id      4
                               :collection-id 5
                               :database-id   6})))

      (is (= {:dashboard-id 1}
             (scope/normalize {:dashboard-id 1
                               :collection-id 5})))

      (is (= {:card-id 3}
             (scope/normalize {:card-id 3
                               :table-id 4
                               :collection-id 5
                               :database-id 6})))

      (is (= {:model-id 7}
             (scope/normalize {:model-id 7
                               :table-id 4
                               :collection-id 5
                               :database-id 6})))

      (is (= {:table-id 4}
             (scope/normalize {:table-id 4
                               :database-id 6}))))))
