(ns metabase.actions.scope-test
  (:require
   [clojure.test :refer :all]
   [metabase.actions.scope :as actions.scope]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest scope-type-test
  (testing "scope-type correctly classifies scope based on available keys"
    (are [scope expected] (= expected (actions.scope/scope-type scope))
      {:dashcard-id 1, :dashboard-id 2, :collection-id 3, :card-id 4, :table-id 5, :database-id 6} :dashcard
      {:dashboard-id 1, :collection-id 2}                                                          :dashboard
      {:model-id 1, :table-id 2, :database-id 3}                                                   :model
      {:table-id 1, :database-id 4}                                                                :table)))

(deftest hydrate-test
  (let [db-id      (mt/id)
        table-id   (mt/id :venues)]
    (mt/with-temp [:model/Collection {collection-id :id} {:name "Test Collection"}
                   :model/Card {mbql-model-id :id} {:name          "Test MBQL Card/Model"
                                                    :database_id   db-id
                                                    :dataset_query {:database db-id
                                                                    :type     :query
                                                                    :query    {:source-table table-id}}
                                                    :collection_id collection-id
                                                    :type          :model}
                   :model/Dashboard {dashboard-id :id} {:name          "Test Dashboard"
                                                        :collection_id collection-id}
                   :model/Card {native-model-id :id} {:name          "Test Native Card/Model"
                                                      :database_id   db-id
                                                      :dataset_query {:database db-id
                                                                      :type     :native
                                                                      :native   {:query "SELECT * FROM venues"}}
                                                      :collection_id collection-id
                                                      :type          :model}
                   :model/DashboardCard {dashcard-id-1 :id} {:dashboard_id dashboard-id
                                                             :card_id      mbql-model-id
                                                             :row          0
                                                             :col          0
                                                             :size_x       4
                                                             :size_y       4}
                   :model/DashboardCard {dashcard-id-2 :id} {:dashboard_id dashboard-id
                                                             :card_id      native-model-id
                                                             :row          0
                                                             :col          4
                                                             :size_x       4
                                                             :size_y       4}]
      (testing "hydrate for dashcard with MBQL card"
        (is (= {:dashcard-id   dashcard-id-1
                :dashboard-id  dashboard-id
                :collection-id collection-id
                :type          :dashcard}
               (actions.scope/hydrate-scope {:dashcard-id dashcard-id-1}))))

      (testing "hydrate for dashcard with native card"
        (is (= {:dashcard-id   dashcard-id-2
                :dashboard-id  dashboard-id
                :collection-id collection-id
                :type          :dashcard}
               (actions.scope/hydrate-scope {:dashcard-id dashcard-id-2}))))

      (testing "hydrate for dashboard"
        (is (= {:dashboard-id  dashboard-id
                :collection-id collection-id
                :type          :dashboard}
               (actions.scope/hydrate-scope {:dashboard-id dashboard-id}))))

      (testing "hydrate for MBQL card"
        (is (= {:type          :model
                :model-id       mbql-model-id
                :collection-id collection-id
                :table-id      table-id
                :database-id   db-id}
               (actions.scope/hydrate-scope {:model-id mbql-model-id}))))

      (testing "hydrate for native card"
        (is (= {:type          :model
                :model-id       native-model-id
                :collection-id collection-id
                :database-id   db-id}
               (actions.scope/hydrate-scope {:model-id native-model-id}))))

      (testing "hydrate for MBQL model"
        (is (= {:type          :model
                :model-id      mbql-model-id
                :collection-id collection-id
                :table-id      table-id
                :database-id   db-id}
               (actions.scope/hydrate-scope {:model-id mbql-model-id}))))

      (testing "hydrate for native model"
        (is (= {:model-id      native-model-id
                :collection-id collection-id
                :database-id   db-id
                :type          :model}
               (actions.scope/hydrate-scope {:model-id native-model-id}))))

      (testing "hydrate for table"
        (is (= {:table-id    table-id
                :database-id db-id
                :type        :table}
               (actions.scope/hydrate-scope {:table-id table-id})))))))

(deftest normalize-test
  (testing "normalize with various scopes"
    (is (= {:type        :dashcard
            :dashcard-id 2}
           (actions.scope/normalize-scope {:dashboard-id  1
                                           :dashcard-id   2
                                           :collection-id 5})))

    (is (= {:type         :dashboard
            :dashboard-id 1}
           (actions.scope/normalize-scope {:dashboard-id  1
                                           :collection-id 5})))

    (is (= {:type     :model
            :model-id 7}
           (actions.scope/normalize-scope {:model-id      7
                                           :table-id      4
                                           :collection-id 5
                                           :database-id   6})))

    (is (= {:type     :table
            :table-id 4}
           (actions.scope/normalize-scope {:table-id    4
                                           :database-id 6})))))
