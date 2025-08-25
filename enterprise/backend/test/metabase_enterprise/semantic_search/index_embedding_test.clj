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
(def ^:private pg-limit-error-pattern #"exceeds PostgreSQL limit")

;; Postgres truncates indentifier names to 63 bytes (+ 1 byte for a terminating NULL). Ensure that errors are thrown
;; if a resource name would exceed the limit for any embedding provider + model combination.
(deftest ^:parallel index-embedding-name-length-test
  (mt/with-premium-features #{:semantic-search}
    (testing "Throws if index name would be longer than the 63 byte Postgres limit"
      (doseq [name-func [#'semantic.index/hnsw-index-name
                         #'semantic.index/fts-index-name
                         #'semantic.index/fts-native-index-name]]
        (testing (str name-func)
          (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                pg-limit-error-pattern
                                (-> {:provider test-provider
                                     :model-name test-long-model-name
                                     :vector-dimensions test-vector-dimensions}
                                    semantic.index/default-index))))))
    (testing "Succeeds if index name would be less than the 63 byte Postgres limit"
      (let [index (-> {:provider test-provider
                       :model-name test-short-model-name
                       :vector-dimensions test-vector-dimensions}
                      semantic.index/default-index)]
        (doseq [name-func [#'semantic.index/hnsw-index-name
                           #'semantic.index/fts-index-name
                           #'semantic.index/fts-native-index-name]]
          (testing (str name-func)
            (is (string? (name-func index)))
            (is (< (count (name-func index)) 64))))))))

(deftest ^:parallel table-name-length-test
  (mt/with-premium-features #{:semantic-search}
    (testing "Throws if table name exceeds 63 byte Postgres limit"
      (let [embedding-model {:provider test-provider
                             :model-name test-long-model-name
                             :vector-dimensions test-vector-dimensions}]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"Table name exceeds PostgreSQL limit"
                              (semantic.index/model-table-name embedding-model)))))
    (testing "Succeeds if table name would be less than the 63 byte Postgres limit"
      (let [embedding-model {:provider test-provider
                             :model-name test-short-model-name
                             :vector-dimensions test-vector-dimensions}]
        (is (string? (semantic.index/model-table-name embedding-model)))
        (is (< (count (semantic.index/model-table-name embedding-model)) 64))))))
