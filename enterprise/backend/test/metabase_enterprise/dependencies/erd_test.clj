(ns metabase-enterprise.dependencies.erd-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.erd :as erd]
   [metabase.test :as mt]))

;;; ---------------------------------------- Pure function tests ----------------------------------------

(deftest build-erd-field-test
  (testing "basic field without FK"
    (let [field        {:id 1 :name "id" :display_name "ID"
                        :database_type "INTEGER" :semantic_type :type/PK
                        :fk_target_field_id nil}
          field->table {}]
      (is (= {:id                 1
              :name               "id"
              :display_name       "ID"
              :database_type      "INTEGER"
              :semantic_type      "type/PK"
              :fk_target_field_id nil
              :fk_target_table_id nil}
             (erd/build-erd-field field field->table)))))

  (testing "FK field resolves target table"
    (let [field        {:id 2 :name "product_id" :display_name "Product ID"
                        :database_type "INTEGER" :semantic_type :type/FK
                        :fk_target_field_id 10}
          field->table {10 100}]
      (is (= {:id                 2
              :name               "product_id"
              :display_name       "Product ID"
              :database_type      "INTEGER"
              :semantic_type      "type/FK"
              :fk_target_field_id 10
              :fk_target_table_id 100}
             (erd/build-erd-field field field->table)))))

  (testing "nil semantic_type stays nil"
    (let [field {:id 3 :name "x" :display_name "X"
                 :database_type "TEXT" :semantic_type nil
                 :fk_target_field_id nil}]
      (is (nil? (:semantic_type (erd/build-erd-field field {})))))))

(deftest build-erd-node-test
  (let [table        {:id 1 :name "ORDERS" :display_name "Orders"
                      :schema "PUBLIC" :db_id 1}
        fields       [{:id 10 :name "id" :display_name "ID"
                       :database_type "INTEGER" :semantic_type :type/PK
                       :fk_target_field_id nil}
                      {:id 11 :name "product_id" :display_name "Product ID"
                       :database_type "INTEGER" :semantic_type :type/FK
                       :fk_target_field_id 20}]
        field->table {20 2}
        node         (erd/build-erd-node table fields true field->table)]
    (testing "node has correct table metadata"
      (is (= 1 (:table_id node)))
      (is (= "ORDERS" (:name node)))
      (is (= "Orders" (:display_name node)))
      (is (= "PUBLIC" (:schema node)))
      (is (= 1 (:db_id node)))
      (is (true? (:is_focal node))))

    (testing "node includes all fields"
      (is (= 2 (count (:fields node)))))

    (testing "FK field resolves target table in node context"
      (let [fk-field (second (:fields node))]
        (is (= 2 (:fk_target_table_id fk-field)))))))

(deftest build-erd-edges-test
  (let [;; Table 1 has a FK field (id=11) pointing to table 2's field (id=20)
        fields-by-table {1 [{:id 10 :name "id" :table_id 1
                             :database_type "INTEGER" :semantic_type :type/PK
                             :fk_target_field_id nil :database_is_pk true}
                            {:id 11 :name "product_id" :table_id 1
                             :database_type "INTEGER" :semantic_type :type/FK
                             :fk_target_field_id 20 :database_is_pk false}]
                         2 [{:id 20 :name "id" :table_id 2
                             :database_type "INTEGER" :semantic_type :type/PK
                             :fk_target_field_id nil :database_is_pk true}]}
        field->table    {10 1 11 1 20 2}
        visible-ids     #{1 2}]

    (testing "produces edge for FK relationship"
      (let [edges (erd/build-erd-edges fields-by-table field->table visible-ids)]
        (is (= 1 (count edges)))
        (is (= {:source_table_id 1
                :source_field_id 11
                :target_table_id 2
                :target_field_id 20
                :relationship    "many-to-one"}
               (first edges)))))

    (testing "excludes edges to tables not in visible set"
      (let [edges (erd/build-erd-edges fields-by-table field->table #{1})]
        (is (empty? edges))))

    (testing "one-to-one when both fields are PK"
      (let [fields-both-pk {1 [{:id 11 :name "user_id" :table_id 1
                                :database_type "INTEGER" :semantic_type :type/FK
                                :fk_target_field_id 20 :database_is_pk true}]
                            2 [{:id 20 :name "id" :table_id 2
                                :database_type "INTEGER" :semantic_type :type/PK
                                :fk_target_field_id nil :database_is_pk true}]}
            edges          (erd/build-erd-edges fields-both-pk field->table visible-ids)]
        (is (= "one-to-one" (:relationship (first edges))))))))

(deftest build-erd-response-test
  (let [table1   {:id 1 :name "ORDERS" :display_name "Orders" :schema "PUBLIC" :db_id 1}
        table2   {:id 2 :name "PRODUCTS" :display_name "Products" :schema "PUBLIC" :db_id 1}
        field1   {:id 10 :name "id" :table_id 1 :display_name "ID"
                  :database_type "INT" :semantic_type :type/PK :fk_target_field_id nil}
        field2   {:id 11 :name "product_id" :table_id 1 :display_name "Product ID"
                  :database_type "INT" :semantic_type :type/FK :fk_target_field_id 20}
        field3   {:id 20 :name "id" :table_id 2 :display_name "ID"
                  :database_type "INT" :semantic_type :type/PK :fk_target_field_id nil}
        subgraph {:tables-by-id    {1 table1 2 table2}
                  :fields-by-table {1 [field1 field2] 2 [field3]}
                  :field->table    {10 1 11 1 20 2}
                  :all-table-ids   #{1 2}}
        response (erd/build-erd-response subgraph #{1})]

    (testing "response has nodes and edges"
      (is (= 2 (count (:nodes response))))
      (is (= 1 (count (:edges response)))))

    (testing "focal table is marked correctly"
      (let [nodes-by-id (into {} (map (fn [n] [(:table_id n) n])) (:nodes response))]
        (is (true? (:is_focal (nodes-by-id 1))))
        (is (false? (:is_focal (nodes-by-id 2))))))))

;;; ---------------------------------------- Integration tests (via HTTP) ----------------------------------------

(deftest erd-endpoint-with-explicit-tables-test
  (mt/with-premium-features #{:dependencies}
    (testing "GET /api/ee/dependencies/erd with explicit table-ids"
      (let [orders-id   (mt/id :orders)
            products-id (mt/id :products)
            response    (mt/user-http-request :rasta :get 200 "ee/dependencies/erd"
                                              :database-id (mt/id)
                                              :table-ids   orders-id
                                              :table-ids   products-id
                                              :hops        0)]
        (testing "returns exactly the requested tables when hops=0"
          (is (= #{orders-id products-id}
                 (set (map :table_id (:nodes response))))))

        (testing "all nodes have required keys"
          (doseq [node (:nodes response)]
            (is (contains? node :table_id))
            (is (contains? node :name))
            (is (contains? node :display_name))
            (is (contains? node :db_id))
            (is (contains? node :is_focal))
            (is (contains? node :fields))))

        (testing "focal tables are marked correctly"
          (doseq [node (:nodes response)]
            (is (true? (:is_focal node)))))

        (testing "edges have required keys"
          (doseq [edge (:edges response)]
            (is (contains? edge :source_table_id))
            (is (contains? edge :source_field_id))
            (is (contains? edge :target_table_id))
            (is (contains? edge :target_field_id))
            (is (contains? edge :relationship))))))))

(deftest erd-endpoint-with-hops-test
  (mt/with-premium-features #{:dependencies}
    (testing "GET /api/ee/dependencies/erd with hops expands to related tables"
      (let [orders-id (mt/id :orders)
            response  (mt/user-http-request :rasta :get 200 "ee/dependencies/erd"
                                            :database-id (mt/id)
                                            :table-ids   orders-id
                                            :hops        1)]
        (testing "orders has FKs to products and people, so both should appear"
          (let [table-ids (set (map :table_id (:nodes response)))]
            (is (contains? table-ids orders-id))
            (is (contains? table-ids (mt/id :products)))
            (is (contains? table-ids (mt/id :people)))))

        (testing "orders is focal, related tables are not"
          (let [nodes-by-id (into {} (map (fn [n] [(:table_id n) n])) (:nodes response))]
            (is (true? (:is_focal (nodes-by-id orders-id))))
            (is (false? (:is_focal (nodes-by-id (mt/id :products)))))
            (is (false? (:is_focal (nodes-by-id (mt/id :people)))))))

        (testing "has edges connecting orders to products and people"
          (let [edge-pairs (set (map (fn [e] [(:source_table_id e) (:target_table_id e)])
                                     (:edges response)))]
            (is (contains? edge-pairs [orders-id (mt/id :products)]))
            (is (contains? edge-pairs [orders-id (mt/id :people)]))))))))

(deftest erd-endpoint-auto-discover-test
  (mt/with-premium-features #{:dependencies}
    (testing "GET /api/ee/dependencies/erd auto-discovers focal tables when none specified"
      (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/erd"
                                           :database-id (mt/id))]
        (testing "returns nodes and edges"
          (is (seq (:nodes response)))
          (is (seq (:edges response))))

        (testing "some nodes are focal"
          (is (some :is_focal (:nodes response))))

        (testing "some nodes are non-focal (discovered via hops)"
          (is (some (complement :is_focal) (:nodes response))))))))

(deftest erd-endpoint-hops-zero-test
  (mt/with-premium-features #{:dependencies}
    (testing "hops=0 returns only focal tables with no expansion"
      (let [orders-id (mt/id :orders)
            response  (mt/user-http-request :rasta :get 200 "ee/dependencies/erd"
                                            :database-id (mt/id)
                                            :table-ids   orders-id
                                            :hops        0)]
        (is (= #{orders-id} (set (map :table_id (:nodes response)))))))))

(deftest erd-endpoint-schema-filter-test
  (mt/with-premium-features #{:dependencies}
    (testing "schema param filters auto-discovery to that schema"
      (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/erd"
                                           :database-id (mt/id)
                                           :schema      "PUBLIC")]
        (testing "all nodes belong to the specified schema"
          (doseq [node (:nodes response)]
            (is (= "PUBLIC" (:schema node)))))))))

(deftest erd-endpoint-requires-premium-feature-test
  (testing "without :dependencies feature returns 402"
    (mt/with-premium-features #{}
      (mt/user-http-request :rasta :get 402 "ee/dependencies/erd"
                            :database-id (mt/id)))))

(deftest erd-endpoint-invalid-database-test
  (mt/with-premium-features #{:dependencies}
    (testing "non-existent database returns 404"
      (mt/user-http-request :rasta :get 404 "ee/dependencies/erd"
                            :database-id Integer/MAX_VALUE))))
