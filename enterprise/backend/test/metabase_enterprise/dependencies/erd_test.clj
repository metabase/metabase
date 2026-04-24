(ns metabase-enterprise.dependencies.erd-test
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.test :as mt]
   [metabase.util :as u]))

;;; ---------------------------------------- Test helpers ----------------------------------------

(defn- graph-shape
  "Distill an ERD response into a readable topology map.
   Returns e.g. {:orders  {:focal true  :fk [:people :products]}
                 :people  {:focal false :fk []}}
   Table names are lowercased keywords, FK targets are sorted."
  [response]
  (let [id->name    (into {} (map (fn [n] [(:table_id n)
                                           (keyword (u/lower-case-en (:name n)))]))
                          (:nodes response))
        edges-by-src (group-by :source_table_id (:edges response))]
    (into (sorted-map)
          (map (fn [node]
                 [(keyword (u/lower-case-en (:name node)))
                  {:focal (:is_focal node)
                   :fk    (vec (sort (keep #(id->name (:target_table_id %))
                                           (edges-by-src (:table_id node)))))}]))
          (:nodes response))))

(defn- erd-request!
  "Make an ERD endpoint request. `opts` is a map with optional keys
   :table-ids (coll), :schema."
  [opts]
  (apply mt/user-http-request :rasta :get 200 "ee/dependencies/erd"
         :database-id (mt/id)
         (mapcat (fn [[k v]]
                   (if (= k :table-ids)
                     (mapcat (fn [tid] [:table-ids tid]) v)
                     [k v]))
                 opts)))

(defn- grant-table-read!
  "Grant view-data + create-queries on a table for a permission group."
  [group-id table-id]
  (data-perms/set-table-permission! group-id table-id :perms/view-data :unrestricted)
  (data-perms/set-table-permission! group-id table-id :perms/create-queries :query-builder))

;;; ---------------------------------------- Graph tests (e2e) ----------------------------------------

;; Sample dataset FK graph:
;;   orders → products  (via product_id)
;;   orders → people    (via user_id)
;;   reviews → products (via product_id)

(deftest erd-graph-single-focal-test
  (mt/with-premium-features #{:dependencies}
    (testing "single focal table expands to FK neighbors"
      (is (= {:orders   {:focal true  :fk [:people :products]}
              :people   {:focal false :fk []}
              :products {:focal false :fk []}}
             (graph-shape (erd-request! {:table-ids [(mt/id :orders)]})))))

    (testing "table with no outbound FKs stays isolated"
      (is (= {:products {:focal true :fk []}}
             (graph-shape (erd-request! {:table-ids [(mt/id :products)]})))))))

(deftest erd-graph-multi-focal-test
  (mt/with-premium-features #{:dependencies}
    (testing "two focals sharing an FK target — target discovered once, both have edges"
      (is (= {:orders   {:focal true  :fk [:people :products]}
              :people   {:focal false :fk []}
              :products {:focal false :fk []}
              :reviews  {:focal true  :fk [:products]}}
             (graph-shape (erd-request! {:table-ids [(mt/id :orders) (mt/id :reviews)]})))))

    (testing "when FK target is also focal, is_focal reflects that"
      (is (= {:orders   {:focal true :fk [:people :products]}
              :people   {:focal false :fk []}
              :products {:focal true :fk []}
              :reviews  {:focal true :fk [:products]}}
             (graph-shape (erd-request! {:table-ids [(mt/id :orders) (mt/id :products) (mt/id :reviews)]})))))))

(deftest erd-graph-field-shape-test
  (mt/with-premium-features #{:dependencies}
    (testing "FK fields on nodes carry resolved target IDs, PK fields have nil FK refs"
      (let [response (erd-request! {:table-ids [(mt/id :orders)]})
            orders   (first (filter #(= (mt/id :orders) (:table_id %)) (:nodes response)))
            fk-field (first (filter #(= "PRODUCT_ID" (:name %)) (:fields orders)))
            pk-field (first (filter #(= "ID" (:name %)) (:fields orders)))]
        (is (= (mt/id :products :id) (:fk_target_field_id fk-field)))
        (is (= (mt/id :products)     (:fk_target_table_id fk-field)))
        (is (= "type/FK"             (:semantic_type fk-field)))
        (is (nil? (:fk_target_field_id pk-field)))
        (is (nil? (:fk_target_table_id pk-field)))))))

(deftest erd-external-fk-target-resolution-test
  (mt/with-premium-features #{:dependencies}
    (testing "FK field pointing to a readable table beyond the hop budget still carries the target IDs"
      ;; Chain A → B → C. Focal = A, default hops loads A + B. C lives one
      ;; hop past the budget but is readable — B's FK field must still surface
      ;; C's table/field IDs so the frontend can offer to expand to it.
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table {c-id :id} {:db_id db-id :name "c" :schema "PUBLIC"}
                     :model/Field {c-pk-id :id} {:table_id c-id :name "id"
                                                 :database_type "INTEGER" :base_type :type/Integer
                                                 :semantic_type :type/PK}
                     :model/Table {b-id :id} {:db_id db-id :name "b" :schema "PUBLIC"}
                     :model/Field {b-pk-id :id} {:table_id b-id :name "id"
                                                 :database_type "INTEGER" :base_type :type/Integer
                                                 :semantic_type :type/PK}
                     :model/Field {b-c-id :id} {:table_id b-id :name "c_id"
                                                :database_type "INTEGER" :base_type :type/Integer
                                                :semantic_type :type/FK
                                                :fk_target_field_id c-pk-id}
                     :model/Table {a-id :id} {:db_id db-id :name "a" :schema "PUBLIC"}
                     :model/Field _ {:table_id a-id :name "id"
                                     :database_type "INTEGER" :base_type :type/Integer
                                     :semantic_type :type/PK}
                     :model/Field _ {:table_id a-id :name "b_id"
                                     :database_type "INTEGER" :base_type :type/Integer
                                     :semantic_type :type/FK
                                     :fk_target_field_id b-pk-id}]
        (let [response      (mt/user-http-request :rasta :get 200 "ee/dependencies/erd"
                                                  :database-id db-id
                                                  :table-ids a-id)
              nodes-by-name (into {} (map (juxt :name identity)) (:nodes response))
              b-node        (get nodes-by-name "b")
              c-id-field    (first (filter #(= b-c-id (:id %)) (:fields b-node)))]
          (is (contains? nodes-by-name "a"))
          (is (contains? nodes-by-name "b"))
          (is (not (contains? nodes-by-name "c"))
              "c lives beyond the default hop budget and should not be a node")
          (is (= c-id (:fk_target_table_id c-id-field))
              "c_id FK field should carry the external table ID")
          (is (= c-pk-id (:fk_target_field_id c-id-field))
              "c_id FK field should carry the external target field ID"))))))

(deftest erd-schema-boundary-stops-bfs-test
  (mt/with-premium-features #{:dependencies}
    (testing "BFS does not cross the schema boundary; cross-schema FK targets surface as IDs only"
      ;; public.a has FK to erd.b. When the user views schema=public, b must
      ;; not be loaded as a node, but a.b_id must still carry b's table/field IDs
      ;; so the frontend can expand on click.
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table {b-id :id} {:db_id db-id :name "b" :schema "erd"}
                     :model/Field {b-pk-id :id} {:table_id b-id :name "id"
                                                 :database_type "INTEGER" :base_type :type/Integer
                                                 :semantic_type :type/PK}
                     :model/Table {a-id :id} {:db_id db-id :name "a" :schema "public"}
                     :model/Field _ {:table_id a-id :name "id"
                                     :database_type "INTEGER" :base_type :type/Integer
                                     :semantic_type :type/PK}
                     :model/Field {a-b-id :id} {:table_id a-id :name "b_id"
                                                :database_type "INTEGER" :base_type :type/Integer
                                                :semantic_type :type/FK
                                                :fk_target_field_id b-pk-id}]
        (let [response      (mt/user-http-request :rasta :get 200 "ee/dependencies/erd"
                                                  :database-id db-id
                                                  :table-ids a-id
                                                  :schema "public")
              nodes-by-name (into {} (map (juxt :name identity)) (:nodes response))
              a-node        (get nodes-by-name "a")
              b-id-field    (first (filter #(= a-b-id (:id %)) (:fields a-node)))]
          (is (contains? nodes-by-name "a"))
          (is (not (contains? nodes-by-name "b"))
              "cross-schema FK target should not be loaded as a node")
          (is (empty? (:edges response))
              "no edge emitted to a non-node")
          (is (= b-id (:fk_target_table_id b-id-field))
              "b_id FK field should carry the cross-schema table ID")
          (is (= b-pk-id (:fk_target_field_id b-id-field))
              "b_id FK field should carry the cross-schema target field ID"))))

    (testing "explicit cross-schema focal tables are loaded regardless of schema filter"
      ;; User clicks to expand to erd.b → frontend sends table-ids=[a, b]
      ;; while still in schema=public view. b must still be loaded as a node.
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table {b-id :id} {:db_id db-id :name "b" :schema "erd"}
                     :model/Field {b-pk-id :id} {:table_id b-id :name "id"
                                                 :database_type "INTEGER" :base_type :type/Integer
                                                 :semantic_type :type/PK}
                     :model/Table {a-id :id} {:db_id db-id :name "a" :schema "public"}
                     :model/Field _ {:table_id a-id :name "id"
                                     :database_type "INTEGER" :base_type :type/Integer
                                     :semantic_type :type/PK}
                     :model/Field _ {:table_id a-id :name "b_id"
                                     :database_type "INTEGER" :base_type :type/Integer
                                     :semantic_type :type/FK
                                     :fk_target_field_id b-pk-id}]
        (let [response      (mt/user-http-request :rasta :get 200 "ee/dependencies/erd"
                                                  :database-id db-id
                                                  :table-ids a-id
                                                  :table-ids b-id
                                                  :schema "public")
              nodes-by-name (into {} (map (juxt :name identity)) (:nodes response))]
          (is (contains? nodes-by-name "a"))
          (is (contains? nodes-by-name "b")
              "explicitly-focal cross-schema table should be loaded as a node"))))))

(deftest erd-graph-self-referential-fk-test
  (mt/with-premium-features #{:dependencies}
    (testing "self-referential FK produces edge from table to itself"
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table    {tid :id}   {:db_id db-id :name "categories" :schema "PUBLIC"}
                     :model/Field    {pk-id :id} {:table_id tid :name "id"
                                                  :database_type "INTEGER" :base_type :type/Integer
                                                  :semantic_type :type/PK}
                     :model/Field    _            {:table_id tid :name "parent_id"
                                                   :database_type "INTEGER" :base_type :type/Integer
                                                   :semantic_type :type/FK
                                                   :fk_target_field_id pk-id}]
        (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/erd"
                                             :database-id db-id
                                             :table-ids tid)]
          (is (= {:categories {:focal true :fk [:categories]}}
                 (graph-shape response))))))))

;;; ---------------------------------------- Integration tests ----------------------------------------

(deftest erd-endpoint-auto-discover-test
  (mt/with-premium-features #{:dependencies}
    (testing "auto-discovers focal tables when none specified"
      (let [shape (graph-shape (erd-request! {}))]
        (is (some (fn [[_ v]] (:focal v)) shape))
        (is (some (fn [[_ v]] (not (:focal v))) shape))))))

(deftest erd-endpoint-schema-filter-test
  (mt/with-premium-features #{:dependencies}
    (testing "schema param filters auto-discovery to that schema"
      (doseq [node (:nodes (erd-request! {:schema "PUBLIC"}))]
        (is (= "PUBLIC" (:schema node)))))))

(deftest erd-endpoint-guard-rails-test
  (testing "without :dependencies feature returns 402"
    (mt/with-premium-features #{}
      (mt/user-http-request :rasta :get 402 "ee/dependencies/erd"
                            :database-id (mt/id))))

  (mt/with-premium-features #{:dependencies}
    (testing "non-existent database returns 404"
      (mt/user-http-request :rasta :get 404 "ee/dependencies/erd"
                            :database-id Integer/MAX_VALUE))))

;;; ---------------------------------------- Permission graph tests ----------------------------------------

;; These tests verify that the graph topology changes correctly under
;; different permission scenarios. We use with-no-data-perms-for-all-users!
;; to revoke everything, then selectively grant table-level access.

(deftest erd-permissions-unreadable-table-excluded-test
  (mt/with-premium-features #{:dependencies}
    (testing "unreadable table is excluded from graph, edges, and FK fields"
      (mt/with-no-data-perms-for-all-users!
        (mt/with-temp [:model/PermissionsGroup {gid :id} {}]
          (perms/add-user-to-group! (mt/user->id :rasta) gid)
          ;; Grant orders only — products is unreachable
          (grant-table-read! gid (mt/id :orders))
          (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/erd"
                                               :database-id (mt/id)
                                               :table-ids (mt/id :orders)
                                               :table-ids (mt/id :products))]
            (testing "graph shows orders alone, no FK edges"
              (is (= {:orders {:focal true :fk []}}
                     (graph-shape response))))
            (testing "no FK field leaks IDs of excluded tables"
              (doseq [field (mapcat :fields (:nodes response))
                      :when (:fk_target_table_id field)]
                (is (contains? (set (map :table_id (:nodes response)))
                               (:fk_target_table_id field)))))))))))

(deftest erd-permissions-intermediate-table-blocks-bfs-test
  (mt/with-premium-features #{:dependencies}
    (testing "unreadable intermediate table blocks BFS — downstream tables are not discovered"
      ;; Graph: orders → products, reviews → products
      ;; Grant: orders + reviews + people, deny: products
      ;; orders' FK to products is blocked, reviews' FK to products is blocked
      ;; With orders as focal, products is unreadable so nothing beyond orders+people is found
      (mt/with-no-data-perms-for-all-users!
        (mt/with-temp [:model/PermissionsGroup {gid :id} {}]
          (perms/add-user-to-group! (mt/user->id :rasta) gid)
          (grant-table-read! gid (mt/id :orders))
          (grant-table-read! gid (mt/id :reviews))
          (grant-table-read! gid (mt/id :people))
          ;; products is NOT granted — it's the "intermediate" table
          (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/erd"
                                               :database-id (mt/id)
                                               :table-ids (mt/id :orders))]
            (testing "orders reaches people (readable) but not products (unreadable)"
              (is (= {:orders {:focal true  :fk [:people]}
                      :people {:focal false :fk []}}
                     (graph-shape response))))))))))
