(ns metabase-enterprise.semantic-search.without-init-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.core :as semantic]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.test :as mt]))

(use-fixtures :once #'semantic.tu/once-fixture)

;; When booting a new install from a fresh app db, we can wind up getting calls into the search backend from things
;; like loading the sample or audit db content before search has been initialized, and therefore before receiving an
;; init! call. These tests ensure that we can handle such calls and don't throw if it does happen.

(defn- without-init! [test-func]
  (mt/with-premium-features #{:semantic-search}
    (try
      (semantic.tu/cleanup-index-metadata! (semantic.env/get-pgvector-datasource!)
                                           semantic.tu/mock-index-metadata)
      (with-redefs [semantic.db.datasource/data-source          (atom nil)
                    semantic.env/get-index-metadata             (constantly semantic.tu/mock-index-metadata)
                    semantic.env/get-configured-embedding-model (constantly semantic.tu/mock-embedding-model)
                    semantic.index/model-table-suffix           semantic.tu/mock-table-suffix]
        (test-func))
      (finally
        (semantic.tu/cleanup-index-metadata! (semantic.env/get-pgvector-datasource!) semantic.tu/mock-index-metadata)))))

(deftest update-index!-without-init!-test
  (without-init!
   #(testing "update-index! is a no-op without init!"
      (is (nil? (semantic/update-index! (semantic.tu/mock-documents))))
      (is (not (semantic.tu/table-exists-in-db? (:table-name semantic.tu/mock-index)))))))

(deftest delete-from-index!-without-init!-test
  (without-init!
   #(testing "delete-from-index! is a no-op without init!"
      (is (nil? (semantic/delete-from-index! "card" ["123"])))
      (is (not (semantic.tu/table-exists-in-db? (:table-name semantic.tu/mock-index)))))))
