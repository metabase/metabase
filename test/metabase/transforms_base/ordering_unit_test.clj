(ns metabase.transforms-base.ordering-unit-test
  "Pure-data unit tests for `transform-ordering`'s closure-walking algorithm.

  These tests do not require a real database or query processor — they stub
  `table-dependencies` via `with-redefs` so the walk can be exercised in isolation
  on synthetic transform maps. Driver-gated integration tests live in
  `metabase.transforms-base.ordering-test`."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.ordering :as ordering]))

(defn- tx
  "Build a synthetic transform map for tests. `dep-ids` is the set of transform ids this
  transform should (after resolution) depend on. Each transform gets a unique target_table_id
  so the dep extractor stub can emit `{:table <id>}` deps and `resolve-dependency` can map
  them back to transform ids via `output-tables`."
  [id dep-ids]
  {:id              id
   :target_table_id (* 100 id)
   :target          {:database 1 :schema "public" :name (str "t" id)}
   :test-deps       (into #{} (map (fn [dep-id] {:table (* 100 dep-id)})) dep-ids)})

(deftest transform-ordering-closure-walk-test
  (testing "transform-ordering only visits transforms reachable from start-ids"
    ;; Stub table-dependencies to read the :test-deps key we put on the synthetic transforms.
    ;; This keeps the test focused on the closure-walk and dep-resolution logic without
    ;; needing a real query processor.
    (with-redefs [transforms-base.i/table-dependencies :test-deps]
      (testing "empty start-ids returns empty ordering"
        (is (= {:dependencies {} :not-found #{} :failed #{}}
               (ordering/transform-ordering #{} [(tx 1 #{})]))))

      (testing "single transform with no deps"
        (is (= {:dependencies {1 #{}} :not-found #{} :failed #{}}
               (ordering/transform-ordering #{1} [(tx 1 #{})]))))

      (testing "direct dependency is resolved and included in the closure"
        (is (= {:dependencies {1 #{} 2 #{1}} :not-found #{} :failed #{}}
               (ordering/transform-ordering #{2} [(tx 1 #{}) (tx 2 #{1})]))))

      (testing "transitive dependencies are walked outward"
        (is (= {:dependencies {1 #{} 2 #{1} 3 #{2}} :not-found #{} :failed #{}}
               (ordering/transform-ordering #{3} [(tx 1 #{}) (tx 2 #{1}) (tx 3 #{2})]))))

      (testing "multiple start ids with a shared upstream"
        (is (= {:dependencies {1 #{} 2 #{1} 3 #{1}} :not-found #{} :failed #{}}
               (ordering/transform-ordering #{2 3} [(tx 1 #{}) (tx 2 #{1}) (tx 3 #{1})]))))

      (testing "unrelated transforms are never visited or included"
        (let [{:keys [dependencies]} (ordering/transform-ordering #{2} [(tx 1 #{}) (tx 2 #{}) (tx 3 #{})])]
          (is (= {2 #{}} dependencies))
          (is (not (contains? dependencies 1)))
          (is (not (contains? dependencies 3)))))

      (testing "non-existent start ids are captured in :not-found, not in :dependencies"
        (is (= {:dependencies {} :not-found #{999} :failed #{}}
               (ordering/transform-ordering #{999} [(tx 1 #{})]))))

      (testing "a cycle in the dep graph does not infinite-loop"
        (is (= {:dependencies {1 #{2} 2 #{1}} :not-found #{} :failed #{}}
               (ordering/transform-ordering #{1} [(tx 1 #{2}) (tx 2 #{1})])))))))

(deftest transform-ordering-catches-per-transform-failures-test
  (testing "per-transform dep-extraction failures are caught, captured in :failed, and treated as no deps"
    (testing "failure on a start-id: the transform becomes a leaf, its supposed deps are not visited"
      (mt/with-dynamic-fn-redefs [transforms-base.i/table-dependencies
                                  (fn [transform]
                                    (if (= (:id transform) 1)
                                      (throw (ex-info "simulated extraction failure" {}))
                                      (:test-deps transform)))]
        ;; Transform 1 is tagged but its extractor throws. The walk catches, captures 1 in :failed,
        ;; treats 1 as a leaf, and the supposed downstream dep (2) is never visited.
        (is (= {:dependencies {1 #{}} :not-found #{} :failed #{1}}
               (ordering/transform-ordering #{1} [(tx 1 #{2}) (tx 2 #{})])))))

    (testing "failure on a discovered upstream: upstream is still included (the parent's deps found it), but has no further deps of its own"
      (mt/with-dynamic-fn-redefs [transforms-base.i/table-dependencies
                                  (fn [transform]
                                    (if (= (:id transform) 1)
                                      (throw (ex-info "simulated upstream failure" {}))
                                      (:test-deps transform)))]
        ;; Transform 2 is tagged and depends on 1. 2's extractor succeeds, so the edge 2→1 is
        ;; recorded. Then 1 is visited, its extractor throws, so 1 is captured in :failed and
        ;; treated as a leaf. The parent edge 2→1 is preserved, which is what run-transforms!
        ;; needs for skip-on-failure attribution.
        (is (= {:dependencies {1 #{} 2 #{1}} :not-found #{} :failed #{1}}
               (ordering/transform-ordering #{2} [(tx 1 #{}) (tx 2 #{1})])))))))
