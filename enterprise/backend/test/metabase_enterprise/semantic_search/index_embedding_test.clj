(ns metabase-enterprise.semantic-search.index-embedding-test
  "Tests for things at the intersection of the index and embedding namespaces."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase.test :as mt]))

(deftest ^:parallel index-embedding-name-length-test
  (mt/with-premium-features #{:semantic-search}
    (testing "index names never exceed 63 bytes for any embedding model"
      ;; Postgres truncates indentifier names to 63 bytes (+ 1 byte for a terminating NULL). Ensure that none of the
      ;; index names exceed this limit for any embedding provider + model combination.
      (doseq [provider (keys semantic.embedding/supported-models-for-provider)
              [model vector-dimensions] (get semantic.embedding/supported-models-for-provider provider)
              name-func [:table-name
                         #'semantic.index/hnsw-index-name
                         #'semantic.index/fts-index-name
                         #'semantic.index/fts-native-index-name]]
        (testing (str "\n" provider " " model " " vector-dimensions "\n" name-func)
          (let [index (-> {:provider provider
                           :model-name model
                           :vector-dimensions vector-dimensions}
                          semantic.index/default-index)]
            (is (>= 63 (-> index name-func count)))))))))
