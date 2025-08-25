(ns metabase.lib-be.metadata.snippets-only-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.metadata.snippets-only :as snippets-only]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.test :as mt]))

(deftest fetch-snippet-by-id-test
  (testing "Should fetch snippet by ID"
    (mt/with-temp [:model/NativeQuerySnippet snippet {:name "test-snippet"
                                                      :content "WHERE x = {{param}}"
                                                      :description "Test snippet"}]
      (let [provider (snippets-only/snippets-only-metadata-provider)
            fetched (lib.metadata.protocols/native-query-snippet provider (:id snippet))]
        (is (some? fetched))
        (is (= (:id snippet) (:id fetched)))
        (is (= "test-snippet" (:name fetched)))
        (is (= "WHERE x = {{param}}" (:content fetched))))))

  (testing "Should return nil for non-existent snippet"
    (let [provider (snippets-only/snippets-only-metadata-provider)]
      (is (nil? (lib.metadata.protocols/native-query-snippet provider 999999))))))

(deftest fetch-snippet-by-name-test
  (testing "Should fetch snippet by name"
    (mt/with-temp [:model/NativeQuerySnippet snippet {:name "test-snippet-by-name"
                                                      :content "WHERE y = {{param2}}"
                                                      :description "Test snippet for name lookup"}]
      (let [provider (snippets-only/snippets-only-metadata-provider)
            fetched (lib.metadata.protocols/native-query-snippet-by-name provider "test-snippet-by-name")]
        (is (some? fetched))
        (is (= (:id snippet) (:id fetched)))
        (is (= "test-snippet-by-name" (:name fetched))))))

  (testing "Should return nil for non-existent snippet name"
    (let [provider (snippets-only/snippets-only-metadata-provider)]
      (is (nil? (lib.metadata.protocols/native-query-snippet-by-name provider "non-existent-snippet"))))))

(deftest bulk-fetch-snippets-test
  (testing "Should fetch multiple snippets by IDs"
    (mt/with-temp [:model/NativeQuerySnippet snippet1 {:name "bulk-1" :content "WHERE a = 1"}
                   :model/NativeQuerySnippet snippet2 {:name "bulk-2" :content "WHERE b = 2"}
                   :model/NativeQuerySnippet snippet3 {:name "bulk-3" :content "WHERE c = 3"}]
      (let [provider (snippets-only/snippets-only-metadata-provider)
            ids [(:id snippet1) (:id snippet2) (:id snippet3)]
            fetched (lib.metadata.protocols/metadatas provider :metadata/native-query-snippet ids)]
        (is (= 3 (count fetched)))
        (is (= (set ids) (set (map :id fetched)))))))

  (testing "Should handle mix of existing and non-existing IDs"
    (mt/with-temp [:model/NativeQuerySnippet snippet {:name "exists" :content "WHERE exists = true"}]
      (let [provider (snippets-only/snippets-only-metadata-provider)
            ids [(:id snippet) 999999 888888]
            fetched (lib.metadata.protocols/metadatas provider :metadata/native-query-snippet ids)]
        (is (= 1 (count fetched)))
        (is (= (:id snippet) (:id (first fetched)))))))

  (testing "Should fetch multiple snippets by names"
    (mt/with-temp [:model/NativeQuerySnippet snippet1 {:name "bulk-name-1" :content "WHERE a = 1"}
                   :model/NativeQuerySnippet snippet2 {:name "bulk-name-2" :content "WHERE b = 2"}
                   :model/NativeQuerySnippet snippet3 {:name "bulk-name-3" :content "WHERE c = 3"}]
      (let [provider (snippets-only/snippets-only-metadata-provider)
            names ["bulk-name-1" "bulk-name-2" "bulk-name-3"]
            fetched (lib.metadata.protocols/metadatas-by-name provider :metadata/native-query-snippet names)]
        (is (= 3 (count fetched)))
        (is (= (set names) (set (map :name fetched)))))))

  (testing "Should handle mix of existing and non-existing names"
    (mt/with-temp [:model/NativeQuerySnippet snippet {:name "exists-by-name" :content "WHERE exists = true"}]
      (let [provider (snippets-only/snippets-only-metadata-provider)
            names ["exists-by-name" "does-not-exist" "also-does-not-exist"]
            fetched (lib.metadata.protocols/metadatas-by-name provider :metadata/native-query-snippet names)]
        (is (= 1 (count fetched)))
        (is (= "exists-by-name" (:name (first fetched))))))))

(deftest non-snippet-methods-test
  (testing "Non-snippet methods should handle gracefully"
    (let [provider (snippets-only/snippets-only-metadata-provider)]
      (testing "database method returns nil"
        (is (nil? (lib.metadata.protocols/database provider))))

      (testing "tables method returns empty collection"
        (is (empty? (lib.metadata.protocols/tables provider))))

      (testing "metadatas for non-snippet types returns empty"
        (is (empty? (lib.metadata.protocols/metadatas provider :metadata/table [1 2 3])))
        (is (empty? (lib.metadata.protocols/metadatas provider :metadata/column [1 2 3]))))

      (testing "setting method returns nil"
        (is (nil? (lib.metadata.protocols/setting provider :some-setting)))))))

(deftest caching-behavior-test
  (testing "Provider should cache fetched snippets"
    (mt/with-temp [:model/NativeQuerySnippet snippet {:name "cache-test" :content "cached content"}]
      (let [provider (snippets-only/snippets-only-metadata-provider)]
        ;; First fetch - hits DB
        (let [first-fetch (lib.metadata.protocols/native-query-snippet provider (:id snippet))]
          (is (some? first-fetch))
          ;; Second fetch - should use cache
          (let [second-fetch (lib.metadata.protocols/native-query-snippet provider (:id snippet))]
            (is (identical? first-fetch second-fetch))))))))