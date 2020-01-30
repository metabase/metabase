(ns metabase.sync.sync-metadata-test
  (:require [clojure.test :refer :all]
            [metabase.sync.sync-metadata
             [fields :as sync-fields]
             [fks :as sync-fks]
             [metabase-metadata :as metabase-metadata]
             [sync-timezone :as sync-tz]
             [tables :as sync-tables]]
            [metabase.test.sync :refer [sync-survives-crash?]]))

(deftest survive-metadata-errors
  (testing "Make sure we survive metadata sync failing"
    (sync-survives-crash? metabase-metadata/sync-metabase-metadata!)))

(deftest survive-tz-errors
  (testing "Make sure we survive metadataDB timezone sync failing"
    (sync-survives-crash? sync-tz/sync-timezone!)))

(deftest survive-fields-errors
  (testing "Make sure we survive field sync failing"
    (sync-survives-crash? sync-fields/sync-and-update!)))

(deftest survive-table-errors
  (testing "Make sure we survive table sync failing"
    (sync-survives-crash? sync-tables/create-or-reactivate-tables!)
    (sync-survives-crash? sync-tables/retire-tables!)
    (sync-survives-crash? sync-tables/update-table-description!)))

(deftest survive-fk-errors
  (testing "Make sure we survive FK sync failing"
    (sync-survives-crash? sync-fks/mark-fk!)))
