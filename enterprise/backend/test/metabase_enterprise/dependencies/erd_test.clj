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
   :table-ids (coll), :schema, :hops."
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
    (testing "single focal table with hops=1 expands to FK neighbors"
      (is (= {:orders   {:focal true  :fk [:people :products]}
              :people   {:focal false :fk []}
              :products {:focal false :fk []}}
             (graph-shape (erd-request! {:table-ids [(mt/id :orders)]
                                         :hops      1})))))

    (testing "hops=0 returns focal table alone with no edges"
      (is (= {:orders {:focal true :fk []}}
             (graph-shape (erd-request! {:table-ids [(mt/id :orders)]
                                         :hops      0})))))

    (testing "table with no outbound FKs stays isolated regardless of hops"
      (is (= {:products {:focal true :fk []}}
             (graph-shape (erd-request! {:table-ids [(mt/id :products)]
                                         :hops      2})))))))

(deftest erd-graph-multi-focal-test
  (mt/with-premium-features #{:dependencies}
    (testing "two focals sharing an FK target — target discovered once, both have edges"
      (is (= {:orders   {:focal true  :fk [:people :products]}
              :people   {:focal false :fk []}
              :products {:focal false :fk []}
              :reviews  {:focal true  :fk [:products]}}
             (graph-shape (erd-request! {:table-ids [(mt/id :orders) (mt/id :reviews)]
                                         :hops      1})))))

    (testing "when FK target is also focal, is_focal reflects that"
      (is (= {:orders   {:focal true :fk [:people :products]}
              :people   {:focal false :fk []}
              :products {:focal true :fk []}
              :reviews  {:focal true :fk [:products]}}
             (graph-shape (erd-request! {:table-ids [(mt/id :orders) (mt/id :products) (mt/id :reviews)]
                                         :hops      1})))))))

(deftest erd-graph-field-shape-test
  (mt/with-premium-features #{:dependencies}
    (testing "FK fields on nodes carry resolved target IDs, PK fields have nil FK refs"
      (let [response (erd-request! {:table-ids [(mt/id :orders)] :hops 1})
            orders   (first (filter #(= (mt/id :orders) (:table_id %)) (:nodes response)))
            fk-field (first (filter #(= "PRODUCT_ID" (:name %)) (:fields orders)))
            pk-field (first (filter #(= "ID" (:name %)) (:fields orders)))]
        (is (= (mt/id :products :id) (:fk_target_field_id fk-field)))
        (is (= (mt/id :products)     (:fk_target_table_id fk-field)))
        (is (= "type/FK"             (:semantic_type fk-field)))
        (is (nil? (:fk_target_field_id pk-field)))
        (is (nil? (:fk_target_table_id pk-field)))))

    (testing "FK field to excluded table has nil target IDs (no ID leak)"
      (let [response (erd-request! {:table-ids [(mt/id :orders)] :hops 0})]
        (doseq [field (mapcat :fields (:nodes response))
                :when (= "type/FK" (:semantic_type field))]
          (is (nil? (:fk_target_field_id field)))
          (is (nil? (:fk_target_table_id field))))))))

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
                                             :table-ids tid
                                             :hops 1)]
          (is (= {:categories {:focal true :fk [:categories]}}
                 (graph-shape response))))))))

;;; ---------------------------------------- Integration tests ----------------------------------------

(deftest erd-endpoint-hops-clamping-test
  (mt/with-premium-features #{:dependencies}
    (testing "hops > max (5) is clamped — does not error"
      (is (seq (:nodes (erd-request! {:table-ids [(mt/id :orders)]
                                      :hops      99})))))))

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
                                               :table-ids (mt/id :products)
                                               :hops 1)]
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
      ;; Grant: orders + reviews, deny: products
      ;; orders' FK to products is blocked, reviews' FK to products is blocked
      ;; With orders as focal + hops=2, products is unreadable so nothing beyond orders is found
      (mt/with-no-data-perms-for-all-users!
        (mt/with-temp [:model/PermissionsGroup {gid :id} {}]
          (perms/add-user-to-group! (mt/user->id :rasta) gid)
          (grant-table-read! gid (mt/id :orders))
          (grant-table-read! gid (mt/id :reviews))
          (grant-table-read! gid (mt/id :people))
          ;; products is NOT granted — it's the "intermediate" table
          (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/erd"
                                               :database-id (mt/id)
                                               :table-ids (mt/id :orders)
                                               :hops 2)]
            (testing "orders reaches people (readable) but not products (unreadable)"
              (is (= {:orders {:focal true  :fk [:people]}
                      :people {:focal false :fk []}}
                     (graph-shape response))))))))))
