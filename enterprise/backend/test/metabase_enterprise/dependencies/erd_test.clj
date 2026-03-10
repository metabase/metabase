(ns metabase-enterprise.dependencies.erd-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.erd :as erd]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.test :as mt]))

;;; ---------------------------------------- Pure function tests ----------------------------------------

(defn- ->field-by-id
  "Build a field-by-id map from a collection of fields."
  [fields]
  (into {} (map (fn [f] [(:id f) f])) fields))

(deftest ^:parallel build-erd-field-test
  (testing "basic field without FK"
    (let [field {:id 1 :name "id" :display_name "ID"
                 :database_type "INTEGER" :semantic_type :type/PK
                 :fk_target_field_id nil}]
      (is (= {:id                 1
              :name               "id"
              :display_name       "ID"
              :database_type      "INTEGER"
              :semantic_type      "type/PK"
              :fk_target_field_id nil
              :fk_target_table_id nil}
             (erd/build-erd-field field {})))))

  (testing "FK field resolves target table"
    (let [field        {:id 2 :name "product_id" :display_name "Product ID"
                        :database_type "INTEGER" :semantic_type :type/FK
                        :fk_target_field_id 10}
          target-field {:id 10 :name "id" :table_id 100}
          field-by-id  (->field-by-id [target-field])]
      (is (= {:id                 2
              :name               "product_id"
              :display_name       "Product ID"
              :database_type      "INTEGER"
              :semantic_type      "type/FK"
              :fk_target_field_id 10
              :fk_target_table_id 100}
             (erd/build-erd-field field field-by-id)))))

  (testing "nil semantic_type stays nil"
    (let [field {:id 3 :name "x" :display_name "X"
                 :database_type "TEXT" :semantic_type nil
                 :fk_target_field_id nil}]
      (is (nil? (:semantic_type (erd/build-erd-field field {}))))))

  (testing "FK target not in visible graph nils out both FK references"
    (let [field  {:id 2 :name "product_id" :display_name "Product ID"
                  :database_type "INTEGER" :semantic_type :type/FK
                  :fk_target_field_id 10}
          result (erd/build-erd-field field {})]
      (is (nil? (:fk_target_field_id result)))
      (is (nil? (:fk_target_table_id result))))))

(deftest ^:parallel build-erd-node-test
  (testing "focal node with fields"
    (let [table       {:id 1 :name "ORDERS" :display_name "Orders"
                       :schema "PUBLIC" :db_id 1}
          fields      [{:id 10 :name "id" :display_name "ID"
                        :database_type "INTEGER" :semantic_type :type/PK
                        :fk_target_field_id nil}
                       {:id 11 :name "product_id" :display_name "Product ID"
                        :database_type "INTEGER" :semantic_type :type/FK
                        :fk_target_field_id 20}]
          field-by-id (->field-by-id [{:id 20 :name "id" :table_id 2}])
          node        (erd/build-erd-node table fields true field-by-id)]
      (is (= {:table_id 1 :name "ORDERS" :display_name "Orders"
              :schema "PUBLIC" :db_id 1 :is_focal true}
             (dissoc node :fields)))
      (is (= 2 (count (:fields node))))
      (is (= 2 (:fk_target_table_id (second (:fields node)))))))

  (testing "non-focal node"
    (let [table {:id 2 :name "PRODUCTS" :display_name "Products"
                 :schema "PUBLIC" :db_id 1}
          node  (erd/build-erd-node table [] false {})]
      (is (false? (:is_focal node)))))

  (testing "table with no fields produces empty fields vector"
    (let [table {:id 3 :name "EMPTY" :display_name "Empty" :schema nil :db_id 1}
          node  (erd/build-erd-node table [] true {})]
      (is (= [] (:fields node))))))

(deftest ^:parallel build-erd-edges-test
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
        field-by-id     (->field-by-id (mapcat val fields-by-table))
        visible-ids     #{1 2}]

    (testing "produces edge for FK relationship"
      (let [edges (erd/build-erd-edges fields-by-table field-by-id visible-ids)]
        (is (= 1 (count edges)))
        (is (= {:source_table_id 1
                :source_field_id 11
                :target_table_id 2
                :target_field_id 20
                :relationship    "many-to-one"}
               (first edges)))))

    (testing "excludes edges when target table not in visible set"
      (is (empty? (erd/build-erd-edges fields-by-table field-by-id #{1}))))

    (testing "excludes edges when source table not in visible set"
      (is (empty? (erd/build-erd-edges fields-by-table field-by-id #{2}))))

    (testing "empty fields-by-table produces no edges"
      (is (empty? (erd/build-erd-edges {} field-by-id visible-ids))))

    (testing "one-to-one when both fields are PK"
      (let [fields-both-pk {1 [{:id 11 :name "user_id" :table_id 1
                                :database_type "INTEGER" :semantic_type :type/FK
                                :fk_target_field_id 20 :database_is_pk true}]
                            2 [{:id 20 :name "id" :table_id 2
                                :database_type "INTEGER" :semantic_type :type/PK
                                :fk_target_field_id nil :database_is_pk true}]}
            field-by-id-pk (->field-by-id (mapcat val fields-both-pk))
            edges          (erd/build-erd-edges fields-both-pk field-by-id-pk visible-ids)]
        (is (= "one-to-one" (:relationship (first edges))))))))

(deftest ^:parallel build-erd-response-test
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
                  :field-by-id     (->field-by-id [field1 field2 field3])
                  :all-table-ids   #{1 2}}]

    (testing "response has nodes and edges"
      (let [response (erd/build-erd-response subgraph #{1})]
        (is (= 2 (count (:nodes response))))
        (is (= 1 (count (:edges response))))))

    (testing "focal table is marked correctly"
      (let [nodes-by-id (->> (erd/build-erd-response subgraph #{1})
                             :nodes
                             (into {} (map (fn [n] [(:table_id n) n]))))]
        (is (true? (:is_focal (nodes-by-id 1))))
        (is (false? (:is_focal (nodes-by-id 2))))))

    (testing "focal table not in tables-by-id is silently excluded"
      (let [response (erd/build-erd-response subgraph #{1 999})]
        (is (= 2 (count (:nodes response))))
        (is (true? (:is_focal (first (filter #(= 1 (:table_id %)) (:nodes response))))))))))

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

(deftest erd-endpoint-multi-hop-test
  (mt/with-premium-features #{:dependencies}
    (testing "hops=2 from orders reaches tables two hops away via outbound FKs"
      ;; orders → products (hop 1), orders → people (hop 1)
      ;; products and people have no outbound FKs, so hop 2 discovers nothing new
      (let [orders-id (mt/id :orders)
            response  (mt/user-http-request :rasta :get 200 "ee/dependencies/erd"
                                            :database-id (mt/id)
                                            :table-ids   orders-id
                                            :hops        2)
            table-ids (set (map :table_id (:nodes response)))]
        (is (contains? table-ids orders-id))
        (is (contains? table-ids (mt/id :products)))
        (is (contains? table-ids (mt/id :people)))))

    (testing "BFS only follows outbound FKs — a table with no FKs expands to nothing"
      (let [products-id (mt/id :products)
            response    (mt/user-http-request :rasta :get 200 "ee/dependencies/erd"
                                              :database-id (mt/id)
                                              :table-ids   products-id
                                              :hops        2)
            table-ids   (set (map :table_id (:nodes response)))]
        (is (= #{products-id} table-ids))))))

(deftest erd-endpoint-hops-clamped-test
  (mt/with-premium-features #{:dependencies}
    (testing "hops > max (5) is clamped — does not error or run unbounded"
      (let [orders-id (mt/id :orders)
            response  (mt/user-http-request :rasta :get 200 "ee/dependencies/erd"
                                            :database-id (mt/id)
                                            :table-ids   orders-id
                                            :hops        99)]
        (is (seq (:nodes response)))))))

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

;;; ---------------------------------------- Permission tests ----------------------------------------

(deftest erd-endpoint-excludes-unreadable-tables-test
  (mt/with-premium-features #{:dependencies}
    (testing "tables the user cannot read are excluded from ERD results"
      (let [orders-id   (mt/id :orders)
            products-id (mt/id :products)]
        (mt/with-no-data-perms-for-all-users!
          (mt/with-temp [:model/PermissionsGroup {group-id :id} {}]
            (perms/add-user-to-group! (mt/user->id :rasta) group-id)
            ;; Grant access to orders only — not products
            (data-perms/set-table-permission! group-id orders-id :perms/view-data :unrestricted)
            (data-perms/set-table-permission! group-id orders-id :perms/create-queries :query-builder)
            (let [response  (mt/user-http-request :rasta :get 200 "ee/dependencies/erd"
                                                  :database-id (mt/id)
                                                  :table-ids   orders-id
                                                  :table-ids   products-id
                                                  :hops        1)
                  table-ids (set (map :table_id (:nodes response)))]
              (testing "orders is included (user has access)"
                (is (contains? table-ids orders-id)))
              (testing "products is excluded (user lacks access)"
                (is (not (contains? table-ids products-id))))
              (testing "no edges reference the excluded table"
                (doseq [edge (:edges response)]
                  (is (not= products-id (:source_table_id edge)))
                  (is (not= products-id (:target_table_id edge)))))
              (testing "FK fields pointing to excluded tables have nil target IDs"
                (let [all-fields (mapcat :fields (:nodes response))]
                  (doseq [field all-fields
                          :when (some? (:fk_target_table_id field))]
                    (is (contains? table-ids (:fk_target_table_id field)))))))))))))
