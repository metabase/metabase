(ns metabase.sync.request-workspace-test
  "A sync writes the metadata that every workspace shares, so it runs in no workspace that a request names: with the
  Databases' own logins, and the instance's own table remappings."
  (:require
   [clojure.test :refer :all]
   [metabase.driver.util :as driver.u]
   [metabase.sync.core :as sync]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.util :as sync-util]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [metabase.workspaces.core :as workspaces]
   [toucan2.core :as t2]))

(deftest sync-operation-runs-in-no-workspace-test
  (testing "a sync operation that a request in a workspace starts runs in no workspace"
    (let [seen (atom #{})]
      (workspaces/with-workspace-id 12
        (sync-util/sync-operation :sync-metadata (driver.u/lib-database (mt/id)) "test sync"
          (swap! seen conj (workspaces/current-workspace-id))))
      (is (= #{nil} @seen)))))

(deftest table-sync-runs-in-no-workspace-test
  (let [seen      (atom #{})
        fields-of (mt/original-fn #'fetch-metadata/table-fields-metadata)
        table     (t2/select-one :model/Table :id (mt/id :venues))]
    (mt/with-dynamic-fn-redefs [fetch-metadata/table-fields-metadata (fn [database table]
                                                                       (swap! seen conj (workspaces/current-workspace-id))
                                                                       (fields-of database table))]
      (workspaces/with-workspace-id 12
        (testing "a sync of a table that a request in a workspace starts reads the warehouse in no workspace"
          (sync/sync-table! table)
          (is (= #{nil} @seen)))
        (testing "so does a sync of its fields alone"
          (reset! seen #{})
          (sync/sync-fields-for-table! table)
          (is (= #{nil} @seen)))))))

(deftest stored-field-values-are-read-in-no-workspace-test
  (let [seen   (atom #{})
        values (mt/original-fn #'field-values/distinct-values)]
    (mt/with-dynamic-fn-redefs [field-values/distinct-values (fn [field]
                                                               (swap! seen conj (workspaces/current-workspace-id))
                                                               (values field))]
      (workspaces/with-workspace-id 12
        (testing "the values of a field that every workspace shares are read in no workspace"
          (field-values/create-or-update-full-field-values! (t2/select-one :model/Field :id (mt/id :venues :price)))
          (is (= #{nil} @seen)))))))
