(ns metabase-enterprise.dependencies.store-test
  "Tests for the DependencyStore protocol and its two implementations.

   Uses a shared contract test harness parameterized by a store factory and an
   entity-ID provider, so the same assertions run against both
   InMemoryDependencyStore (fast, pure) and DatabaseDependencyStore (spot-check
   persistence against real DB entities)."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.dependencies.store :as deps.store]
   [metabase-enterprise.dependencies.store.database :as deps.store.db]
   [metabase-enterprise.dependencies.store.in-memory :as deps.store.mem]
   [metabase-enterprise.dependencies.test-util :as deps.test]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;;; ===========================================================================
;;; Test helpers
;;; ===========================================================================

(defn- in-memory-factory
  "Factory that creates a fresh InMemoryDependencyStore for each test."
  []
  (deps.store.mem/in-memory-dependency-store))

(defn- db-factory
  "Factory that creates a DatabaseDependencyStore for DB-backed tests."
  []
  (deps.store.db/database-dependency-store))

(defn- store-deps!
  "Convenience wrapper for storing deps via the protocol."
  [store entity-type entity-id deps-by-type]
  (deps.store/store-deps! store entity-type entity-id deps-by-type))

;; Test-only helpers: store → graph → query in one step.
;; Production code should get a graph once and reuse it.

(defn- upstream-deps [store entity-type entity-id]
  (deps.store/direct-upstream (deps.store/graph store) entity-type entity-id))

(defn- downstream-deps [store entity-type entity-id]
  (deps.store/direct-downstream (deps.store/graph store) entity-type entity-id))

(defn- transitive-downstream [store entity-type entity-id]
  (deps.store/transitive-downstream (deps.store/graph store) entity-type entity-id))

(defn- transitive-upstream [store entity-type entity-id]
  (deps.store/transitive-upstream (deps.store/graph store) entity-type entity-id))

;;; ===========================================================================
;;; Shared protocol contract tests — parameterized by store factory + ID fn
;;; ===========================================================================

(defn- contract-tests
  "Run the full protocol contract test suite against a store created by
   `store-factory`. `id` is a function `(entity-type placeholder-id) → real-id`
   that maps test placeholder IDs to actual entity IDs. For in-memory tests,
   this is identity. For DB tests, it maps to real DB entity IDs."
  [store-factory id & {:keys [_db-backed?]}]

  (testing "store-deps! then direct-upstream round-trip"
    (let [store (store-factory)]
      (store-deps! store :card (id :card 1) {:table #{(id :table 100)}})
      (is (= {:table #{(id :table 100)}}
             (upstream-deps store :card (id :card 1))))))

  (testing "store-deps! twice replaces edges (does not accumulate)"
    (let [store (store-factory)]
      (store-deps! store :card (id :card 1) {:table #{(id :table 100)}})
      (store-deps! store :card (id :card 1) {:table #{(id :table 200)} :card #{(id :card 50)}})
      (is (= {:table #{(id :table 200)} :card #{(id :card 50)}}
             (upstream-deps store :card (id :card 1))))))

  (testing "store-deps! with empty deps-by-type clears all edges"
    (let [store (store-factory)]
      (store-deps! store :card (id :card 1) {:table #{(id :table 100)}})
      (store-deps! store :card (id :card 1) {})
      (is (= {}
             (upstream-deps store :card (id :card 1))))))

  (testing "delete-deps! removes all edges"
    (let [store (store-factory)]
      (store-deps! store :card (id :card 1) {:table #{(id :table 100)} :card #{(id :card 50)}})
      (deps.store/delete-deps! store :card (id :card 1))
      (is (= {}
             (upstream-deps store :card (id :card 1))))))

  (testing "delete-deps! on nonexistent entity is a no-op"
    (let [store (store-factory)]
      (deps.store/delete-deps! store :card (id :card 99999))
      (is (= {} (upstream-deps store :card (id :card 99999))))))

  (testing "bidirectional consistency: store A->B, direct-downstream on B sees A"
    (let [store (store-factory)]
      (store-deps! store :card (id :card 1) {:transform #{(id :transform 50)}})
      (is (= {:card #{(id :card 1)}}
             (downstream-deps store :transform (id :transform 50)))
          "B's downstream deps should include A")
      (is (= {} (downstream-deps store :card (id :card 1)))
          "A has no downstream deps (nothing depends on it)")))

  (testing "bidirectional consistency: store A->B and B->C, downstream of C sees B"
    (let [store (store-factory)]
      (store-deps! store :card (id :card 1) {:transform #{(id :transform 50)}})
      (store-deps! store :transform (id :transform 50) {:table #{(id :table 200)}})
      (is (= {:transform #{(id :transform 50)}}
             (downstream-deps store :table (id :table 200)))
          "C's downstream deps should include B")))

  (testing "transitive-downstream walks multi-hop chain X->Y->Z->W"
    (let [store (store-factory)]
      (store-deps! store :card (id :card 2) {:card #{(id :card 1)}})
      (store-deps! store :card (id :card 3) {:card #{(id :card 2)}})
      (store-deps! store :card (id :card 4) {:card #{(id :card 3)}})
      (is (= {:card #{(id :card 2) (id :card 3) (id :card 4)}}
             (transitive-downstream store :card (id :card 1)))
          "Should see all downstream cards except self")))

  (testing "transitive-upstream walks multi-hop chain X->Y->Z->W"
    (let [store (store-factory)]
      (store-deps! store :card (id :card 2) {:card #{(id :card 1)}})
      (store-deps! store :card (id :card 3) {:card #{(id :card 2)}})
      (store-deps! store :card (id :card 4) {:card #{(id :card 3)}})
      (is (= {:card #{(id :card 1) (id :card 2) (id :card 3)}}
             (transitive-upstream store :card (id :card 4)))
          "W's upstream should include X, Y, Z")))

  (testing "diamond dependencies: no duplicates in transitive upstream"
    (let [store (store-factory)]
      (store-deps! store :card (id :card 2) {:card #{(id :card 1)}})
      (store-deps! store :card (id :card 3) {:card #{(id :card 1)}})
      (store-deps! store :card (id :card 4) {:card #{(id :card 2) (id :card 3)}})
      (let [result (transitive-upstream store :card (id :card 4))]
        (is (= #{(id :card 1) (id :card 2) (id :card 3)} (get result :card))
            "A should appear only once, not twice"))))

  (testing "empty store returns empty for all queries"
    (let [store (store-factory)]
      (is (= {} (upstream-deps store :card (id :card 1))))
      (is (= {} (downstream-deps store :card (id :card 1))))
      (is (= {} (transitive-downstream store :card (id :card 1))))
      (is (= {} (transitive-upstream store :card (id :card 1))))))

  (testing "graph returns a DependencyGraph"
    (let [store (store-factory)]
      (store-deps! store :card (id :card 1) {:table #{(id :table 100)}})
      (let [g (deps.store/graph store)]
        (is (deps.store/dependency-graph? g)))))

  (testing "store? predicate"
    (let [store (store-factory)]
      (is (deps.store/store? store))
      (is (not (deps.store/store? {})))
      (is (not (deps.store/store? nil)))))

  (testing "upstream-deps returns correct shape for multi-type deps"
    (let [store (store-factory)]
      (store-deps! store :card (id :card 1) {:table #{(id :table 100)} :card #{(id :card 50)} :snippet #{(id :snippet 1) (id :snippet 2)}})
      (is (= {:table #{(id :table 100)} :card #{(id :card 50)} :snippet #{(id :snippet 1) (id :snippet 2)}}
             (upstream-deps store :card (id :card 1))))))

  (testing "downstream-deps returns correct shape for multi-type deps"
    (let [store (store-factory)]
      (store-deps! store :card (id :card 1) {:table #{(id :table 100)}})
      (store-deps! store :card (id :card 2) {:table #{(id :table 100)}})
      (is (= {:card #{(id :card 1) (id :card 2)}}
             (downstream-deps store :table (id :table 100))))))

  (testing "deleting one entity does not affect others"
    (let [store (store-factory)]
      (store-deps! store :card (id :card 1) {:table #{(id :table 100)}})
      (store-deps! store :card (id :card 2) {:table #{(id :table 200)}})
      (deps.store/delete-deps! store :card (id :card 1))
      (is (= {} (upstream-deps store :card (id :card 1))))
      (is (= {:table #{(id :table 200)}} (upstream-deps store :card (id :card 2)))))))

;;; ===========================================================================
;;; InMemoryDependencyStore — shared contract (fast, pure)
;;; ===========================================================================

(deftest in-memory-contract-test
  (testing "InMemoryDependencyStore satisfies the full protocol contract"
    (contract-tests in-memory-factory (fn [_ id] id))))

;;; ===========================================================================
;;; InMemoryDependencyStore — implementation-specific tests
;;; ===========================================================================

(deftest in-memory-store-deps-replaces-test
  (testing "store-deps! replaces edges atomically"
    (let [store (in-memory-factory)]
      (store-deps! store :card 1 {:table #{100} :card #{50}})
      (store-deps! store :card 1 {:table #{200}})
      (is (= {:table #{200}}
             (upstream-deps store :card 1))))))

(deftest in-memory-swap-outgoing-maintains-incoming-index-test
  (testing "swap-outgoing! correctly updates incoming index when edges change"
    (let [store (in-memory-factory)]
      (store-deps! store :card 1 {:card #{2}})
      (is (= {:card #{1}} (downstream-deps store :card 2)))
      (store-deps! store :card 1 {:card #{3}})
      (is (= {} (downstream-deps store :card 2)))
      (is (= {:card #{1}} (downstream-deps store :card 3))))))

(deftest in-memory-swap-outgoing-removes-incoming-test
  (testing "swap-outgoing! removes from incoming when edge is deleted"
    (let [store (in-memory-factory)]
      (store-deps! store :card 1 {:card #{2}})
      (deps.store/delete-deps! store :card 1)
      (is (= {} (downstream-deps store :card 2))))))

(deftest in-memory-cycle-detection-test
  (testing "find-cycle detects cycles via DependencyGraph"
    (let [store (in-memory-factory)]
      (store-deps! store :card 1 {:card #{2}})
      (store-deps! store :card 2 {:card #{3}})
      (store-deps! store :card 3 {:card #{1}})
      (is (some? (deps.store/find-cycle (deps.store/graph store) :card 1))
          "Should detect cycle 1->2->3->1"))))

(deftest in-memory-no-cycles-test
  (testing "find-cycle returns nil for acyclic graph"
    (let [store (in-memory-factory)]
      (store-deps! store :card 1 {:card #{2}})
      (store-deps! store :card 2 {:card #{3}})
      (is (nil? (deps.store/find-cycle (deps.store/graph store) :card 1))
          "No cycle in 1->2->3"))))

(deftest in-memory-graph-snapshot-is-point-in-time-test
  (testing "graph snapshot is a point-in-time view"
    (let [store (in-memory-factory)]
      (store-deps! store :card 1 {:card #{2}})
      (let [g (deps.store/graph store)]
        (store-deps! store :card 1 {:card #{2 3}})
        (is (= {:card #{2}}
               (deps.store/direct-upstream g :card 1))
            "Snapshot should reflect state at time of capture")))))

(deftest in-memory-graph-reflects-updates-test
  (testing "new graph reflects updates"
    (let [store (in-memory-factory)]
      (store-deps! store :card 1 {:card #{2}})
      (store-deps! store :card 1 {:card #{2 3}})
      (is (= {:card #{2 3}}
             (upstream-deps store :card 1))
          "New graph should reflect latest state"))))

(deftest in-memory-multiple-entities-with-same-dependency-test
  (testing "multiple entities can have same dependency"
    (let [store (in-memory-factory)]
      (store-deps! store :card 1 {:table #{100}})
      (store-deps! store :card 2 {:table #{100}})
      (store-deps! store :card 3 {:table #{100}})
      (is (= {:card #{1 2 3}}
             (downstream-deps store :table 100))))))

(deftest in-memory-self-loop-test
  (testing "self-referencing deps (A->A) are handled"
    (let [store (in-memory-factory)]
      (store-deps! store :card 1 {:card #{1}})
      (is (= {:card #{1}}
             (upstream-deps store :card 1)))
      (is (= {:card #{1}}
             (downstream-deps store :card 1))))))

(deftest in-memory-large-graph-test
  (testing "storing hundreds of entities performs acceptably"
    (let [store (in-memory-factory)]
      (doseq [i (range 200)]
        (store-deps! store :card i {:card #{(mod (inc i) 200)}}))
      (is (= {:card #{(mod 1 200)}}
             (upstream-deps store :card 0)))
      (is (some? (transitive-downstream store :card 0))))))

(deftest in-memory-concurrent-store-deps-test
  (testing "concurrent store-deps! calls do not corrupt atom state"
    (let [store (in-memory-factory)
          n 100
          futures (doall
                   (for [i (range n)]
                     (future
                       (store-deps! store :card i {:table #{i}}))))]
      (doseq [f futures] @f)
      (doseq [i (range n)]
        (is (= {:table #{i}}
               (upstream-deps store :card i))
            (str "Card " i " should have its dependency intact"))
        (is (= #{i} (get (downstream-deps store :table i) :card))
            (str "Table " i " should be referenced by card " i))))))

(deftest in-memory-direction-test
  (testing "upstream and downstream return correct directions"
    (let [store (in-memory-factory)]
      (store-deps! store :card 1 {:table #{100}})
      (is (= {:table #{100}} (upstream-deps store :card 1)))
      (is (= {:card #{1}} (downstream-deps store :table 100))))))

(deftest in-memory-edge-replacement-preserves-incoming-test
  (testing "replacing edges correctly removes old incoming and adds new incoming"
    (let [store (in-memory-factory)]
      (store-deps! store :card 1 {:card #{2 3}})
      (is (= {:card #{1}} (downstream-deps store :card 2)))
      (is (= {:card #{1}} (downstream-deps store :card 3)))
      (store-deps! store :card 1 {:card #{3 4}})
      (is (= {} (downstream-deps store :card 2)))
      (is (= {:card #{1}} (downstream-deps store :card 3)))
      (is (= {:card #{1}} (downstream-deps store :card 4))))))

;;; ===========================================================================
;;; DatabaseDependencyStore — runs the shared contract + DB-specific checks
;;; ===========================================================================

(deftest db-contract-test
  (testing "DatabaseDependencyStore satisfies the full protocol contract"
    (mt/with-temp [:model/Card {card1-id :id} {:name "Store Test Card 1"
                                               :dataset_query (mt/mbql-query orders)}
                   :model/Card {card2-id :id} {:name "Store Test Card 2"
                                               :dataset_query (mt/mbql-query orders)}
                   :model/Card {card3-id :id} {:name "Store Test Card 3"
                                               :dataset_query (mt/mbql-query orders)}
                   :model/Card {card4-id :id} {:name "Store Test Card 4"
                                               :dataset_query (mt/mbql-query orders)}
                   :model/Card {card50-id :id} {:name "Store Test Card 50"
                                                :dataset_query (mt/mbql-query orders)}
                   :model/NativeQuerySnippet {snippet1-id :id} {:name "Store Test Snippet 1"
                                                                :content "SELECT 1"}
                   :model/NativeQuerySnippet {snippet2-id :id} {:name "Store Test Snippet 2"
                                                                :content "SELECT 2"}]
      (let [table-categories (mt/id :categories)
            table-orders     (mt/id :orders)
            ids              {:card      {1 card1-id, 2 card2-id, 3 card3-id, 4 card4-id, 50 card50-id, 99999 -1}
                              :table     {100 table-categories, 200 table-orders}
                              :transform {3 card3-id, 50 card4-id}
                              :dashboard {10 card4-id}
                              :snippet   {1 snippet1-id, 2 snippet2-id}}
            id-fn            (fn [entity-type placeholder]
                               (or (get-in ids [entity-type placeholder])
                                   placeholder))
            all-test-ids     (into #{} (mapcat vals) (vals ids))
            cleaning-factory (fn []
                               (let [store (db-factory)]
                                 (when (seq all-test-ids)
                                   (t2/delete! :model/Dependency
                                               {:where [:or
                                                        [:in :from_entity_id (vec all-test-ids)]
                                                        [:in :to_entity_id (vec all-test-ids)]]}))
                                 store))]
        (contract-tests cleaning-factory id-fn :db-backed? true)
        (let [store (cleaning-factory)]
          (store-deps! store :card card1-id {:table #{table-categories}})
          (is (t2/exists? :model/Dependency
                          :from_entity_type :card
                          :from_entity_id card1-id
                          :to_entity_type :table
                          :to_entity_id table-categories)
              "row should exist in the dependency table"))))))

(deftest db-delete-nonexistent-test
  (testing "delete-deps! on nonexistent entity is a no-op"
    (let [store (db-factory)]
      (deps.store/delete-deps! store :card 999999999)
      (is (= {} (upstream-deps store :card 999999999))))))

(deftest db-empty-store-test
  (testing "DatabaseDependencyStore returns empty for nonexistent entities"
    (let [store (db-factory)]
      (is (= {} (upstream-deps store :card 999999)))
      (is (= {} (downstream-deps store :card 999999)))
      (is (= {} (transitive-downstream store :card 999999)))
      (is (= {} (transitive-upstream store :card 999999))))))

;;; ===========================================================================
;;; Data-driven tests using test-store helpers
;;; ===========================================================================

(deftest test-store-data-driven-test
  (testing "test-store creates a pre-loaded store from a data literal"
    (let [store (deps.test/test-store
                 {:card      {1 {:table #{100}}
                              2 {:card #{1} :table #{200}}}
                  :dashboard {10 {:card #{1 2}}}})]
      (is (= {:table #{100}}
             (upstream-deps store :card 1)))
      (is (= {:card #{1} :table #{200}}
             (upstream-deps store :card 2)))
      (is (= {:card #{1 2}}
             (upstream-deps store :dashboard 10)))
      (is (= {:card #{2} :dashboard #{10}}
             (downstream-deps store :card 1)))))

  (testing "with-edges replaces edges for an entity"
    (let [store (-> (deps.test/test-store {:dashboard {1 {:card #{10 20 30}}}})
                    (deps.test/with-edges {:dashboard {1 {:card #{10 30}}}}))]
      (is (= {:card #{10 30}}
             (upstream-deps store :dashboard 1))
          "card 20 should be gone after with-edges")))

  (testing "with-edges adds new entities"
    (let [store (-> (deps.test/test-store {:card {1 {:table #{100}}}})
                    (deps.test/with-edges {:card {2 {:table #{100}}}}))]
      (is (= {:card #{1 2}}
             (downstream-deps store :table 100))))))

(deftest test-store-cycle-detection-test
  (testing "cycle detection with data-driven setup"
    (let [store (deps.test/test-store
                 {:card {1 {:card #{2}}
                         2 {:card #{3}}
                         3 {:card #{1}}}})]
      (is (some? (deps.store/find-cycle (deps.store/graph store) :card 1))))))

(deftest test-store-transitive-impact-test
  (testing "transitive impact analysis: table change affects all downstream"
    (let [store (deps.test/test-store
                 {:card      {1 {:table #{100}}
                              2 {:card #{1}}
                              3 {:card #{2}}}
                  :dashboard {10 {:card #{3}}}})]
      (is (= {:card #{1 2 3} :dashboard #{10}}
             (transitive-downstream store :table 100))
          "changing table 100 transitively affects cards 1->2->3 and dashboard 10"))))

(deftest calculate-and-store-dashboard-test
  (testing "calculate-deps for a dashboard data structure, store, and query"
    (let [store     (deps.test/test-store)
          dashboard {:dashcards  [{:card_id 10
                                   :series  [{:id 11}]
                                   :visualization_settings
                                   {:click_behavior {:type "link"
                                                     :linkType "question"
                                                     :targetId 20}}}
                                  {:card_id 30
                                   :visualization_settings
                                   {:column_settings
                                    {"[\"name\",\"X\"]"
                                     {:click_behavior {:type "link"
                                                       :linkType "dashboard"
                                                       :targetId 5}}}}}]
                     :parameters [{:values_source_type "card"
                                   :values_source_config {:card_id 40}}]}
          deps      (deps.test/calculate-and-store! store :dashboard 1 dashboard)]
      (testing "calculate-deps extracts all dependency types"
        (is (= #{10 11 20 30 40} (:card deps)))
        (is (= #{5} (:dashboard deps))))
      (testing "store reflects calculated deps"
        (is (= deps (upstream-deps store :dashboard 1))))
      (testing "downstream queries work"
        (is (= {:dashboard #{1}} (downstream-deps store :card 10)))
        (is (= {:dashboard #{1}} (downstream-deps store :card 20)))
        (is (= {:dashboard #{1}} (downstream-deps store :dashboard 5)))))))

(deftest calculate-and-store-sandbox-test
  (testing "sandbox deps are just the card"
    (let [store (deps.test/test-store)]
      (deps.test/calculate-and-store! store :sandbox 1 {:card_id 42})
      (is (= {:card #{42}} (upstream-deps store :sandbox 1))))))
