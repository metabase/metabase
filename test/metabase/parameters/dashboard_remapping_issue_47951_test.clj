(ns metabase.parameters.dashboard-remapping-issue-47951-test
  "Test for issue #47951: Dashboard filters show entity keys instead of names 
   when linked to multiple fields with grouped permissions."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.parameters.dashboard :as params.dashboard]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest ^:parallel dashboard-remapping-multi-field-permissions-test
  "Test for issue #47951: Dashboard filters should show remapped values even when
   user has view-data but not create-queries permissions on the target table."
  (testing "Dashboard parameter remapping with multi-field FK scenario"
    (mt/dataset test-data
      (mt/with-column-remappings [products.id products.title]
        (let [orders-product-id-field-id (mt/id :orders :product_id)
              reviews-product-id-field-id (mt/id :reviews :product_id)]

          ;; Create dashboard with parameter mapped to both fields
          (mt/with-temp [:model/Card {orders-card-id :id} {:dataset_query (mt/mbql-query orders)}
                         :model/Card {reviews-card-id :id} {:dataset_query (mt/mbql-query reviews)}
                         :model/Dashboard {dashboard-id :id} {:parameters [{:id "p1"
                                                                            :name "Product ID"
                                                                            :slug "p1"
                                                                            :type "id"
                                                                            :sectionId "id"
                                                                            :default 1}]}
                         :model/DashboardCard {} {:dashboard_id dashboard-id
                                                  :card_id orders-card-id
                                                  :parameter_mappings [{:card_id orders-card-id
                                                                        :parameter_id "p1"
                                                                        :target ["dimension" ["field" orders-product-id-field-id nil]]}]}
                         :model/DashboardCard {} {:dashboard_id dashboard-id
                                                  :card_id reviews-card-id
                                                  :parameter_mappings [{:card_id reviews-card-id
                                                                        :parameter_id "p1"
                                                                        :target ["dimension" ["field" reviews-product-id-field-id nil]]}]}]

            (testing "Test parameter remapping for multi-field scenario"
              (binding [api/*current-user-id* (mt/user->id :rasta)]
                (let [dashboard (t2/select-one :model/Dashboard :id dashboard-id)
                      parameter (first (:parameters dashboard))]

                  (testing "Should get remapped values for parameter with multiple FK fields pointing to same PK"
                    (let [remapped-values (params.dashboard/dashboard-param-remapped-value dashboard (:id parameter) 1)]
                      (is (some? remapped-values)
                          "Should get remapped values for multi-field FK scenario")

                      (when remapped-values
                        (is
                         (= remapped-values
                            [1 "Rustic Paper Wallet"]))))))))))))))

(deftest ^:parallel dashboard-remapping-restricted-permissions-test
  "Test for issue #47951: Dashboard filters should show remapped values even when
   user has view-data but not create-queries permissions on the target table."
  (testing "Dashboard parameter remapping with restricted permissions"
    (mt/dataset test-data
      (mt/with-column-remappings [products.id products.title]
        (let [orders-product-id-field-id (mt/id :orders :product_id)
              reviews-product-id-field-id (mt/id :reviews :product_id)
              products-table-id (mt/id :products)]

          ;; Create dashboard with parameter mapped to both fields
          (mt/with-temp [:model/Card {orders-card-id :id} {:dataset_query (mt/mbql-query orders)}
                         :model/Card {reviews-card-id :id} {:dataset_query (mt/mbql-query reviews)}
                         :model/Dashboard {dashboard-id :id} {:parameters [{:id "p1"
                                                                            :name "Product ID"
                                                                            :slug "p1"
                                                                            :type "id"
                                                                            :sectionId "id"
                                                                            :default 1}]}
                         :model/DashboardCard {} {:dashboard_id dashboard-id
                                                  :card_id orders-card-id
                                                  :parameter_mappings [{:card_id orders-card-id
                                                                        :parameter_id "p1"
                                                                        :target ["dimension" ["field" orders-product-id-field-id nil]]}]}
                         :model/DashboardCard {} {:dashboard_id dashboard-id
                                                  :card_id reviews-card-id
                                                  :parameter_mappings [{:card_id reviews-card-id
                                                                        :parameter_id "p1"
                                                                        :target ["dimension" ["field" reviews-product-id-field-id nil]]}]}]
            (clojure.pprint/pprint
             {:dashboard-id dashboard-id
              :orders-card-id orders-card-id
              :reviews-card-id reviews-card-id
              :reviews-table-id (mt/id :reviews)
              :orders-table-id (mt/id :orders)
              :products-table-id products-table-id})
            (testing "With restricted permissions (view-data only, no create-queries)"
              (println "Setting up restricted permissions...")
              ;; Set up restricted permissions: no create-queries on products table
              (perms.test-util/with-perm-for-group-and-table! (perms-group/all-users) (mt/id :reviews)
                :perms/create-queries :no
                (perms.test-util/with-perm-for-group-and-table! (perms-group/all-users) (mt/id :orders)
                  :perms/create-queries :no
                  (perms.test-util/with-perm-for-group-and-table! (perms-group/all-users) products-table-id
                    :perms/create-queries :no
                    ;; :perms/view-data :blocked
                    (do
                      (println "Permissions set, testing remapping...")
                      ;; Validate permissions are actually set
                      (let [rasta-id (mt/user->id :rasta)
                            db-id (mt/id)
                            all-users-group-id (perms-group/all-users)]
                        (println "Checking permissions for user" rasta-id "in group" all-users-group-id)
                        (println "Database ID:" db-id)

                        (println "Products table view-data permission:"
                                 (data-perms/table-permission-for-user rasta-id :perms/view-data db-id products-table-id))
                        (println "Products table create-queries permission:"
                                 (data-perms/table-permission-for-user rasta-id :perms/create-queries db-id products-table-id))
                        (println "Orders table create-queries permission:"
                                 (data-perms/table-permission-for-user rasta-id :perms/create-queries db-id (mt/id :orders)))
                        (println "Reviews table create-queries permission:"
                                 (data-perms/table-permission-for-user rasta-id :perms/create-queries db-id (mt/id :reviews)))))
                    (binding [api/*current-user-id* (mt/user->id :rasta)]
                      (let [dashboard (t2/select-one :model/Dashboard :id dashboard-id)
                            parameter (first (:parameters dashboard))
                            _ (println "About to call dashboard-param-remapped-value...")
                            remapped-values (params.dashboard/dashboard-param-remapped-value dashboard (:id parameter) 1)
                            _ (println "Got result:" remapped-values)]

                        (testing "Should get only raw value with restricted permissions (reproducing bug)"
                          (is (= remapped-values [1 "Rustic Paper Wallet"])
                              "Even with no query-creating permissions, we still get the remapped value."))))))))))))))
