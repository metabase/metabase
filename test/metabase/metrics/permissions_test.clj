(ns metabase.metrics.permissions-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.metrics.permissions-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.metrics.permissions :as metrics.perms]
   [metabase.permissions.core :as perms]
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
  "Extract the set of display_name (or name) values from a seq of dimensions."
  [dims]
  (into #{} (map #(or (:display_name %) (:name %))) dims))

(defn- dimension-group-names
  "Extract the set of group display-names from a seq of dimensions."
  [dims]
  (into #{} (map #(get-in % [:group :display_name])) dims))

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
              mapping-dim-ids (into #{} (map :dimension_id) (:dimension_mappings response))]
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
                             (filter #(= "Product" (get-in % [:group :display_name])))
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
    (let [fake-metric {:dimensions         [{:id "resolvable" :display_name "Tax"
                                             :sources [{:field-id (mt/id :orders :tax)}]}
                                            {:id "unresolvable" :display_name "Mystery"
                                             :sources []}]
                       :dimension_mappings [{:dimension_id "resolvable"
                                             :target [:field {} (mt/id :orders :tax)]}
                                            {:dimension_id "unresolvable"
                                             :target [:some-other-ref {}]}]}
          result      (mt/with-test-user :rasta
                        (metrics.perms/filter-dimensions-for-user fake-metric))]
      (testing "unresolvable dimension is preserved"
        (is (= #{"Tax" "Mystery"} (dimension-names (:dimensions result)))))
      (testing "both mappings are preserved"
        (is (= #{"resolvable" "unresolvable"}
               (into #{} (map :dimension_id) (:dimension_mappings result))))))))

;;; ------------------------------------------------- Batch Variant -------------------------------------------------

(deftest filter-dimensions-for-user-batch-preserves-order-and-filters-per-metric-test
  (testing "batch returns one result per input metric, in order, filtered independently"
    (let [m1 {:dimensions         [{:id "tax" :display_name "Tax"
                                    :sources [{:field-id (mt/id :orders :tax)}]}]
              :dimension_mappings [{:dimension_id "tax" :target [:field {} (mt/id :orders :tax)]}]}
          m2 {:dimensions         [{:id "mystery" :display_name "Mystery" :sources []}]
              :dimension_mappings [{:dimension_id "mystery" :target [:some-other-ref {}]}]}
          batched (mt/with-test-user :rasta
                    (metrics.perms/filter-dimensions-for-user-batch [m1 m2]))]
      (is (= 2 (count batched)))
      (testing "resolvable, accessible field is kept on the first metric"
        (is (= ["tax"] (mapv :id (:dimensions (first batched))))))
      (testing "unresolvable field is conservatively kept on the second metric"
        (is (= ["mystery"] (mapv :id (:dimensions (second batched))))))
      (testing "batch matches mapping the single-metric fn over each"
        (is (= (mt/with-test-user :rasta
                 (mapv metrics.perms/filter-dimensions-for-user [m1 m2]))
               batched))))))

(deftest filter-dimensions-for-user-batch-memoizes-table-access-test
  (testing "table access is checked once per (db,table) across the whole batch, not per dimension"
    (let [fid-tax   (mt/id :orders :tax)
          fid-total (mt/id :orders :total)
          mk        (fn [] {:dimensions         [{:id "d-tax" :sources [{:field-id fid-tax}]}
                                                 {:id "d-total" :sources [{:field-id fid-total}]}]
                            :dimension_mappings [{:dimension_id "d-tax" :target [:field {} fid-tax]}
                                                 {:dimension_id "d-total" :target [:field {} fid-total]}]})
          calls     (atom 0)]
      ;; Two metrics × two dimensions all live on the Orders table -> a single distinct
      ;; (db, table), so the access check must fire exactly once.
      (mt/with-test-user :rasta
        (with-redefs [perms/user-has-permission-for-table? (fn [& _] (swap! calls inc) true)]
          (metrics.perms/filter-dimensions-for-user-batch [(mk) (mk)])))
      (is (= 1 @calls)))))
