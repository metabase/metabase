(ns metabase.metrics.permissions-test
  (:require
   [clojure.test :refer :all]
   [metabase.metrics.permissions :as metrics.perms]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

;;; ------------------------------------------------- Helpers -------------------------------------------------

(defn- metric-dimensions
  "Fetch a metric via the API and return just its dimensions."
  [user-kw metric-id]
  (:dimensions (mt/user-http-request user-kw :get 200 (str "metric/" metric-id))))

(defn- dimension-names
  "Extract the set of display-name (or name) values from a seq of dimensions."
  [dims]
  (into #{} (map #(or (:display-name %) (:name %))) dims))

(defn- dimension-group-names
  "Extract the set of group display-names from a seq of dimensions."
  [dims]
  (into #{} (map #(get-in % [:group :display-name])) dims))

;;; ------------------------------------------------- Field Visibility Tests -------------------------------------------------

(deftest hidden-fields-are-filtered-out-test
  (testing "Dimensions based on hidden/sensitive fields are excluded from GET /api/metric/:id"
    (mt/with-temp [:model/Card metric {:name          "Orders Count"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query orders {:aggregation [[:count]]})}]
      ;; First, fetch to establish dimensions
      (mt/user-http-request :crowberto :get 200 (str "metric/" (:id metric)))
      ;; Now hide a field
      (let [tax-field-id (mt/id :orders :tax)]
        (t2/update! :model/Field tax-field-id {:visibility_type :hidden})
        (try
          (let [dims (metric-dimensions :rasta (:id metric))]
            (testing "hidden field should not appear as a dimension"
              (is (not (contains? (dimension-names dims) "Tax")))))
          (finally
            (t2/update! :model/Field tax-field-id {:visibility_type :normal})))))))

(deftest sensitive-fields-are-filtered-out-test
  (testing "Dimensions based on sensitive fields are excluded from GET /api/metric/:id"
    (mt/with-temp [:model/Card metric {:name          "Orders Count"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query orders {:aggregation [[:count]]})}]
      (mt/user-http-request :crowberto :get 200 (str "metric/" (:id metric)))
      (let [tax-field-id (mt/id :orders :tax)]
        (t2/update! :model/Field tax-field-id {:visibility_type :sensitive})
        (try
          (let [dims (metric-dimensions :rasta (:id metric))]
            (testing "sensitive field should not appear as a dimension"
              (is (not (contains? (dimension-names dims) "Tax")))))
          (finally
            (t2/update! :model/Field tax-field-id {:visibility_type :normal})))))))

(deftest normal-fields-are-included-test
  (testing "Dimensions based on normal-visibility fields are included"
    (mt/with-temp [:model/Card metric {:name          "Orders Count"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query orders {:aggregation [[:count]]})}]
      (let [dims (metric-dimensions :rasta (:id metric))]
        (testing "should have dimensions from the orders table"
          (is (seq dims))
          ;; The orders table has columns like Tax, Total, etc.
          (is (some #{"Tax"} (dimension-names dims))))))))

;;; ------------------------------------------------- Table Permission Tests -------------------------------------------------

(deftest table-permissions-filter-dimensions-test
  (testing "Dimensions from tables the user cannot access are excluded"
    ;; Orders metric has FK-joined dimensions: "Product" group and "User" group
    ;; Block access to People table and verify the "User" group disappears.
    (mt/with-temp [:model/Card metric {:name          "Orders Count"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query orders {:aggregation [[:count]]})}]
      ;; Establish dimensions as superuser first (sync happens on first read)
      (let [all-dims    (metric-dimensions :crowberto (:id metric))
            all-groups  (dimension-group-names all-dims)]
        (testing "sanity: superuser sees FK-joined dimensions from connected tables"
          ;; FK-joined groups use singular table display names: "Product", "User"
          (is (contains? all-groups "User") "should see User (People) group")
          (is (contains? all-groups "Product") "should see Product group"))
        ;; Block rasta's access to the People table (keep Orders + Products accessible)
        (mt/with-no-data-perms-for-all-users!
          (data-perms/set-table-permission! (perms-group/all-users) (mt/id :orders) :perms/view-data :unrestricted)
          (data-perms/set-table-permission! (perms-group/all-users) (mt/id :orders) :perms/create-queries :query-builder)
          (data-perms/set-table-permission! (perms-group/all-users) (mt/id :products) :perms/view-data :unrestricted)
          (data-perms/set-table-permission! (perms-group/all-users) (mt/id :products) :perms/create-queries :query-builder)
          ;; People table is BLOCKED
          (let [filtered-dims   (metric-dimensions :rasta (:id metric))
                filtered-groups (dimension-group-names filtered-dims)]
            (testing "rasta should NOT see dimensions from the blocked People table"
              (is (not (contains? filtered-groups "User"))))
            (testing "rasta should still see dimensions from Orders and Products"
              (is (contains? filtered-groups "Orders"))
              (is (contains? filtered-groups "Product")))))))))

(deftest superuser-sees-all-dimensions-test
  (testing "Superuser bypasses all permission filtering"
    (mt/with-temp [:model/Card metric {:name          "Orders Count"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query orders {:aggregation [[:count]]})}]
      (mt/with-no-data-perms-for-all-users!
        ;; Even with all perms revoked for all-users group, crowberto (superuser) sees everything
        (let [dims   (metric-dimensions :crowberto (:id metric))
              groups (dimension-group-names dims)]
          (testing "crowberto should see all dimensions including FK-joined tables"
            (is (seq dims))
            (is (contains? groups "Product"))
            (is (contains? groups "User"))))))))

(deftest dimension-mappings-filtered-in-lockstep-test
  (testing "dimension_mappings are filtered in lockstep with dimensions"
    (mt/with-temp [:model/Card metric {:name          "Orders Count"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query orders {:aggregation [[:count]]})}]
      ;; Establish dimensions
      (mt/user-http-request :crowberto :get 200 (str "metric/" (:id metric)))
      (mt/with-no-data-perms-for-all-users!
        (data-perms/set-table-permission! (perms-group/all-users) (mt/id :orders) :perms/view-data :unrestricted)
        (data-perms/set-table-permission! (perms-group/all-users) (mt/id :orders) :perms/create-queries :query-builder)
        (let [response (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))
              dim-ids  (into #{} (map :id) (:dimensions response))
              mapping-dim-ids (into #{} (map :dimension-id) (:dimension_mappings response))]
          (testing "every mapping references an existing dimension"
            (is (every? #(contains? dim-ids %) mapping-dim-ids)))
          (testing "every dimension has a mapping"
            (is (every? #(contains? mapping-dim-ids %) dim-ids))))))))

(deftest dimension-value-endpoint-rejects-filtered-dimension-test
  (testing "Dimension value endpoint returns 400 for a dimension the user can't access"
    (mt/with-temp [:model/Card metric {:name          "Orders Count"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query orders {:aggregation [[:count]]})}]
      ;; Establish dimensions as superuser
      (let [all-response (mt/user-http-request :crowberto :get 200 (str "metric/" (:id metric)))
            ;; Find a dimension from the Product group (FK-joined from Products table)
            product-dim (->> (:dimensions all-response)
                             (filter #(= "Product" (get-in % [:group :display-name])))
                             first)]
        (when product-dim
          ;; Block access to Products table for rasta
          (mt/with-no-data-perms-for-all-users!
            (data-perms/set-table-permission! (perms-group/all-users) (mt/id :orders) :perms/view-data :unrestricted)
            (data-perms/set-table-permission! (perms-group/all-users) (mt/id :orders) :perms/create-queries :query-builder)
            (testing "rasta should get 400 when requesting values for a filtered-out dimension"
              (mt/user-http-request :rasta :get 400
                                    (str "metric/" (:id metric)
                                         "/dimension/" (:id product-dim) "/values")))))))))

(deftest no-dimensions-passthrough-test
  (testing "Metric with no dimensions returns cleanly (no NPE)"
    (mt/with-temp [:model/Card metric {:name          "Empty Metric"
                                       :type          :metric
                                       :dataset_query (mt/mbql-query orders {:aggregation [[:count]]})}]
      ;; Don't trigger sync — dimensions should be nil/empty
      (let [response (mt/user-http-request :rasta :get 200 (str "metric/" (:id metric)))]
        (is (contains? response :dimensions))))))

(deftest unresolvable-dimension-kept-test
  (testing "Dimensions without a resolvable field ID are conservatively kept"
    (let [fake-metric {:dimensions         [{:id "resolvable" :display-name "Tax"
                                             :sources [{:field-id (mt/id :orders :tax)}]}
                                            {:id "unresolvable" :display-name "Mystery"
                                             :sources []}]
                       :dimension_mappings [{:dimension-id "resolvable"
                                             :target [:field {} (mt/id :orders :tax)]}
                                            {:dimension-id "unresolvable"
                                             :target [:some-other-ref {}]}]}
          result      (mt/with-test-user :rasta
                        (metrics.perms/filter-dimensions-for-user fake-metric))]
      (testing "unresolvable dimension is preserved"
        (is (= #{"Tax" "Mystery"} (dimension-names (:dimensions result)))))
      (testing "both mappings are preserved"
        (is (= #{"resolvable" "unresolvable"}
               (into #{} (map :dimension-id) (:dimension_mappings result))))))))
