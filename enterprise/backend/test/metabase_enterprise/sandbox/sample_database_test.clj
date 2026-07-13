(ns metabase-enterprise.sandbox.sample-database-test
  "Sandboxing (row and column security) against the bundled SQLite Sample Database.

  The shared sandbox helpers in [[metabase-enterprise.sandbox.test-util]] run against the `test-data`
  dataset, not the real Sample Database that ships with Metabase. These tests load the actual bundled
  Sample Database, sync it, and exercise sandboxing end-to-end so we can confirm row/column security still
  works after the H2 -> SQLite engine swap.

  [[doc-walkthrough-row-filter-test]] and [[doc-walkthrough-custom-view-test]] follow the customer-facing
  walkthrough in docs/permissions/row-and-column-security-examples.md step for step, so a failure here means
  the documented path no longer works on the shipped sample data."
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.query-processor :as qp]
   [metabase.request.core :as request]
   [metabase.sample-data.impl :as sample-data]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- do-with-sample-database
  "Call `thunk` with a freshly extracted and synced bundled Sample Database, with the `:sandboxes` premium
  feature enabled."
  [thunk]
  (mt/with-premium-features #{:sandboxes}
    (mt/with-temp [:model/Database db {:details (#'sample-data/try-to-extract-sample-database! :sqlite)
                                       :engine  :sqlite
                                       :name    "Sample Database"}]
      (sync/sync-database! db)
      (thunk db))))

(defn- table-id [db table-name]
  (t2/select-one-pk :model/Table :db_id (:id db) :name table-name))

(defn- field-id [db table-name field-name]
  (t2/select-one-pk :model/Field :table_id (table-id db table-name) :name field-name))

(defn- rows [query]
  (mt/rows (qp/process-query query)))

(defn- col-index [result col-name]
  (first (keep-indexed (fn [i col] (when (= (:name col) col-name) i))
                       (get-in result [:data :cols]))))

;; Cloyd Beer is the example customer used throughout the docs; 2499 is his ID in the People table.
(def ^:private cloyd-user-id 2499)

(deftest baseline-no-sandbox-test
  (testing "Sanity check: without sandboxing, an admin sees the whole Sample Database"
    (do-with-sample-database
     (fn [db]
       (is (= 18760
              (ffirst (rows {:database (:id db) :type :query
                             :query {:source-table (table-id db "ORDERS") :aggregation [[:count]]}}))))
       (is (= 2500
              (ffirst (rows {:database (:id db) :type :query
                             :query {:source-table (table-id db "PEOPLE") :aggregation [[:count]]}}))))))))

(deftest doc-walkthrough-row-filter-test
  (testing "docs/permissions/row-and-column-security-examples.md — 'Filtering rows based on user attributes'"
    (do-with-sample-database
     (fn [db]
       (let [orders-id  (table-id db "ORDERS")
             people-id  (table-id db "PEOPLE")
             orders-uid (field-id db "ORDERS" "USER_ID")
             people-pk  (field-id db "PEOPLE" "ID")]
         (mt/with-temp
           ;; "Create a group called Customers" + "Create a user account for Cloyd Beer" with the
           ;; user_id: 2499 attribute, and add him to the group.
           [:model/PermissionsGroup           group {:name "Customers"}
            :model/User                        user  {:login_attributes {"user_id" cloyd-user-id}}
            :model/PermissionsGroupMembership  _     {:group_id (:id group) :user_id (:id user)}
            ;; "Set View data -> Row and column security ... Filter by a column on this table." for Orders
            ;; (USER_ID) and People (ID), each = the user_id attribute.
            :model/Sandbox _ {:group_id             (:id group)
                              :table_id             orders-id
                              :attribute_remappings {"user_id" [:dimension [:field orders-uid nil]]}}
            :model/Sandbox _ {:group_id             (:id group)
                              :table_id             people-id
                              :attribute_remappings {"user_id" [:dimension [:field people-pk nil]]}}]
           ;; "Block permissions for the All users group" + grant the Customers group granular access.
           (mt/with-no-data-perms-for-all-users!
             (data-perms/set-database-permission! group (:id db) :perms/view-data :unrestricted)
             (data-perms/set-table-permission! group orders-id :perms/create-queries :query-builder)
             (data-perms/set-table-permission! group people-id :perms/create-queries :query-builder)
             (request/with-current-user (:id user)
               (testing "Orders is filtered to only Cloyd's rows"
                 (is (= 17
                        (ffirst (rows {:database (:id db) :type :query
                                       :query {:source-table orders-id :aggregation [[:count]]}}))))
                 (is (= [cloyd-user-id]
                        (map first (rows {:database (:id db) :type :query
                                          :query {:source-table orders-id
                                                  :breakout [[:field orders-uid nil]]}})))))
               (testing "People is filtered to only Cloyd's row"
                 (is (= [cloyd-user-id]
                        (map first (rows {:database (:id db) :type :query
                                          :query {:source-table people-id}})))))))))))))

(deftest doc-walkthrough-custom-view-test
  (testing "docs/permissions/row-and-column-security-examples.md — 'Custom example 2: Filtering rows and columns'"
    (do-with-sample-database
     (fn [db]
       (let [orders-id (table-id db "ORDERS")]
         (mt/with-temp
           [:model/PermissionsGroup           group {:name "Customers"}
            :model/User                        user  {:login_attributes {"user_id" cloyd-user-id}}
            :model/PermissionsGroupMembership  _     {:group_id (:id group) :user_id (:id user)}
            ;; "Create a SQL question with a variable" selecting a subset of columns, WHERE user_id = {{user_id}}.
            :model/Card {card-id :id} {:database_id (:id db)
                                       :dataset_query
                                       {:database (:id db)
                                        :type     :native
                                        :native   {:query (str "SELECT id, created_at, product_id, quantity, total, user_id "
                                                               "FROM orders WHERE user_id = {{user_id}}")
                                                   :template-tags {"user_id" {:name         "user_id"
                                                                              :display-name "User ID"
                                                                              :type         :number}}}}}
            ;; "Use a saved question to create a custom view" + map {{user_id}} to the user_id attribute.
            :model/Sandbox _ {:group_id             (:id group)
                              :table_id             orders-id
                              :card_id              card-id
                              :attribute_remappings {"user_id" [:variable [:template-tag "user_id"]]}}]
           (mt/with-no-data-perms-for-all-users!
             (data-perms/set-database-permission! group (:id db) :perms/view-data :unrestricted)
             (data-perms/set-table-permission! group orders-id :perms/create-queries :query-builder)
             (request/with-current-user (:id user)
               (let [result (qp/process-query {:database (:id db) :type :query
                                               :query {:source-table orders-id}})]
                 (testing "only the columns from the custom view are exposed"
                   (is (= ["ID" "USER_ID" "PRODUCT_ID" "TOTAL" "CREATED_AT" "QUANTITY"]
                          (mapv :name (get-in result [:data :cols])))))
                 (testing "rows are filtered to only Cloyd's orders"
                   (is (= 17 (:row_count result)))
                   (is (= [cloyd-user-id]
                          (distinct (map #(nth % (col-index result "USER_ID")) (mt/rows result)))))))))))))))
