(ns metabase.sync.sync-metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.sync-metadata.fields :as sync-fields]
   [metabase.sync.sync-metadata.fks :as sync-fks]
   [metabase.sync.sync-metadata.metabase-metadata :as metabase-metadata]
   [metabase.sync.sync-metadata.sync-timezone :as sync-tz]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.test :as mt]
   [metabase.test.sync :refer [sync-survives-crash?!]]
   [toucan2.core :as t2]))

(deftest survive-metadata-errors
  (testing "Make sure we survive metadata sync failing"
    (sync-survives-crash?! metabase-metadata/sync-metabase-metadata!)))

(deftest survive-tz-errors
  (testing "Make sure we survive metadataDB timezone sync failing"
    (sync-survives-crash?! sync-tz/sync-timezone!)))

(deftest survive-fields-errors
  (testing "Make sure we survive field sync failing"
    (sync-survives-crash?! sync-fields/sync-and-update!)))

(deftest survive-table-errors
  (testing "Make sure we survive table sync failing"
    (sync-survives-crash?! sync-tables/create-or-reactivate-tables!)
    (sync-survives-crash?! sync-tables/retire-tables!)
    (sync-survives-crash?! sync-tables/update-tables-metadata-if-needed!)))

(deftest survive-fk-errors
  (testing "Make sure we survive FK sync failing"
    (sync-survives-crash?! sync-fks/mark-fk!)))

(deftest metadata-fetch-failure-aborts-initial-sync-test
  (testing "When fetching DB metadata throws (e.g. Athena lacking glue:GetDatabases, GHY-3534),"
    (testing "the initial sync status is marked aborted instead of left stuck at \"incomplete\""
      (mt/with-temp [:model/Database db {:initial_sync_status "incomplete"}]
        (with-redefs [fetch-metadata/db-metadata (fn [_] (throw (ex-info "boom" {})))]
          (is (thrown? Throwable
                       (#'sync-metadata/sync-db-metadata!* db))))
        (is (= "aborted"
               (t2/select-one-fn :initial_sync_status :model/Database (:id db))))))))
