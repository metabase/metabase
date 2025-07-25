(ns metabase-enterprise.semantic-search.without-init-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.core :as semantic]
   [metabase-enterprise.semantic-search.db :as semantic.db]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.test :as mt]))

;; When booting a new install from a fresh app db, we can wind up getting calls into the search backend from things
;; like loading the sample or audit db content before search has been initialized, and therefore before receiving an
;; init! call. These tests ensure that we can handle such calls and don't throw if it does happen.

(defn- without-init! [test-func]
  (mt/with-premium-features #{:semantic-search}
    (try
      (with-redefs [semantic.db/data-source (atom nil)
                    semantic/get-index-metadata (constantly semantic.tu/mock-index-metadata)
                    semantic/get-configured-embedding-model (constantly semantic.tu/mock-embedding-model)]
        (test-func))
      (finally
        (semantic.index/drop-index-table! semantic.tu/db semantic.tu/mock-index)))))

(deftest reindex!-without-init!-test
  (without-init!
   #(testing "reindex! works without init!"
      (is (= {"card" 1, "dashboard" 1}
             (semantic/reindex! (semantic.tu/mock-documents) {})))
      (semantic.tu/check-index-has-mock-docs))))

(deftest update-index!-without-init!-test
  (without-init!
   #(testing "update-index! works without init!"
      (is (= {"card" 1, "dashboard" 1}
             (semantic/update-index! (semantic.tu/mock-documents))))
      (semantic.tu/check-index-has-mock-docs))))

(deftest delete-from-index!-without-init!-test
  (without-init!
   #(testing "delete-from-index! is a no-op without init!"
      (is (nil? (semantic/delete-from-index! "card" ["123"])))
      (is (not (semantic.tu/table-exists-in-db? (:table-name semantic.tu/mock-index)))))))
