(ns metabase.sync.sync-metadata-test
  (:require [clojure.test :refer :all]
            [metabase.models.database :refer [Database]]
            [metabase.sync.sync-metadata :as sync-metadata]
            [metabase.sync.sync-metadata
             [fields :as sync-fields]
             [fks :as sync-fks]
             [metabase-metadata :as metabase-metadata]
             [sync-timezone :as sync-tz]
             [tables :as sync-tables]]
            [metabase.test
             [data :as data]
             [sync :as test.sync :refer [crash-fn sync-steps-run-to-competion]]]))

(deftest survive-metadata-errors
  (testing "Make sure we survive metadata sync failing"
    (with-redefs [metabase-metadata/sync-metabase-metadata! crash-fn]
      (is (= (sync-steps-run-to-competion (sync-metadata/sync-db-metadata! (Database (data/id)))) 6)))))

(deftest survive-tz-errors
  (testing "Make sure we survive metadataDB timezone sync failing"
    (with-redefs [sync-tz/sync-timezone! crash-fn]
      (is (= (sync-steps-run-to-competion (sync-metadata/sync-db-metadata! (Database (data/id)))) 6)))))

(deftest survive-fields-errors
  (testing "Make sure we survive field sync failing"
    (with-redefs [sync-fields/sync-and-update! crash-fn]
      (is (= (sync-steps-run-to-competion (sync-metadata/sync-db-metadata! (Database (data/id)))) 6)))))

(deftest survive-table-errors
  (testing "Make sure we survive table sync failing"
    (with-redefs [sync-tables/create-or-reactivate-tables! crash-fn]
      (is (= (sync-steps-run-to-competion (sync-metadata/sync-db-metadata! (Database (data/id)))) 6)))
    (with-redefs [sync-tables/retire-tables! crash-fn]
      (is (= (sync-steps-run-to-competion (sync-metadata/sync-db-metadata! (Database (data/id)))) 6)))
    (with-redefs [sync-tables/update-table-description! crash-fn]
      (is (= (sync-steps-run-to-competion (sync-metadata/sync-db-metadata! (Database (data/id)))) 6)))))

(deftest survive-fk-errors
  (testing "Make sure we survive FK sync failing"
    (with-redefs [sync-fks/mark-fk! crash-fn]
      (is (= (sync-steps-run-to-competion (sync-metadata/sync-db-metadata! (Database (data/id)))) 6)))))
