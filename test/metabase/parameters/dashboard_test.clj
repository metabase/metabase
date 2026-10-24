(ns metabase.parameters.dashboard-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.parameters.dashboard-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.dashboards-rest.api-test :as api.dashboard-test]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util.notebook-helpers :as nb]
   [metabase.parameters.dashboard :as parameters.dashboard]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.query-processor :as qp]
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
                  (#'parameters.dashboard/param->fields (get-in dashboard [:resolved-params "_CATEGORY_CONTAINS_"])))))
        (testing "op-override forces the op regardless of param type (QUE2-326)"
          (is (=? [{:op := :options {:case-sensitive false}}]
                  (#'parameters.dashboard/param->fields
                   (get-in dashboard [:resolved-params "_CATEGORY_CONTAINS_"])
                   :op-override :=))))))))

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

(deftest ^:synchronized dashboard-parameters
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

(deftest ^:synchronized dashboard-remapping-multi-field-permissions-test
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
              (mt/with-full-data-perms-for-all-users!
                (data-perms/disable-perms-cache
                 (binding [api/*current-user-id*         (mt/user->id :rasta)
                           qp.perms/*param-values-query* true]
                   (let [dashboard (t2/select-one :model/Dashboard :id dashboard-id)
                         parameter (first (:parameters dashboard))]
                     (testing "Should get remapped values for parameter with multiple FK fields pointing to same PK"
                       (is (= [1 "Rustic Paper Wallet"]
                              (parameters.dashboard/dashboard-param-remapped-value dashboard (:id parameter) 1)))))))))))))))

(deftest ^:synchronized dashboard-remapping-restricted-permissions-test
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

(deftest ^:synchronized dashboard-remapping-parallel-fks-test
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

(deftest ^:parallel chain-filter-parallel-fks-test
  (testing "linked-filter values follow the FK used by the card's join, not an arbitrary FK (#85225)"
    (mt/dataset avian-singles
      (let [mp       (mt/metadata-provider)
            messages (lib.metadata/table mp (mt/id :messages))
            users-id (mt/id :users :id)
            text-id  (mt/id :messages :text)
            rasta-id  1
            brenda-id 7]
        (doseq [fk-display-name ["Sender ID" "Receiver ID"]
                uid             [rasta-id brenda-id]]
          (testing (format "\ncard joins Users on %s, Sender=%d" fk-display-name uid)
            (let [card-query (nb/add-join (lib/query mp messages) "Users" fk-display-name "ID")
                  join-alias (lib/current-join-alias (first (lib/joins card-query 0)))
                  users-id-col (nb/find-col-with-spec card-query
                                                      (lib/filterable-columns card-query)
                                                      "Users" "ID")
                  text-col     (nb/find-col-with-spec card-query
                                                      (lib/breakoutable-columns card-query)
                                                      {:is-main-group true} "Text")
                  filtered     (-> card-query
                                   (lib/filter (lib/= users-id-col uid))
                                   (lib/breakout text-col))
                  expected     (into #{} (map first) (mt/rows (qp/process-query filtered)))]
              (mt/with-temp [:model/Card         {card-id :id} {:dataset_query card-query}
                             :model/Dashboard    {dash-id :id}
                             {:parameters [{:id        "sender"   :name "Sender" :slug "sender"
                                            :type      "id"       :sectionId "id"}
                                           {:id        "text"     :name "Text"   :slug "text"
                                            :type      "category" :sectionId "string"
                                            :filteringParameters ["sender"]}]}
                             :model/DashboardCard {}
                             {:dashboard_id dash-id
                              :card_id      card-id
                              :parameter_mappings
                              [{:card_id      card-id
                                :parameter_id "sender"
                                :target       ["dimension" ["field" users-id {:join-alias join-alias}]]}
                               {:card_id      card-id
                                :parameter_id "text"
                                :target       ["dimension" ["field" text-id nil]]}]}]
                (binding [api/*current-user-id*         (mt/user->id :rasta)
                          qp.perms/*param-values-query* true]
                  (let [dashboard (t2/select-one :model/Dashboard :id dash-id)
                        actual   (into #{} (map first)
                                       (:values (parameters.dashboard/chain-filter
                                                 dashboard "text" {"sender" uid})))]
                    (is (= expected actual))))))))))))

(deftest ^:parallel chain-filter-multi-mapping-union-test
  (testing "a parameter mapped to one base field via two joins unions each mapping's dropdown values (#85225)"
    (mt/dataset avian-singles
      (let [mp         (mt/metadata-provider)
            users      (lib.metadata/table mp (mt/id :users))
            messages   (lib.metadata/table mp (mt/id :messages))
            users-id   (mt/id :users :id)
            text-id    (mt/id :messages :text)
            rasta-id   1
            brenda-id  7
            card-query (-> (lib/query mp users)
                           (nb/add-join "Messages" "ID" "Sender ID")
                           (nb/add-join "Messages" "ID" "Receiver ID"))
            joins          (lib/joins card-query 0)
            sender-alias   (lib/current-join-alias (first joins))
            receiver-alias (lib/current-join-alias (second joins))
            base         (lib/query mp messages)
            sender-col   (nb/find-col-with-spec base (lib/filterable-columns base)
                                                {:is-main-group true} "Sender ID")
            receiver-col (nb/find-col-with-spec base (lib/filterable-columns base)
                                                {:is-main-group true} "Receiver ID")
            text-col     (nb/find-col-with-spec base (lib/breakoutable-columns base)
                                                {:is-main-group true} "Text")]
        (mt/with-temp [:model/Card         {card-id :id} {:dataset_query card-query}
                       :model/Dashboard    {dash-id :id}
                       {:parameters [{:id        "owner"    :name "Owner" :slug "owner"
                                      :type      "id"       :sectionId "id"}
                                     {:id        "text"     :name "Text"  :slug "text"
                                      :type      "category" :sectionId "string"
                                      :filteringParameters ["owner"]}]}
                       :model/DashboardCard {}
                       {:dashboard_id dash-id
                        :card_id      card-id
                        :parameter_mappings
                        [{:card_id      card-id
                          :parameter_id "owner"
                          :target       ["dimension" ["field" users-id nil]]}
                         {:card_id      card-id
                          :parameter_id "text"
                          :target       ["dimension" ["field" text-id {:join-alias sender-alias}]]}
                         {:card_id      card-id
                          :parameter_id "text"
                          :target       ["dimension" ["field" text-id {:join-alias receiver-alias}]]}]}]
          (binding [api/*current-user-id*         (mt/user->id :rasta)
                    qp.perms/*param-values-query* true]
            (let [dashboard (t2/select-one :model/Dashboard :id dash-id)]
              (doseq [uid [rasta-id brenda-id]]
                (testing (format "\nOwner=%d, Text should union sender- and receiver-side values" uid)
                  (let [expected-q (-> base
                                       (lib/filter (lib/or (lib/= sender-col uid)
                                                           (lib/= receiver-col uid)))
                                       (lib/breakout text-col))
                        expected   (into #{} (map first) (mt/rows (qp/process-query expected-q)))
                        actual     (into #{} (map first)
                                         (:values (parameters.dashboard/chain-filter
                                                   dashboard "text" {"owner" uid})))]
                    (is (= expected actual))))))))))))

(deftest ^:parallel target->via-path-condition-shapes-test
  (testing "target->via-path matches by alias, so condition operand order doesn't matter"
    (mt/dataset avian-singles
      (let [mp         (mt/metadata-provider)
            users-id   (mt/id :users :id)
            messages   (lib.metadata/table mp (mt/id :messages))
            card-query (-> (lib/query mp messages)
                           (nb/add-join "Users" "Sender ID" "ID"))
            target     [:dimension [:field users-id {:join-alias "Users - Sender"}]]
            expected   [{:lhs {:table (mt/id :messages) :field (mt/id :messages :sender_id)}
                         :rhs {:table (mt/id :users)    :field (mt/id :users :id)}}]
            flipped    (update-in card-query [:stages 0 :joins 0 :conditions 0]
                                  (fn [[op opts a b]] [op opts b a]))
            non-eq     (assoc-in card-query [:stages 0 :joins 0 :conditions 0 0] :>=)
            multi      (update-in card-query [:stages 0 :joins 0 :conditions]
                                  (fn [[eq]] [(lib/fresh-uuids (assoc eq 0 :>=)) eq]))]
        (testing "\nstandard LHS/RHS ordering"
          (is (= expected (#'parameters.dashboard/target->via-path card-query target))))
        (testing "\nflipped operand order"
          (is (= expected (#'parameters.dashboard/target->via-path flipped target))))
        (testing "\nnon-equality condition yields no link"
          (is (nil? (#'parameters.dashboard/target->via-path non-eq target))))
        (testing "\nmulti-condition join: walker picks the := link past a non-equality condition"
          (is (= expected (#'parameters.dashboard/target->via-path multi target))))))))

(deftest ^:synchronized dashboard-remapping-conflict-scenarios-test
  ;; Test various scenarios where FK1, FK2, and PK have different remapping configurations.
  ;; This tests the logic in find-common-remapping-target and documents that it was
  ;; by design.
  (testing "Remapping conflict resolution scenarios"
    (mt/dataset test-data
      (mt/with-full-data-perms-for-all-users!
        (data-perms/disable-perms-cache
         (binding [qp.perms/*param-values-query* true]
           (let [orders-product-id-field-id  (mt/id :orders :product_id)
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
                           "Should return raw value when only PK is remapped (PK ignored)")))))))))))))

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

(deftest ^:synchronized field-values-without-create-queries-perms-test
  (testing "a user with view-data but no create-queries permissions still gets field-values for a mapped dashboard param (#47097)"
    (mt/dataset test-data
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query (mt/metadata-provider)
                                                                          (lib.metadata/table (mt/metadata-provider) (mt/id :products)))}
                     :model/Dashboard {dashboard-id :id} {:parameters [{:id        "p1"
                                                                        :name      "Category"
                                                                        :slug      "p1"
                                                                        :type      "string/="
                                                                        :sectionId "string"}]}
                     :model/DashboardCard {} {:dashboard_id       dashboard-id
                                              :card_id            card-id
                                              :parameter_mappings [{:card_id      card-id
                                                                    :parameter_id "p1"
                                                                    :target       [:dimension (lib.convert/->legacy-MBQL
                                                                                               (lib/ref (lib.metadata/field (mt/metadata-provider) (mt/id :products :category))))]}]}]
        (perms.test-util/with-perms-for-group-and-tables!
          (perms-group/all-users)
          {(mt/id :products) {:perms/create-queries :no}}
          (data-perms/disable-perms-cache
           ;; Mimicks the API endpoint (required):
           (binding [api/*current-user-id*         (mt/user->id :rasta)
                     qp.perms/*param-values-query* true]
             (let [dashboard        (t2/select-one :model/Dashboard :id dashboard-id)
                   {:keys [values]} (parameters.dashboard/param-values dashboard "p1" {})]
               (is (= #{["Doohickey"] ["Gadget"] ["Gizmo"] ["Widget"]}
                      (set values)))))))))))

(deftest ^:synchronized remapped-param-value-with-model-card-test
  (testing "remapped id-param values work when the mapped source card is a model (#44231)"
    (mt/dataset test-data
      (mt/with-temp [:model/Card {model-id :id} {:type          :model
                                                 :dataset_query (lib/query (mt/metadata-provider)
                                                                           (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))}
                     :model/Dashboard {dashboard-id :id} {:parameters [{:id        "p1"
                                                                        :name      "Product ID"
                                                                        :slug      "p1"
                                                                        :type      "id"
                                                                        :sectionId "id"
                                                                        :default   1}]}
                     :model/DashboardCard {} {:dashboard_id       dashboard-id
                                              :card_id            model-id
                                              :parameter_mappings [{:card_id      model-id
                                                                    :parameter_id "p1"
                                                                    :target       [:dimension (lib.convert/->legacy-MBQL
                                                                                               (lib/ref (lib.metadata/field (mt/metadata-provider) (mt/id :orders :product_id))))]}]}]
        (mt/with-column-remappings [orders.product_id products.title]
          (mt/with-full-data-perms-for-all-users!
            (data-perms/disable-perms-cache
             (binding [api/*current-user-id*         (mt/user->id :rasta)
                       qp.perms/*param-values-query* true]
               (let [dashboard (t2/select-one :model/Dashboard :id dashboard-id)
                     parameter (first (:parameters dashboard))]
                 (is (= [1 "Rustic Paper Wallet"]
                        (parameters.dashboard/dashboard-param-remapped-value dashboard (:id parameter) 1))))))))))))

(deftest ^:synchronized implicit-fk-pk-name-remapped-value-single-field-test
  (testing "a single-field id param on an FK column resolves via the implicit fk->pk->name remap"
    (mt/dataset test-data
      (let [mp           (mt/metadata-provider)
            name-field   (lib.metadata/field mp (mt/id :people :name))
            people-query (-> (lib/query mp (lib.metadata/table mp (mt/id :people)))
                             (lib/filter (lib/= (lib.metadata/field mp (mt/id :people :id)) 1))
                             (lib/with-fields [name-field]))
            person-name  (-> (mt/formatted-rows [str] (qp/process-query people-query))
                             first first)]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query (mt/metadata-provider)
                                                                            (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))}
                       :model/Dashboard {dashboard-id :id} {:parameters [{:id        "p1"
                                                                          :name      "User ID"
                                                                          :slug      "p1"
                                                                          :type      "id"
                                                                          :sectionId "id"}]}
                       :model/DashboardCard {} {:dashboard_id       dashboard-id
                                                :card_id            card-id
                                                :parameter_mappings [{:card_id      card-id
                                                                      :parameter_id "p1"
                                                                      :target       [:dimension (lib.convert/->legacy-MBQL
                                                                                                 (lib/ref (lib.metadata/field (mt/metadata-provider) (mt/id :orders :user_id))))]}]}]
          (mt/with-full-data-perms-for-all-users!
            (data-perms/disable-perms-cache
             (binding [api/*current-user-id*         (mt/user->id :rasta)
                       qp.perms/*param-values-query* true]
               (let [dashboard (t2/select-one :model/Dashboard :id dashboard-id)
                     parameter (first (:parameters dashboard))]
                 (is (= [1 person-name]
                        (parameters.dashboard/dashboard-param-remapped-value dashboard (:id parameter) 1))))))))))))
