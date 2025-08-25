(ns metabase.lib.cycles-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase.lib.cycles :as lib.cycles]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]))

(defn- mock-snippet-provider
  "Create a mock metadata provider with the given snippets map.
   snippets-map is {id {:name name :content content} ...}"
  [snippets-map]
  (reify lib.metadata.protocols/MetadataProvider
    (database [_this] nil)

    (metadatas [_this metadata-type ids]
      (when (= metadata-type :metadata/native-query-snippet)
        (keep (fn [id]
                (when-let [snippet (get snippets-map id)]
                  (assoc snippet :lib/type :metadata/native-query-snippet :id id)))
              ids)))

    (metadatas-by-name [_this metadata-type names]
      (when (= metadata-type :metadata/native-query-snippet)
        (keep (fn [snippet-name]
                (some (fn [[id snippet]]
                        (when (= (:name snippet) snippet-name)
                          (assoc snippet :lib/type :metadata/native-query-snippet :id id)))
                      snippets-map))
              names)))

    (tables [_this] [])
    (metadatas-for-table [_this _metadata-type _table-id] [])
    (metadatas-for-card [_this _metadata-type _card-id] [])
    (setting [_this _setting-key] nil)))

(deftest ^:parallel detect-simple-snippet-cycle-test
  (testing "Should detect A→B→A cycle"
    (let [snippets-map {1 {:id 1
                           :name "snippet-a"
                           :content "SELECT * FROM {{snippet: snippet-b}}"}
                        2 {:id 2
                           :name "snippet-b"
                           :content "SELECT * FROM {{snippet: snippet-a}}"}}
          mock-provider (mock-snippet-provider snippets-map)
          snippet (get snippets-map 1)]
      (is (thrown-with-msg?
           #?(:clj Exception :cljs js/Error)
           #"Circular dependency"
           (lib.cycles/check-snippet-cycles mock-provider snippet))))))

(deftest ^:parallel no-cycle-test
  (testing "Should return nil when no cycle exists"
    (let [snippets-map {1 {:id 1
                           :name "snippet-a"
                           :content "SELECT * FROM orders"}
                        2 {:id 2
                           :name "snippet-b"
                           :content "SELECT * FROM {{snippet: snippet-a}}"}}
          mock-provider (mock-snippet-provider snippets-map)
          snippet (get snippets-map 2)]
      (is (nil? (lib.cycles/check-snippet-cycles mock-provider snippet))))))

(deftest ^:parallel multi-hop-cycle-test
  (testing "Should detect A→B→C→A cycle"
    (let [snippets-map {1 {:id 1
                           :name "snippet-a"
                           :content "SELECT * FROM {{snippet: snippet-b}}"}
                        2 {:id 2
                           :name "snippet-b"
                           :content "SELECT * FROM {{snippet: snippet-c}}"}
                        3 {:id 3
                           :name "snippet-c"
                           :content "SELECT * FROM {{snippet: snippet-a}}"}}
          mock-provider (mock-snippet-provider snippets-map)
          snippet (get snippets-map 1)]
      (is (thrown-with-msg?
           #?(:clj Exception :cljs js/Error)
           #"Circular dependency"
           (lib.cycles/check-snippet-cycles mock-provider snippet))))))

(deftest ^:parallel stop-at-card-reference-test
  (testing "Should stop checking when encountering card reference (don't error)"
    (let [snippets-map {1 {:name "snippet-a" :content "WHERE {{snippet: snippet-b}}"}
                        2 {:name "snippet-b" :content "WHERE id IN ({{#123}})"}}
          mock-provider (mock-snippet-provider snippets-map)
          snippet (get snippets-map 1)]
      ;; Should not throw even though snippet-b references a card
      (is (nil? (lib.cycles/check-snippet-cycles mock-provider snippet))))))

(deftest ^:parallel multiple-snippet-references-test
  (testing "Should handle snippets with multiple references"
    (let [snippets-map {1 {:name "snippet-a"
                           :content "WHERE {{snippet: snippet-b}} AND {{snippet: snippet-c}}"}
                        2 {:name "snippet-b" :content "WHERE x = 1"}
                        3 {:name "snippet-c" :content "WHERE y = 2"}}
          mock-provider (mock-snippet-provider snippets-map)
          snippet (get snippets-map 1)]
      ;; Should not throw - no cycles
      (is (nil? (lib.cycles/check-snippet-cycles mock-provider snippet)))))

  (testing "Should detect cycle in one of multiple references"
    (let [snippets-map {1 {:name "snippet-a"
                           :content "WHERE {{snippet: snippet-b}} AND {{snippet: snippet-c}}"}
                        2 {:name "snippet-b" :content "WHERE x = 1"}
                        3 {:name "snippet-c" :content "WHERE {{snippet: snippet-a}}"}}
          mock-provider (mock-snippet-provider snippets-map)
          snippet (get snippets-map 1)]
      ;; Should throw - snippet-c creates a cycle back to snippet-a
      (is (thrown-with-msg?
           #?(:clj Exception :cljs js/Error)
           #"Circular dependency"
           (lib.cycles/check-snippet-cycles mock-provider snippet))))))

(deftest ^:parallel non-existent-snippet-reference-test
  (testing "Should handle references to non-existent snippets gracefully"
    (let [snippets-map {1 {:name "snippet-a" :content "WHERE {{snippet: does-not-exist}}"}}
          mock-provider (mock-snippet-provider snippets-map)
          snippet (get snippets-map 1)]
      ;; Should not throw - just ignore the non-existent reference
      (is (nil? (lib.cycles/check-snippet-cycles mock-provider snippet))))))
