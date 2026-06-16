(ns metabase-enterprise.erd.erd-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.test :as mt]
   [metabase.util :as u]))

;;; ---------------------------------------- Test helpers ----------------------------------------

(defn- graph-shape
  "Distill an ERD response into a readable topology map.
   Returns e.g. {:orders  [:people :products]
                 :people  []}
   Table names are lowercased keywords, FK targets are sorted."
  [response]
  (let [id->name    (into {} (map (fn [n] [(:table_id n)
                                           (keyword (u/lower-case-en (:name n)))]))
                          (:nodes response))
        edges-by-src (group-by :source_table_id (:edges response))]
    (into (sorted-map)
          (map (fn [node]
                 [(keyword (u/lower-case-en (:name node)))
                  (vec (sort (keep #(id->name (:target_table_id %))
                                   (edges-by-src (:table_id node)))))]))
          (:nodes response))))

(defn- erd-request!
  "Make an ERD endpoint request. `opts` is a map with optional keys
   :table-ids (coll), :schema."
  [opts]
  (apply mt/user-http-request :rasta :get 200 "ee/erd"
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
  (mt/with-premium-features #{:schema-viewer}
    (testing "single focal table expands to FK neighbors"
      (is (= {:orders   [:people :products]
              :people   []
              :products []}
             (graph-shape (erd-request! {:table-ids [(mt/id :orders)]})))))
    (testing "table with no outbound FKs stays isolated"
      (is (= {:products []}
             (graph-shape (erd-request! {:table-ids [(mt/id :products)]})))))))

(deftest erd-graph-multi-focal-test
  (mt/with-premium-features #{:schema-viewer}
    (testing "two focals sharing an FK target — target discovered once, both have edges"
      (is (= {:orders   [:people :products]
              :people   []
              :products []
              :reviews  [:products]}
             (graph-shape (erd-request! {:table-ids [(mt/id :orders) (mt/id :reviews)]})))))
    (testing "selecting an FK target as focal too doesn't duplicate it"
      (is (= {:orders   [:people :products]
              :people   []
              :products []
              :reviews  [:products]}
             (graph-shape (erd-request! {:table-ids [(mt/id :orders) (mt/id :products) (mt/id :reviews)]})))))))

(deftest erd-graph-field-shape-test
  (mt/with-premium-features #{:schema-viewer}
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

(deftest erd-graph-field-order-test
  (mt/with-premium-features #{:schema-viewer}
    (testing "fields come back ordered by [position asc, lower(name) asc] — same as /api/table/:id/query_metadata"
      ;; Insertion order deliberately scrambled relative to the expected order so
      ;; an unsorted DB read would not accidentally pass. `position` is the primary
      ;; key; `lower(name)` breaks ties (and proves the sort is case-insensitive).
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table {tid :id} {:db_id db-id :name "t" :schema "PUBLIC"}
                     :model/Field _ {:table_id tid :name "zulu"   :position 2
                                     :database_type "INTEGER" :base_type :type/Integer}
                     :model/Field _ {:table_id tid :name "Bravo"  :position 1
                                     :database_type "INTEGER" :base_type :type/Integer}
                     :model/Field _ {:table_id tid :name "alpha"  :position 1
                                     :database_type "INTEGER" :base_type :type/Integer}
                     :model/Field _ {:table_id tid :name "yankee" :position 0
                                     :database_type "INTEGER" :base_type :type/Integer}]
        (let [response (mt/user-http-request :rasta :get 200 "ee/erd"
                                             :database-id db-id
                                             :table-ids tid)
              node     (first (filter #(= tid (:table_id %)) (:nodes response)))]
          (is (= ["yankee" "alpha" "Bravo" "zulu"]
                 (mapv :name (:fields node)))))))))

(deftest erd-external-fk-target-resolution-test
  (mt/with-premium-features #{:schema-viewer}
    (testing "FK field pointing to a readable table beyond the hop budget still carries the target IDs"
      ;; Chain A → B → C. Focal = A, one-layer expansion loads A + B. C is
      ;; outside the loaded node set but readable — B's FK field must still surface
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
        (let [response      (mt/user-http-request :rasta :get 200 "ee/erd"
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
  (mt/with-premium-features #{:schema-viewer}
    (testing "one-layer FK expansion does not cross the schema boundary; cross-schema FK targets surface as IDs only"
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
        (let [response      (mt/user-http-request :rasta :get 200 "ee/erd"
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
        (let [response      (mt/user-http-request :rasta :get 200 "ee/erd"
                                                  :database-id db-id
                                                  :table-ids a-id
                                                  :table-ids b-id
                                                  :schema "public")
              nodes-by-name (into {} (map (juxt :name identity)) (:nodes response))]
          (is (contains? nodes-by-name "a"))
          (is (contains? nodes-by-name "b")
              "explicitly-focal cross-schema table should be loaded as a node"))))))

(deftest erd-graph-self-referential-fk-test
  (mt/with-premium-features #{:schema-viewer}
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
        (let [response (mt/user-http-request :rasta :get 200 "ee/erd"
                                             :database-id db-id
                                             :table-ids tid)]
          (is (= {:categories [:categories]}
                 (graph-shape response))))))))

;;; ---------------------------------------- Integration tests ----------------------------------------

(deftest erd-endpoint-schema-filter-test
  (mt/with-premium-features #{:schema-viewer}
    (testing "schema param loads every readable table in that schema as focal"
      (let [response     (erd-request! {:schema "PUBLIC"})
            node-names   (set (map :name (:nodes response)))
            ;; Sample dataset's PUBLIC schema contains these tables. The schema
            ;; param must load every readable table in that schema as focal —
            ;; not a subset.
            expected     #{"CATEGORIES" "CHECKINS" "ORDERS" "PEOPLE"
                           "PRODUCTS" "REVIEWS" "USERS" "VENUES"}]
        (doseq [node (:nodes response)]
          (is (= "PUBLIC" (:schema node))))
        (is (= expected node-names)
            "every readable table in the schema is present as a node")))
    (testing "schema plus extra table-ids: all schema tables PLUS the external tables"
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table _        {:db_id db-id :name "p1" :schema "public"}
                     :model/Table _        {:db_id db-id :name "p2" :schema "public"}
                     :model/Table {x :id}  {:db_id db-id :name "x"  :schema "other"}]
        (let [response   (mt/user-http-request :rasta :get 200 "ee/erd"
                                               :database-id db-id
                                               :schema "public"
                                               :table-ids x)
              node-names (set (map :name (:nodes response)))]
          (is (= #{"p1" "p2" "x"} node-names)))))))

(deftest erd-endpoint-database-only-and-blank-schema-test
  (mt/with-premium-features #{:schema-viewer}
    (testing "database-only request loads every readable table in the database"
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table _ {:db_id db-id :name "nil_schema"   :schema nil}
                     :model/Table _ {:db_id db-id :name "empty_schema" :schema ""}
                     :model/Table _ {:db_id db-id :name "other_schema" :schema "other"}]
        (let [response   (mt/user-http-request :rasta :get 200 "ee/erd"
                                               :database-id db-id)
              node-names (set (map :name (:nodes response)))]
          (is (= #{"nil_schema" "empty_schema" "other_schema"} node-names)))))
    (testing "blank schema request matches nil and empty-string schemas only"
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table _ {:db_id db-id :name "nil_schema"   :schema nil}
                     :model/Table _ {:db_id db-id :name "empty_schema" :schema ""}
                     :model/Table _ {:db_id db-id :name "other_schema" :schema "other"}]
        (let [response   (mt/user-http-request :rasta :get 200 "ee/erd"
                                               :database-id db-id
                                               :schema "")
              node-names (set (map :name (:nodes response)))]
          (is (= #{"nil_schema" "empty_schema"} node-names)))))))

(deftest erd-endpoint-table-ids-are-scoped-to-database-test
  (mt/with-premium-features #{:schema-viewer}
    (testing "table-ids from another database are ignored"
      (mt/with-temp [:model/Database {db-a-id :id} {}
                     :model/Table _ {:db_id db-a-id :name "local" :schema "PUBLIC"}
                     :model/Database {db-b-id :id} {}
                     :model/Table {other-table-id :id} {:db_id db-b-id :name "other" :schema "PUBLIC"}]
        (let [response (mt/user-http-request :rasta :get 200 "ee/erd"
                                             :database-id db-a-id
                                             :table-ids other-table-id)]
          (is (empty? (:nodes response)))
          (is (empty? (:edges response))))))))

(deftest erd-endpoint-includes-hidden-tables-and-all-field-visibility-test
  (mt/with-premium-features #{:schema-viewer}
    (testing "all tables (incl. hidden/technical/cruft) are surfaced; all field visibility types are included"
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table {visible-table-id :id} {:db_id db-id :name "visible" :schema "PUBLIC"}
                     :model/Field _ {:table_id visible-table-id :name "visible_id"
                                     :database_type "INTEGER" :base_type :type/Integer}
                     :model/Field _ {:table_id visible-table-id :name "secret"
                                     :database_type "INTEGER" :base_type :type/Integer
                                     :visibility_type "sensitive"}
                     :model/Field _ {:table_id visible-table-id :name "hidden_field"
                                     :database_type "INTEGER" :base_type :type/Integer
                                     :visibility_type "hidden"}
                     :model/Field _ {:table_id visible-table-id :name "retired_field"
                                     :database_type "INTEGER" :base_type :type/Integer
                                     :visibility_type "retired"}
                     :model/Table _ {:db_id db-id :name "hidden_table" :schema "PUBLIC"
                                     :visibility_type "hidden"}
                     :model/Table _ {:db_id db-id :name "technical_table" :schema "PUBLIC"
                                     :visibility_type "technical"}
                     :model/Table _ {:db_id db-id :name "cruft_table" :schema "PUBLIC"
                                     :visibility_type "cruft"}]
        (let [response       (mt/user-http-request :rasta :get 200 "ee/erd"
                                                   :database-id db-id
                                                   :schema "PUBLIC")
              node-names     (set (map :name (:nodes response)))
              field-names    (set (map :name (mapcat :fields (:nodes response))))
              visibility-by-name (into {} (map (juxt :name :visibility_type)) (:nodes response))]
          (is (= #{"visible" "hidden_table" "technical_table" "cruft_table"} node-names))
          (is (= #{"visible_id" "hidden_field" "secret" "retired_field"} field-names))
          (is (= {"visible"         nil
                  "hidden_table"    "hidden"
                  "technical_table" "technical"
                  "cruft_table"     "cruft"}
                 visibility-by-name)))))))

(deftest erd-endpoint-resolves-hidden-fk-targets-test
  (mt/with-premium-features #{:schema-viewer}
    (testing "FK targets in hidden tables resolve into nodes and edges; FKs to sensitive fields resolve too"
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table {hidden-target-table-id :id} {:db_id db-id :name "hidden_target" :schema "PUBLIC"
                                                                :visibility_type "hidden"}
                     :model/Field {hidden-target-field-id :id} {:table_id hidden-target-table-id :name "id"
                                                                :database_type "INTEGER" :base_type :type/Integer
                                                                :semantic_type :type/PK}
                     :model/Table {visible-target-table-id :id} {:db_id db-id :name "visible_target" :schema "PUBLIC"}
                     :model/Field {sensitive-target-field-id :id} {:table_id visible-target-table-id :name "secret_id"
                                                                   :database_type "INTEGER" :base_type :type/Integer
                                                                   :semantic_type :type/PK
                                                                   :visibility_type "sensitive"}
                     :model/Table {source-table-id :id} {:db_id db-id :name "source" :schema "PUBLIC"}
                     :model/Field {hidden-table-fk-id :id} {:table_id source-table-id :name "hidden_target_id"
                                                            :database_type "INTEGER" :base_type :type/Integer
                                                            :semantic_type :type/FK
                                                            :fk_target_field_id hidden-target-field-id}
                     :model/Field {sensitive-field-fk-id :id} {:table_id source-table-id :name "sensitive_target_id"
                                                               :database_type "INTEGER" :base_type :type/Integer
                                                               :semantic_type :type/FK
                                                               :fk_target_field_id sensitive-target-field-id}]
        (let [response      (mt/user-http-request :rasta :get 200 "ee/erd"
                                                  :database-id db-id
                                                  :schema "PUBLIC")
              nodes-by-name (into {} (map (juxt :name identity)) (:nodes response))
              source-node   (get nodes-by-name "source")
              fields-by-id  (into {} (map (juxt :id identity)) (:fields source-node))
              hidden-fk     (get fields-by-id hidden-table-fk-id)
              sensitive-fk  (get fields-by-id sensitive-field-fk-id)]
          (is (contains? nodes-by-name "hidden_target"))
          (is (contains? nodes-by-name "visible_target"))
          (testing "FK to a field in a hidden table resolves and produces an edge"
            (is (= hidden-target-table-id (:fk_target_table_id hidden-fk)))
            (is (= hidden-target-field-id (:fk_target_field_id hidden-fk)))
            (is (some #(and (= hidden-table-fk-id (:source_field_id %))
                            (= hidden-target-field-id (:target_field_id %)))
                      (:edges response))))
          (testing "FK to a sensitive field in a visible table resolves normally"
            (is (= visible-target-table-id (:fk_target_table_id sensitive-fk)))
            (is (= sensitive-target-field-id (:fk_target_field_id sensitive-fk)))
            (is (some #(and (= sensitive-field-fk-id (:source_field_id %))
                            (= sensitive-target-field-id (:target_field_id %)))
                      (:edges response)))))))))

(deftest erd-endpoint-published-external-fk-target-test
  (mt/with-premium-features #{:schema-viewer :library}
    (testing "published cross-schema FK targets keep target IDs when only readable via collection"
      (mt/with-no-data-perms-for-all-users!
        (mt/with-temp [:model/Collection {coll-id :id} {:type collection/library-data-collection-type}
                       :model/PermissionsGroup {gid :id} {}
                       :model/Database {db-id :id} {}
                       :model/Table {target-table-id :id} {:db_id db-id :name "target" :schema "other"
                                                           :is_published true :collection_id coll-id}
                       :model/Field {target-pk-id :id} {:table_id target-table-id :name "id"
                                                        :database_type "INTEGER" :base_type :type/Integer
                                                        :semantic_type :type/PK}
                       :model/Table {source-table-id :id} {:db_id db-id :name "source" :schema "public"
                                                           :is_published true :collection_id coll-id}
                       :model/Field {source-fk-id :id} {:table_id source-table-id :name "target_id"
                                                        :database_type "INTEGER" :base_type :type/Integer
                                                        :semantic_type :type/FK
                                                        :fk_target_field_id target-pk-id}]
          (perms/add-user-to-group! (mt/user->id :rasta) gid)
          (perms/grant-collection-read-permissions! gid coll-id)
          (let [response      (mt/user-http-request :rasta :get 200 "ee/erd"
                                                    :database-id db-id
                                                    :schema "public")
                nodes-by-name (into {} (map (juxt :name identity)) (:nodes response))
                source-node   (get nodes-by-name "source")
                fk-field      (first (filter #(= source-fk-id (:id %)) (:fields source-node)))]
            (is (contains? nodes-by-name "source"))
            (is (not (contains? nodes-by-name "target"))
                "cross-schema target should remain off-canvas")
            (is (= target-table-id (:fk_target_table_id fk-field)))
            (is (= target-pk-id (:fk_target_field_id fk-field)))))))))

(deftest erd-endpoint-guard-rails-test
  (testing "without :schema-viewer feature returns 402"
    (mt/with-premium-features #{}
      (mt/user-http-request :rasta :get 402 "ee/erd"
                            :database-id (mt/id))))
  (mt/with-premium-features #{:schema-viewer}
    (testing "non-existent database returns 404"
      (mt/user-http-request :rasta :get 404 "ee/erd"
                            :database-id Integer/MAX_VALUE))))

;;; ---------------------------------------- Permission graph tests ----------------------------------------

;; These tests verify that the graph topology changes correctly under
;; different permission scenarios. We use with-no-data-perms-for-all-users!
;; to revoke everything, then selectively grant table-level access.

(deftest erd-permissions-unreadable-table-excluded-test
  (mt/with-premium-features #{:schema-viewer}
    (testing "unreadable table is excluded from graph, edges, and FK fields"
      (mt/with-no-data-perms-for-all-users!
        (mt/with-temp [:model/PermissionsGroup {gid :id} {}]
          (perms/add-user-to-group! (mt/user->id :rasta) gid)
          ;; Grant orders only — products is unreachable
          (grant-table-read! gid (mt/id :orders))
          (let [response (mt/user-http-request :rasta :get 200 "ee/erd"
                                               :database-id (mt/id)
                                               :table-ids (mt/id :orders)
                                               :table-ids (mt/id :products))]
            (testing "graph shows orders alone, no FK edges"
              (is (= {:orders []}
                     (graph-shape response))))
            (testing "no FK field leaks IDs of excluded tables"
              (doseq [field (mapcat :fields (:nodes response))
                      :when (:fk_target_table_id field)]
                (is (contains? (set (map :table_id (:nodes response)))
                               (:fk_target_table_id field)))))))))))

(deftest erd-permissions-intermediate-table-blocks-expansion-test
  (mt/with-premium-features #{:schema-viewer}
    (testing "unreadable intermediate table blocks FK expansion — downstream tables are not discovered"
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
          (let [response (mt/user-http-request :rasta :get 200 "ee/erd"
                                               :database-id (mt/id)
                                               :table-ids (mt/id :orders))]
            (testing "orders reaches people (readable) but not products (unreadable)"
              (is (= {:orders [:people]
                      :people []}
                     (graph-shape response))))))))))

(deftest erd-permissions-manage-table-metadata-allows-erd-test
  (mt/with-premium-features #{:schema-viewer}
    (testing "manage-table-metadata is enough because ERD is a metadata view"
      (mt/with-no-data-perms-for-all-users!
        (mt/with-temp [:model/PermissionsGroup {gid :id} {}
                       :model/Database {db-id :id} {}
                       :model/Table {table-id :id} {:db_id db-id :name "metadata_only" :schema "PUBLIC"}
                       :model/Field _ {:table_id table-id :name "id"
                                       :database_type "INTEGER" :base_type :type/Integer
                                       :semantic_type :type/PK}]
          (perms/add-user-to-group! (mt/user->id :rasta) gid)
          (data-perms/set-database-permission! gid db-id :perms/view-data :blocked)
          (data-perms/set-database-permission! gid db-id :perms/create-queries :no)
          (data-perms/set-table-permission! gid table-id :perms/manage-table-metadata :yes)
          (let [response (mt/user-http-request :rasta :get 200 "ee/erd"
                                               :database-id db-id
                                               :table-ids table-id)]
            (is (= {:metadata_only []}
                   (graph-shape response)))))))))
