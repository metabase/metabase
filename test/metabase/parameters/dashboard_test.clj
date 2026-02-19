(ns metabase.parameters.dashboard-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.dashboards-rest.api-test :as api.dashboard-test]
   [metabase.parameters.dashboard :as parameters.dashboard]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :test-users :web-server))

(deftest ^:parallel param->fields-test
  (testing "param->fields"
    (api.dashboard-test/with-chain-filter-fixtures [{:keys [dashboard]}]
      (let [dashboard (t2/hydrate dashboard :resolved-params)]
        (testing "Should correctly retrieve fields"
          (is (=? [{:op := :options nil}]
                  (#'parameters.dashboard/param->fields (get-in dashboard [:resolved-params "_CATEGORY_NAME_"]))))
          (is (=? [{:op :contains :options {:case-sensitive false}}]
                  (#'parameters.dashboard/param->fields (get-in dashboard [:resolved-params "_CATEGORY_CONTAINS_"])))))))))

(deftest ^:parallel chain-filter-constraints-test
  (testing "chain-filter-constraints"
    (api.dashboard-test/with-chain-filter-fixtures [{:keys [dashboard]}]
      (let [dashboard (t2/hydrate dashboard :resolved-params)]
        (testing "Should return correct constraints with =/!="
          (is (=? [{:op := :value "ood" :options nil}]
                  (#'parameters.dashboard/chain-filter-constraints dashboard {"_CATEGORY_NAME_" "ood"})))
          (is (=? [{:op :!= :value "ood" :options nil}]
                  (#'parameters.dashboard/chain-filter-constraints dashboard {"_NOT_CATEGORY_NAME_" "ood"}))))
        (testing "Should return correct constraints with a few filters"
          (is (=? [{:op := :value "foo" :options nil}
                   {:op :!= :value "bar" :options nil}
                   {:op :contains :value "buzz" :options {:case-sensitive false}}]
                  (#'parameters.dashboard/chain-filter-constraints dashboard {"_CATEGORY_NAME_"     "foo"
                                                                              "_NOT_CATEGORY_NAME_" "bar"
                                                                              "_CATEGORY_CONTAINS_" "buzz"}))))
        (testing "Should ignore incorrect/unknown filters"
          (is (= []
                 (#'parameters.dashboard/chain-filter-constraints dashboard {"qqq" "www"}))))))))

(deftest ^:parallel combined-chained-filter-results-test
  (testing "dedupes and sort by value, then by label if exists"
    (is (= [[1] [2 "B"] [3] [4 "A"] [5 "C"] [6 "D"]]
           (#'parameters.dashboard/combine-chained-filter-results
            [{:values [[1] [2] [4]]}
             {:values [[4 "A"] [5 "C"] [6 "D"]]}
             {:values [[1] [2] [3]]}
             {:values [[4 "A"] [2 "B"] [5 "C"]]}])))))

(deftest ^:sequential dashboard-parameters
  (mt/dataset test-data
    (let [created-at (mt/id :orders :created_at)]
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query orders)}
                     :model/Dashboard {dashboard-id :id} {:parameters [{:id        "p1"
                                                                        :name      "when"
                                                                        :slug      "p1"
                                                                        :type      "date/all-options"}]}
                     :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id
                                                             :card_id card-id
                                                             :parameter_mappings [{:card_id      card-id
                                                                                   :parameter_id "p1"
                                                                                   :target       ["dimension" ["field" created-at nil]]}]}]
        (doseq [value ["thismonth" "lastmonth" "past3days~"
                       "next3days~" "past3days" "next3days" "Q2-2025"]]
          (testing (format "Can use a relative filter of this %s" value)
            (let [response (mt/user-http-request :rasta :post (format "dashboard/%d/dashcard/%s/card/%s/query"
                                                                      dashboard-id dashcard-id card-id)
                                                 {:parameters [{:id "p1"
                                                                :value value
                                                                :type "date/all-options"}]})]
              (is (= "completed" (:status response))))))))))

(deftest ^:sequential dashboard-remapping-multi-field-permissions-test
  "Test for issue #47951: Dashboard filters should show remapped values even when
   user has view-data but not create-queries permissions on the target table."
  (testing "Dashboard parameter remapping with multi-field FK scenario"
    (mt/dataset test-data
      (let [orders-product-id-field-id (mt/id :orders :product_id)
            reviews-product-id-field-id (mt/id :reviews :product_id)]
        (field-values/clear-field-values-for-field! (mt/id :products :id))
        ;; Create dashboard with parameter mapped to both fields
        (mt/with-temp [:model/Card {orders-card-id :id} {:dataset_query (mt/mbql-query orders)}
                       :model/Card {reviews-card-id :id} {:dataset_query (mt/mbql-query reviews)}
                       :model/Dashboard {dashboard-id :id} {:parameters [{:id        "p1"
                                                                          :name      "Product ID"
                                                                          :slug      "p1"
                                                                          :type      "id"
                                                                          :sectionId "id"
                                                                          :default   1}]}
                       :model/DashboardCard {} {:dashboard_id dashboard-id
                                                :card_id orders-card-id
                                                :parameter_mappings [{:card_id      orders-card-id
                                                                      :parameter_id "p1"
                                                                      :target       ["dimension" ["field" orders-product-id-field-id nil]]}]}
                       :model/DashboardCard {} {:dashboard_id dashboard-id
                                                :card_id reviews-card-id
                                                :parameter_mappings [{:card_id      reviews-card-id
                                                                      :parameter_id "p1"
                                                                      :target       ["dimension" ["field" reviews-product-id-field-id nil]]}]}]
          (mt/with-column-remappings [orders.product_id products.title
                                      reviews.product_id products.title]
            (testing "Test parameter remapping for multi-field scenario"
              (binding [api/*current-user-id* (mt/user->id :rasta)]
                (let [dashboard (t2/select-one :model/Dashboard :id dashboard-id)
                      parameter (first (:parameters dashboard))]

                  (testing "Should get remapped values for parameter with multiple FK fields pointing to same PK"
                    (let [remapped-values (parameters.dashboard/dashboard-param-remapped-value dashboard (:id parameter) 1)]
                      (is (some? remapped-values)
                          "Should get remapped values for multi-field FK scenario")

                      (when remapped-values
                        (is
                         (= [1 "Rustic Paper Wallet"]
                            remapped-values))))))))))))))

(deftest ^:sequential dashboard-remapping-restricted-permissions-test
  ;; Test for issue #47951: Dashboard filters should show remapped values even when
  ;; user has view-data but not create-queries permissions on the target table.
  (testing "Dashboard parameter remapping"
    (mt/dataset test-data
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
          (mt/with-column-remappings [orders.product_id products.title
                                      reviews.product_id products.title]
            (binding [api/*current-user-id* (mt/user->id :rasta)]
              (let [dashboard (t2/select-one :model/Dashboard :id dashboard-id)
                    parameter (first (:parameters dashboard))]
                (testing "With restricted permissions (view-data only, no create-queries)"
                  ;; Set up restricted permissions: no create-queries on any of the tables:
                  (perms.test-util/with-perms-for-group-and-tables!
                    (perms-group/all-users)
                    {(mt/id :reviews)  {:perms/create-queries :no}
                     (mt/id :orders)   {:perms/create-queries :no}
                     products-table-id {:perms/create-queries :no}}
                    (data-perms/disable-perms-cache
                     ;; Mimicks the API endpoint (required):
                     (binding [qp.perms/*param-values-query* true]
                       (let [remapped-values (parameters.dashboard/dashboard-param-remapped-value dashboard (:id parameter) 1)]

                         (is (= [1 "Rustic Paper Wallet"]
                                remapped-values)
                             "we still get the remapped value"))))))
                (testing "With highly-restricted permissions (view-data is blocked)"
                  (perms.test-util/with-perm-for-group-and-table! (perms-group/all-users) products-table-id
                    :perms/view-data :blocked
                    (binding [api/*current-user-id* (mt/user->id :rasta)]
                      (data-perms/disable-perms-cache
                       ;; Mimicks the API endpoint (required):
                       (binding [qp.perms/*param-values-query* true]
                         (let [dashboard (t2/select-one :model/Dashboard :id dashboard-id)
                               parameter (first (:parameters dashboard))]
                           (is (thrown-with-msg?
                                Exception #"Error executing"
                                (parameters.dashboard/dashboard-param-remapped-value dashboard (:id parameter) 1))
                               "Querying fails due to insufficient permissions")))))))))))))))

(deftest ^:sequential dashboard-remapping-parallel-fks-test
  (testing "two FKs to the same table, same remap, but pointing to different rows (#65838)"
    (testing "always shows parameter values using the correct FK"
      ;; Before this bug was fixed, the logic chose a parallel edge at random, so one of the two parameter bindings
      ;; below would fail.
      (mt/dataset avian-singles
        (let [sender-id   (mt/id :messages :sender_id)
              receiver-id (mt/id :messages :receiver_id)]
          ;; Create dashboard with parameter mapped to *one* field.
          ;; Alternate between this a few times to be sure none of the ad-hoc caching in `chain-filter`
          ;; is reusing something it shouldn't!
          (doseq [filter-fk [sender-id receiver-id sender-id receiver-id]]
            (mt/with-temp [:model/Card {messages-card-id :id} {:dataset_query (mt/mbql-query messages)}
                           :model/Dashboard {dashboard-id :id} {:parameters [{:id "p1"
                                                                              :name "Squawker"
                                                                              :slug "p1"
                                                                              :type "id"
                                                                              :sectionId "id"
                                                                              :default 1}]}
                           :model/DashboardCard {} {:dashboard_id       dashboard-id
                                                    :card_id            messages-card-id
                                                    :parameter_mappings
                                                    [{:card_id messages-card-id
                                                      :parameter_id "p1"
                                                      :target ["dimension" ["field" filter-fk nil]]}]}]
              (mt/with-column-remappings [messages.sender_id   users.name
                                          messages.receiver_id users.name]
                (binding [api/*current-user-id* (mt/user->id :rasta)]
                  (let [dashboard (t2/select-one :model/Dashboard :id dashboard-id)
                        parameter (first (:parameters dashboard))]
                  ;; Mimicks the API endpoint (required):
                    (binding [qp.perms/*param-values-query* true]
                    ;; Important to check all the mappings here because sometimes they match up by coincidence
                    ;; and pass even when the bug is still present.
                      (let [expected (into {} (mt/rows (mt/process-query (mt/mbql-query users))))
                            actual   (into {} (map (fn [id]
                                                     (parameters.dashboard/dashboard-param-remapped-value
                                                      dashboard (:id parameter) id)))
                                           (keys expected))]
                        (is (= expected actual))))))))))))))

(deftest ^:sequential dashboard-remapping-conflict-scenarios-test
  ;; Test various scenarios where FK1, FK2, and PK have different remapping configurations.
  ;; This tests the logic in find-common-remapping-target and documents that it was
  ;; by design.
  (testing "Remapping conflict resolution scenarios"
    (mt/dataset test-data
      (let [orders-product-id-field-id (mt/id :orders :product_id)
            reviews-product-id-field-id (mt/id :reviews :product_id)]
        (mt/with-temp [:model/Card {orders-card-id :id} {:dataset_query (mt/mbql-query orders)}
                       :model/Card {reviews-card-id :id} {:dataset_query (mt/mbql-query reviews)}
                       :model/Dashboard {dashboard-id :id} {:parameters [{:id        "p1"
                                                                          :name      "Product ID"
                                                                          :slug      "p1"
                                                                          :type      "id"
                                                                          :sectionId "id"
                                                                          :default   1}]}
                       :model/DashboardCard {} {:dashboard_id       dashboard-id
                                                :card_id            orders-card-id
                                                :parameter_mappings [{:card_id      orders-card-id
                                                                      :parameter_id "p1"
                                                                      :target       ["dimension" ["field" orders-product-id-field-id nil]]}]}
                       :model/DashboardCard {} {:dashboard_id       dashboard-id
                                                :card_id            reviews-card-id
                                                :parameter_mappings [{:card_id      reviews-card-id
                                                                      :parameter_id "p1"
                                                                      :target       ["dimension" ["field" reviews-product-id-field-id nil]]}]}]

          (testing "Scenario 1: FK1→A, FK2→B should return raw value (no common remapping)"
            (mt/with-column-remappings [orders.product_id products.title
                                        reviews.product_id products.category ; Different remapping
                                        products.id products.title] ; PK remapping (ignored)
              (binding [api/*current-user-id* (mt/user->id :rasta)]
                (let [dashboard       (t2/select-one :model/Dashboard :id dashboard-id)
                      parameter       (first (:parameters dashboard))
                      remapped-values (parameters.dashboard/dashboard-param-remapped-value dashboard (:id parameter) 1)]
                  (is (= [1] remapped-values)
                      "Should return raw value when FK remappings conflict")))))

          (testing "Scenario 2: FK1→A, FK2→A, PK→C should return A (common FK remapping wins)"
            (mt/with-column-remappings [orders.product_id products.title
                                        reviews.product_id products.title ; Same remapping as FK1
                                        products.id products.category] ; Different PK remapping
              (binding [api/*current-user-id* (mt/user->id :rasta)]
                (let [dashboard       (t2/select-one :model/Dashboard :id dashboard-id)
                      parameter       (first (:parameters dashboard))
                      remapped-values (parameters.dashboard/dashboard-param-remapped-value dashboard (:id parameter) 1)]
                  (is (= [1 "Rustic Paper Wallet"] remapped-values)
                      "Should return common FK remapping when FKs agree")))))

          (testing "Scenario 3: FK1→∅, FK2→A should return raw value (no consensus among FKs)"
            ;; Set up FK2 with remapping, but leave FK1 without remapping, PK with different remapping
            (mt/with-column-remappings [reviews.product_id products.title
                                        products.id products.category]
              (binding [api/*current-user-id* (mt/user->id :rasta)]
                (let [dashboard       (t2/select-one :model/Dashboard :id dashboard-id)
                      parameter       (first (:parameters dashboard))
                      remapped-values (parameters.dashboard/dashboard-param-remapped-value dashboard (:id parameter) 1)]
                  (is (= [1] remapped-values)
                      "Should return raw value when only some FKs have remapping")))))

          (testing "Scenario 4: No remappings at all should return raw value"
            ;; No remappings set up
            (binding [api/*current-user-id* (mt/user->id :rasta)]
              (let [dashboard       (t2/select-one :model/Dashboard :id dashboard-id)
                    parameter       (first (:parameters dashboard))
                    remapped-values (parameters.dashboard/dashboard-param-remapped-value dashboard (:id parameter) 1)]
                (is (= [1] remapped-values)
                    "Should return only raw value when no remappings are configured"))))

          (testing "Scenario 5: Only PK remapping should return raw value (PK ignored)"
            (mt/with-column-remappings [products.id products.title]
              (binding [api/*current-user-id* (mt/user->id :rasta)]
                (let [dashboard       (t2/select-one :model/Dashboard :id dashboard-id)
                      parameter       (first (:parameters dashboard))
                      remapped-values (parameters.dashboard/dashboard-param-remapped-value dashboard (:id parameter) 1)]
                  (is (= [1] remapped-values)
                      "Should return raw value when only PK is remapped (PK ignored)"))))))))))

(deftest find-common-remapping-target-test
  (testing "Finding common remapping targets"
    (mt/dataset test-data
      (let [orders-product-id-field-id (mt/id :orders :product_id)
            reviews-product-id-field-id (mt/id :reviews :product_id)
            products-title-field-id (mt/id :products :title)]

        (testing "When both FK fields remap to the same target"
          (mt/with-column-remappings [orders.product_id products.title
                                      reviews.product_id products.title]
            (is (= products-title-field-id
                   (#'parameters.dashboard/find-common-remapping-target
                    [orders-product-id-field-id reviews-product-id-field-id]))
                "Should return common target when both FKs remap to same field")))

        (testing "When FK fields remap to different targets"
          (mt/with-column-remappings [orders.product_id products.title
                                      reviews.product_id products.category]
            (is (nil? (#'parameters.dashboard/find-common-remapping-target
                       [orders-product-id-field-id reviews-product-id-field-id]))
                "Should return nil when FKs remap to different fields")))

        (testing "When only one FK field has remapping"
          (mt/with-column-remappings [orders.product_id products.title]
            (is (nil? (#'parameters.dashboard/find-common-remapping-target
                       [orders-product-id-field-id reviews-product-id-field-id]))
                "Should return nil when only one FK has remapping (no consensus)")))

        (testing "When no FK fields have remapping"
          (is (nil? (#'parameters.dashboard/find-common-remapping-target
                     [orders-product-id-field-id reviews-product-id-field-id]))
              "Should return nil when no FKs have remapping"))

        (testing "With empty field list"
          (is (nil? (#'parameters.dashboard/find-common-remapping-target []))
              "Should return nil for empty field list"))

        (testing "With single field that has remapping"
          (mt/with-column-remappings [orders.product_id products.title]
            (is (= products-title-field-id
                   (#'parameters.dashboard/find-common-remapping-target [orders-product-id-field-id]))
                "Should return target for single FK with remapping")))))))
