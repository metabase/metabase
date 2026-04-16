(ns metabase-enterprise.semantic-search.index-embedding-test
  "Tests for things at the intersection of the index and embedding namespaces."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase.test :as mt]))

(def ^:private test-provider "ai-service")
(def ^:private test-short-model-name "short-model")
(def ^:private test-long-model-name "some-really-really-really-really-really-long-model-name-that-will-exceed-the-limit")
(def ^:private test-vector-dimensions 1024)

;; Postgres truncates identifier names to 63 bytes (+ 1 byte for a terminating NULL). Ensure that names do not exceed the limit
(deftest ^:parallel index-embedding-name-length-test
  (mt/with-premium-features #{:semantic-search}
    (testing "Truncates if name would be longer than the 63 byte Postgres limit"
      (doseq [name-func [#'semantic.index/hnsw-index-name
                         #'semantic.index/fts-index-name
                         #'semantic.index/fts-native-index-name
                         :table-name]]
        (testing (str name-func)
          (testing "long"
            (is (>= 63 (count (name-func (semantic.index/default-index {:provider          test-provider
                                                                        :model-name        test-long-model-name
                                                                        :vector-dimensions test-vector-dimensions})))))
            (testing "remains unique"
              (not= (name-func (semantic.index/default-index {:provider          test-provider
                                                              :model-name        (str test-long-model-name "a")
                                                              :vector-dimensions test-vector-dimensions}))
                    (name-func (semantic.index/default-index {:provider          test-provider
                                                              :model-name        (str test-long-model-name "aa")
                                                              :vector-dimensions test-vector-dimensions})))))
          (testing "short"
            (is (>= 63 (count (name-func (semantic.index/default-index {:provider          test-provider
                                                                        :model-name        test-short-model-name
                                                                        :vector-dimensions test-vector-dimensions})))))))))))
