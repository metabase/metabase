(ns metabase.lib.metadata.cache-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.cache :as lib.metadata.cache]
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel stable-cache-keys-test
  (let [query       (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                        (lib/join (meta/table-metadata :categories)))
        mp1         (:lib/metadata query)
        mp1-hash    (hash mp1)
        cache-key   (fn [query]
                      (lib.metadata.cache/cache-key ::cache-key query -1 nil {}))
        cache-key-1 (cache-key query)]
    (is (lib.metadata.protocols/cached-metadata-provider? mp1)
        "Should automatically get wrapped in a cached metadata provider")
    (testing "Do something to populate the cache"
      (is (seq (lib/visible-columns query))))
    (testing "After warming the cache..."
      (let [mp2 (:lib/metadata query)]
        (is (identical? mp1 mp2)
            "metadata provider should still be the same object")
        (is (= mp1-hash
               (hash mp2))
            "Hash of metadata provider should not have changed")
        (testing "Cache key should be stable"
          (is (= cache-key-1
                 (cache-key query)))
          (is (= (hash cache-key-1)
                 (hash (cache-key query)))))))
    (testing "A different metadata provider should result in a different cache key"
      (let [query' (assoc query :lib/metadata (lib.metadata.cached-provider/cached-metadata-provider meta/metadata-provider))]
        (is (not= cache-key-1
                  (cache-key query'))
            "Hash keys should NOT be equal to one another (even if queries are equal) since they have different MPs")
        (is (not= (hash cache-key-1)
                  (hash (cache-key query')))
            "BUT they should hash differently since the two MPs are different objects.")
        (testing "Should have some cache misses because keys have different hashes."
          (let [num-misses (atom 0)]
            (binding [lib.metadata.cache/*cache-miss-hook* (fn [_k]
                                                             (swap! num-misses inc))]
              (is (seq (lib/visible-columns query')))
              (is (pos-int? @num-misses)))))
        (testing "Calling lib/visible-columns on a query a second time should result in returning cached results (no cache misses)"
          (let [num-misses (atom 0)]
            (binding [lib.metadata.cache/*cache-miss-hook* (fn [_k]
                                                             (swap! num-misses inc))]
              (is (seq (lib/visible-columns query')))
              (is (zero? @num-misses)))))))))
