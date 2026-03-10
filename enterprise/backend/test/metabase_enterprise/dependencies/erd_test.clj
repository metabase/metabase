(ns metabase-enterprise.dependencies.erd-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.erd :as erd]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.test :as mt]))

;;; ---------------------------------------- Test helpers ----------------------------------------

(defn- ->field-by-id
  "Build a field-by-id map from a collection of fields."
  [fields]
  (into {} (map (fn [f] [(:id f) f])) fields))

(defn- node-by-table
  "Find an ERD node by table keyword (e.g. :orders) or table ID."
  [response table-or-id]
  (let [tid (if (keyword? table-or-id) (mt/id table-or-id) table-or-id)]
    (some #(when (= tid (:table_id %)) %) (:nodes response))))

(defn- edge-between
  "Find an ERD edge from source to target (keywords or IDs)."
  [response source-table target-table]
  (let [src (if (keyword? source-table) (mt/id source-table) source-table)
        tgt (if (keyword? target-table) (mt/id target-table) target-table)]
    (some #(when (and (= src (:source_table_id %))
                      (= tgt (:target_table_id %)))
             %)
          (:edges response))))

(defn- table-ids
  "Set of all table IDs in an ERD response."
  [response]
  (set (map :table_id (:nodes response))))

(defn- erd-request!
  "Make an ERD endpoint request. `opts` is a map with optional keys
   :table-ids (coll), :schema, :hops."
  [opts]
  (apply mt/user-http-request :rasta :get 200 "ee/dependencies/erd"
         :database-id (mt/id)
         (mapcat (fn [[k v]]
                   (if (= k :table-ids)
                     (mapcat (fn [tid] [:table-ids tid]) v)
                     [k v]))
                 opts)))

;;; ---------------------------------------- Pure function tests ----------------------------------------

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
    (testing "GET /api/ee/dependencies/erd with explicit table-ids, hops=0"
      (let [response (erd-request! {:table-ids [(mt/id :orders) (mt/id :products)]
                                    :hops      0})]
        (testing "returns exactly the requested focal tables"
          (is (= #{(mt/id :orders) (mt/id :products)} (table-ids response))))

        (testing "nodes have correct shape"
          (is (=? {:table_id     (mt/id :orders)
                   :name         "ORDERS"
                   :display_name "Orders"
                   :db_id        (mt/id)
                   :schema       "PUBLIC"
                   :is_focal     true
                   :fields       sequential?}
                  (node-by-table response :orders)))
          (is (=? {:table_id (mt/id :products)
                   :is_focal true}
                  (node-by-table response :products))))

        (testing "each field has the expected shape"
          (is (=? {:id                 pos-int?
                   :name               string?
                   :display_name       string?
                   :database_type      string?}
                  (first (:fields (node-by-table response :orders))))))))))

(deftest erd-endpoint-with-hops-test
  (mt/with-premium-features #{:dependencies}
    (testing "hops=1 from orders expands to products and people via outbound FKs"
      (let [response (erd-request! {:table-ids [(mt/id :orders)]
                                    :hops      1})]
        (testing "focal + related tables present"
          (is (=? {:table_id (mt/id :orders)  :is_focal true}  (node-by-table response :orders)))
          (is (=? {:table_id (mt/id :products) :is_focal false} (node-by-table response :products)))
          (is (=? {:table_id (mt/id :people)   :is_focal false} (node-by-table response :people))))

        (testing "edges connect orders to its FK targets"
          (is (=? {:source_table_id (mt/id :orders)
                   :target_table_id (mt/id :products)
                   :relationship    "many-to-one"}
                  (edge-between response :orders :products)))
          (is (=? {:source_table_id (mt/id :orders)
                   :target_table_id (mt/id :people)
                   :relationship    "many-to-one"}
                  (edge-between response :orders :people))))))))

(deftest erd-endpoint-multi-hop-test
  (mt/with-premium-features #{:dependencies}
    (testing "hops=2 from orders reaches tables two hops away via outbound FKs"
      ;; orders → products (hop 1), orders → people (hop 1)
      ;; products and people have no outbound FKs, so hop 2 discovers nothing new
      (let [response (erd-request! {:table-ids [(mt/id :orders)]
                                    :hops      2})]
        (is (=? {:is_focal true}  (node-by-table response :orders)))
        (is (=? {:is_focal false} (node-by-table response :products)))
        (is (=? {:is_focal false} (node-by-table response :people)))))

    (testing "BFS only follows outbound FKs — a table with no FKs expands to nothing"
      (let [response (erd-request! {:table-ids [(mt/id :products)]
                                    :hops      2})]
        (is (= #{(mt/id :products)} (table-ids response)))))))

(deftest erd-endpoint-hops-clamped-test
  (mt/with-premium-features #{:dependencies}
    (testing "hops > max (5) is clamped — does not error or run unbounded"
      (let [response (erd-request! {:table-ids [(mt/id :orders)]
                                    :hops      99})]
        (is (seq (:nodes response)))))))

(deftest erd-endpoint-auto-discover-test
  (mt/with-premium-features #{:dependencies}
    (testing "auto-discovers focal tables when none specified"
      (let [response (erd-request! {})]
        (is (seq (:nodes response)))
        (is (seq (:edges response)))
        (is (some :is_focal (:nodes response)))
        (is (some (complement :is_focal) (:nodes response)))))))

(deftest erd-endpoint-hops-zero-test
  (mt/with-premium-features #{:dependencies}
    (testing "hops=0 returns only focal tables with no expansion"
      (let [response (erd-request! {:table-ids [(mt/id :orders)]
                                    :hops      0})]
        (is (= #{(mt/id :orders)} (table-ids response)))))))

(deftest erd-endpoint-schema-filter-test
  (mt/with-premium-features #{:dependencies}
    (testing "schema param filters auto-discovery to that schema"
      (let [response (erd-request! {:schema "PUBLIC"})]
        (doseq [node (:nodes response)]
          (is (= "PUBLIC" (:schema node))))))))

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
            (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/erd"
                                                 :database-id (mt/id)
                                                 :table-ids   orders-id
                                                 :table-ids   products-id
                                                 :hops        1)]
              (testing "orders is included, products is excluded"
                (is (some? (node-by-table response orders-id)))
                (is (nil?  (node-by-table response products-id))))
              (testing "no edges reference the excluded table"
                (doseq [edge (:edges response)]
                  (is (not= products-id (:source_table_id edge)))
                  (is (not= products-id (:target_table_id edge)))))
              (testing "FK fields pointing to excluded tables have nil target IDs"
                (doseq [field (mapcat :fields (:nodes response))
                        :when (some? (:fk_target_table_id field))]
                  (is (contains? (table-ids response) (:fk_target_table_id field))))))))))))
