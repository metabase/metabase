(ns ^:mb/driver-tests metabase-enterprise.data-studio.api.table-test
  "Tests for /api/ee/data-studio/table endpoints (enterprise-only: publish-tables, unpublish-tables)."
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.test-utils :refer [without-library]]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest publish-table-test
  (mt/with-premium-features #{:library :audit-app}
    (without-library
     (testing "POST /api/ee/data-studio/table/(un)publish-table"
       (testing "publishes tables into the library-data collection"
         (mt/with-temp [:model/Collection {collection-id :id} {:type collection/library-data-collection-type}]
           (testing "normal users are not allowed to publish"
             (mt/user-http-request :rasta :post 403 "ee/data-studio/table/publish-tables"
                                   {:table_ids [(mt/id :users) (mt/id :venues)]}))
           (let [response (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/publish-tables"
                                                {:table_ids [(mt/id :users) (mt/id :venues)]})]
             (is (=? {:id collection-id} (:target_collection response)))
             (testing "collection_id and is_published are set"
               (is (=? [{:display_name "Users"
                         :collection_id collection-id
                         :is_published true}
                        {:display_name "Venues"
                         :collection_id collection-id
                         :is_published true}]
                       (t2/select :model/Table :id [:in [(mt/id :users) (mt/id :venues)]] {:order-by [:display_name]}))))
             (testing "audit log entries are created for publish"
               (is (=? {:topic :table-publish, :model "Table", :model_id (mt/id :users)}
                       (mt/latest-audit-log-entry "table-publish" (mt/id :users))))
               (is (=? {:topic :table-publish, :model "Table", :model_id (mt/id :venues)}
                       (mt/latest-audit-log-entry "table-publish" (mt/id :venues)))))
             (testing "unpublishing"
               (testing "normal users are not allowed"
                 (mt/user-http-request :rasta :post 403 "ee/data-studio/table/unpublish-tables"
                                       {:table_ids [(mt/id :venues)]}))
               (mt/user-http-request :crowberto :post 204 "ee/data-studio/table/unpublish-tables"
                                     {:table_ids [(mt/id :venues)]})
               (is (=? {:display_name "Venues"
                        :collection_id nil
                        :is_published false}
                       (t2/select-one :model/Table (mt/id :venues))))
               (testing "audit log entry is created for unpublish"
                 (is (=? {:topic :table-unpublish, :model "Table", :model_id (mt/id :venues)}
                         (mt/latest-audit-log-entry "table-unpublish" (mt/id :venues)))))))))
       (testing "deleting the collection unpublishes"
         (is (=? {:display_name "Users"
                  :collection_id nil
                  :is_published false}
                 (t2/select-one :model/Table (mt/id :users))))))
     (testing "returns 404 when no library-data collection exists"
       (is (= "Not found."
              (mt/user-http-request :crowberto :post 404 "ee/data-studio/table/publish-tables"
                                    {:table_ids [(mt/id :users)]}))))
     (testing "returns 409 when multiple library-data collections exist"
       (mt/with-temp [:model/Collection _ {:type collection/library-data-collection-type}
                      :model/Collection _ {:type collection/library-data-collection-type}]
         (is (= "Multiple library-data collections found."
                (mt/user-http-request :crowberto :post 409 "ee/data-studio/table/publish-tables"
                                      {:table_ids [(mt/id :users)]}))))))))

(deftest requests-data-studio-feature-flag-test
  (mt/with-premium-features #{}
    (is (= "Library is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
           (:message (mt/user-http-request :crowberto :post 402 "ee/data-studio/table/publish-tables"
                                           {:table_ids [(mt/id :users)]}))))))

(deftest data-analyst-can-access-endpoints-test
  (mt/with-premium-features #{:library}
    (testing "Data analysts (members of Data Analysts group) can access library endpoints"
      (let [data-analyst-group-id (:id (perms-group/data-analyst))]
        (mt/with-temp [:model/User {analyst-id :id} {:first_name "Data"
                                                     :last_name "Analyst"
                                                     :email "data-analyst@metabase.com"
                                                     :is_data_analyst true}
                       :model/PermissionsGroupMembership _ {:user_id analyst-id :group_id data-analyst-group-id}
                       :model/Database {db-id :id} {}
                       :model/Table {table-id :id} {:db_id db-id}
                       :model/Collection _ {:type collection/library-data-collection-type}]
          (testing "data analyst can publish tables"
            (is (map? (mt/user-http-request analyst-id :post 200 "ee/data-studio/table/publish-tables"
                                            {:table_ids [table-id]}))))
          (testing "data analyst can unpublish tables"
            (is (nil? (mt/user-http-request analyst-id :post 204 "ee/data-studio/table/unpublish-tables"
                                            {:table_ids [table-id]})))))))))

(deftest regular-user-cannot-access-data-studio-test
  (mt/with-premium-features #{:library}
    (testing "Regular users (not in Data Analysts group) cannot access library endpoints"
      (mt/with-temp [:model/User {user-id :id} {:first_name "Regular"
                                                :last_name "User"
                                                :email "regular-user@metabase.com"}
                     :model/Database {db-id :id} {}
                     :model/Table {table-id :id} {:db_id db-id}
                     :model/Collection _ {:type collection/library-data-collection-type}]
        (testing "regular user cannot publish tables"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request user-id :post 403 "ee/data-studio/table/publish-tables"
                                       {:table_ids [table-id]}))))
        (testing "regular user cannot unpublish tables"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request user-id :post 403 "ee/data-studio/table/unpublish-tables"
                                       {:table_ids [table-id]}))))))))

;;; ------------------------------------------ Publish/Unpublish with Dependencies ------------------------------------------

(deftest publish-tables-with-upstream-dependencies-test
  (mt/with-premium-features #{:library}
    (testing "POST /api/ee/data-studio/table/publish-tables publishes upstream dependencies"
      (mt/with-temp [:model/Collection _                      {:type collection/library-data-collection-type}
                     :model/Database   {db-id :id}          {}
                     ;; Products table (upstream)
                     :model/Table      {products-id :id}    {:db_id db-id :name "products" :is_published false}
                     :model/Field      _                    {:table_id products-id :name "id"
                                                             :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field      {prod-name-f :id}    {:table_id products-id :name "name"
                                                             :semantic_type :type/Name :base_type :type/Text}
                     ;; Orders table (depends on products)
                     :model/Table      {orders-id :id}      {:db_id db-id :name "orders" :is_published false}
                     :model/Field      _                    {:table_id orders-id :name "id"
                                                             :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field      {product-fk :id}     {:table_id orders-id :name "product_id"
                                                             :semantic_type :type/FK :base_type :type/Integer}
                     ;; Dimension for FK remapping
                     :model/Dimension  _                    {:field_id product-fk
                                                             :human_readable_field_id prod-name-f
                                                             :type :external}]
        (testing "publishing orders also publishes products (upstream dependency)"
          (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/publish-tables"
                                {:table_ids [orders-id]})
          (are [table-id] (true? (t2/select-one-fn :is_published :model/Table table-id))
            orders-id products-id))))))

(deftest publish-tables-recursive-upstream-test
  (mt/with-premium-features #{:library}
    (testing "POST /api/ee/data-studio/table/publish-tables publishes recursive upstream dependencies"
      (mt/with-temp [:model/Collection _                      {:type collection/library-data-collection-type}
                     :model/Database   {db-id :id}          {}
                     ;; Customers table (upstream of orders)
                     :model/Table      {customers-id :id}   {:db_id db-id :name "customers" :is_published false}
                     :model/Field      _                    {:table_id customers-id :name "id"
                                                             :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field      {cust-name-f :id}    {:table_id customers-id :name "name"
                                                             :semantic_type :type/Name :base_type :type/Text}
                     ;; Orders table (upstream of order_items, downstream of customers)
                     :model/Table      {orders-id :id}      {:db_id db-id :name "orders" :is_published false}
                     :model/Field      _                    {:table_id orders-id :name "id"
                                                             :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field      {order-name-f :id}   {:table_id orders-id :name "name"
                                                             :semantic_type :type/Name :base_type :type/Text}
                     :model/Field      {customer-fk :id}    {:table_id orders-id :name "customer_id"
                                                             :semantic_type :type/FK :base_type :type/Integer}
                     ;; Order items table (downstream of orders)
                     :model/Table      {items-id :id}       {:db_id db-id :name "order_items" :is_published false}
                     :model/Field      _                    {:table_id items-id :name "id"
                                                             :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field      {order-fk :id}       {:table_id items-id :name "order_id"
                                                             :semantic_type :type/FK :base_type :type/Integer}
                     ;; Dimensions for FK remapping
                     :model/Dimension  _                    {:field_id customer-fk
                                                             :human_readable_field_id cust-name-f
                                                             :type :external}
                     :model/Dimension  _                    {:field_id order-fk
                                                             :human_readable_field_id order-name-f
                                                             :type :external}]
        (testing "publishing order_items also publishes orders and customers (recursive upstream)"
          (mt/user-http-request :crowberto :post 200 "ee/data-studio/table/publish-tables"
                                {:table_ids [items-id]})
          (are [table-id] (true? (t2/select-one-fn :is_published :model/Table table-id))
            items-id orders-id customers-id))))))

(deftest unpublish-tables-with-downstream-dependents-test
  (mt/with-premium-features #{:library}
    (testing "POST /api/ee/data-studio/table/unpublish-tables unpublishes downstream dependents"
      (mt/with-temp [:model/Collection {coll-id :id}        {:type collection/library-data-collection-type}
                     :model/Database   {db-id :id}          {}
                     ;; Products table (upstream, published)
                     :model/Table      {products-id :id}    {:db_id db-id :name "products" :is_published true
                                                             :collection_id coll-id}
                     :model/Field      _                    {:table_id products-id :name "id"
                                                             :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field      {prod-name-f :id}    {:table_id products-id :name "name"
                                                             :semantic_type :type/Name :base_type :type/Text}
                     ;; Orders table (depends on products, published)
                     :model/Table      {orders-id :id}      {:db_id db-id :name "orders" :is_published true
                                                             :collection_id coll-id}
                     :model/Field      _                    {:table_id orders-id :name "id"
                                                             :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field      {product-fk :id}     {:table_id orders-id :name "product_id"
                                                             :semantic_type :type/FK :base_type :type/Integer}
                     ;; Dimension for FK remapping
                     :model/Dimension  _                    {:field_id product-fk
                                                             :human_readable_field_id prod-name-f
                                                             :type :external}]
        (testing "unpublishing products also unpublishes orders (downstream dependent)"
          (mt/user-http-request :crowberto :post 204 "ee/data-studio/table/unpublish-tables"
                                {:table_ids [products-id]})
          (are [table-id] (false? (t2/select-one-fn :is_published :model/Table table-id))
            products-id orders-id))))))

(deftest unpublish-tables-recursive-downstream-test
  (mt/with-premium-features #{:library}
    (testing "POST /api/ee/data-studio/table/unpublish-tables unpublishes recursive downstream dependents"
      (mt/with-temp [:model/Collection {coll-id :id}        {:type collection/library-data-collection-type}
                     :model/Database   {db-id :id}          {}
                     ;; Customers table (upstream of orders, published)
                     :model/Table      {customers-id :id}   {:db_id db-id :name "customers" :is_published true
                                                             :collection_id coll-id}
                     :model/Field      _                    {:table_id customers-id :name "id"
                                                             :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field      {cust-name-f :id}    {:table_id customers-id :name "name"
                                                             :semantic_type :type/Name :base_type :type/Text}
                     ;; Orders table (downstream of customers, upstream of items, published)
                     :model/Table      {orders-id :id}      {:db_id db-id :name "orders" :is_published true
                                                             :collection_id coll-id}
                     :model/Field      _                    {:table_id orders-id :name "id"
                                                             :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field      {order-name-f :id}   {:table_id orders-id :name "name"
                                                             :semantic_type :type/Name :base_type :type/Text}
                     :model/Field      {customer-fk :id}    {:table_id orders-id :name "customer_id"
                                                             :semantic_type :type/FK :base_type :type/Integer}
                     ;; Order items table (downstream of orders, published)
                     :model/Table      {items-id :id}       {:db_id db-id :name "order_items" :is_published true
                                                             :collection_id coll-id}
                     :model/Field      _                    {:table_id items-id :name "id"
                                                             :semantic_type :type/PK :base_type :type/Integer}
                     :model/Field      {order-fk :id}       {:table_id items-id :name "order_id"
                                                             :semantic_type :type/FK :base_type :type/Integer}
                     ;; Dimensions for FK remapping
                     :model/Dimension  _                    {:field_id customer-fk
                                                             :human_readable_field_id cust-name-f
                                                             :type :external}
                     :model/Dimension  _                    {:field_id order-fk
                                                             :human_readable_field_id order-name-f
                                                             :type :external}]
        (testing "unpublishing customers also unpublishes orders and order_items (recursive downstream)"
          (mt/user-http-request :crowberto :post 204 "ee/data-studio/table/unpublish-tables"
                                {:table_ids [customers-id]})
          (are [table-id] (false? (t2/select-one-fn :is_published :model/Table table-id))
            customers-id orders-id items-id))))))
