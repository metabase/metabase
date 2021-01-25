(ns metabase.api.testing-test
  (:require [clojure.test :refer :all]
            [metabase.api.testing :as testing]
            [metabase.db.connection :as mdb.conn]
            [metabase.test :as mt]
            [metabase.util :as u]))

(deftest snapshot-test
  (when (= (mdb.conn/db-type) :h2)
    (testing "Just make sure the snapshot endpoint doesn't crash."
      (is (= nil
             (mt/user-http-request :rasta :post 204 "testing/snapshot/default")))
      (testing "File should have been created"
        (is (.exists (java.io.File. (#'testing/snapshot-path-for-name :default))))))))

(deftest restore-test
  (when (= (mdb.conn/db-type) :h2)
    (testing "Should throw Exception if file does not exist"
      (is (= "Not found."
             (mt/user-http-request :rasta :post 404 (format "testing/restore/%s" (mt/random-name))))))))

(deftest e2e-test
  (when (= (mdb.conn/db-type) :h2)
    (testing "Should be able to snapshot & restore stuff"
      (let [snapshot-name (munge (u/qualified-name ::test-snapshot))]
        (is (= nil
               (mt/user-http-request :rasta :post 204 (format "testing/snapshot/%s" snapshot-name))))
        (is (= nil
               (mt/user-http-request :rasta :post 204 (format "testing/restore/%s" snapshot-name))))))))
