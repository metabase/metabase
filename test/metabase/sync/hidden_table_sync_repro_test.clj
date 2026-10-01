(ns metabase.sync.hidden-table-sync-repro-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.analyze :as analyze]
   [metabase.sync.util :as sync-util]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- fake-table [& {:as extra}]
  (merge {:db_id (mt/id) :schema nil :name "VENUES"} extra))

(defn- fake-field [table]
  {:table_id (u/the-id table) :name "PRICE" :base_type "type/Integer"})

(defn- in-sync-tables? [table]
  (contains? (into #{} (map :id) (sync-util/reducible-sync-tables (mt/id))) (u/the-id table)))

(defn- analyzed? [field]
  (assert (t2/exists? :model/Field :id (u/the-id field)))
  (t2/exists? :model/Field :id (u/the-id field) :last_analyzed [:not= nil]))

(defn- analyze-db! []
  (analyze/analyze-db! (t2/select-one :model/Database :id (mt/id))))

(deftest visible-table-is-analyzed-sanity-test
  (testing "a visible table is in the sync set and its fields are analyzed"
    (mt/with-temp [:model/Table table (fake-table)
                   :model/Field field (fake-field table)]
      (is (in-sync-tables? table))
      (analyze-db!)
      (is (analyzed? field)))))

(deftest raw-hidden-table-is-not-synced-control-test
  (testing "a table with visibility_type hidden on metabase_table is excluded from sync"
    (mt/with-temp [:model/Table table (fake-table :visibility_type "hidden")
                   :model/Field field (fake-field table)]
      (is (not (in-sync-tables? table)))
      (analyze-db!)
      (is (not (analyzed? field))))))

(deftest ui-hidden-table-is-not-synced-test
  (testing "a table hidden via PUT /api/table/:id is excluded from sync"
    (mt/with-temp [:model/Table table (fake-table)
                   :model/Field field (fake-field table)]
      (mt/user-http-request :crowberto :put 200 (format "table/%d" (u/the-id table)) {:visibility_type "hidden"})
      (is (= :hidden (t2/select-one-fn :visibility_type :model/TableUserSettings :table_id (u/the-id table))))
      (is (not (in-sync-tables? table)))
      (analyze-db!)
      (is (not (analyzed? field))))))

(deftest data-layer-hidden-table-is-not-synced-test
  (testing "a table hidden via POST /api/data-studio/table/edit is excluded from sync"
    (mt/with-temp [:model/Table table (fake-table)
                   :model/Field field (fake-field table)]
      (mt/user-http-request :crowberto :post 200 "data-studio/table/edit"
                            {:table_ids [(u/the-id table)] :data_layer "hidden"})
      (is (= :hidden (t2/select-one-fn :data_layer :model/TableUserSettings :table_id (u/the-id table))))
      (is (= {:visibility_type :hidden :visibility_type_set true}
             (t2/select-one [:model/TableUserSettings :visibility_type :visibility_type_set] :table_id (u/the-id table))))
      (is (not (in-sync-tables? table)))
      (analyze-db!)
      (is (not (analyzed? field))))))
