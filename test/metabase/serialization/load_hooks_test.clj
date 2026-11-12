(ns metabase.serialization.load-hooks-test
  (:require
   [clojure.test :refer :all]
   [metabase.serialization.core :as serialization]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- export-all [model objects]
  (into [] (serialization/export model objects)))

(deftest data-model-import-updates-local-rows-test
  (testing "imported Databases, Tables and Fields update the local rows at their paths"
    (mt/with-temp [:model/Database {db-id :id :as db}       {:name "serdes hooks" :engine :postgres}
                   :model/Table    {table-id :id :as table} {:db_id db-id :schema "public" :name "t" :description "t"}
                   :model/Field    field                    {:table_id table-id :name "f" :description "f"}]
      (let [exported (concat (export-all :model/Database [db])
                             (export-all :model/Table [table])
                             (export-all :model/Field [field]))]
        (t2/update! :model/Table :id table-id {:description "changed"})
        (t2/update! :model/Field :id (:id field) {:description "changed"})
        (is (= [] (serialization/load-all (map serialization/key-of exported) (partial mapv (into {} (map (juxt serialization/key-of identity)) exported)))))
        (is (= "t" (t2/select-one-fn :description :model/Table :id table-id)))
        (is (= "f" (t2/select-one-fn :description :model/Field :id (:id field))))
        (is (= 1 (t2/count :model/Database :name "serdes hooks")))
        (is (= 1 (t2/count :model/Table :db_id db-id :name "t")))))))

(deftest snippet-name-conflict-test
  (testing "an imported snippet named like another snippet gets a (copy) suffix"
    (mt/with-temp [:model/NativeQuerySnippet snippet {:name "serdes snippet" :content "1"}]
      (let [[exported] (export-all :model/NativeQuerySnippet [snippet])
            other      (assoc exported :entity_id "AAAAAAAAAAAAAAAAAAAAA"
                              :serdes/meta [{:model "NativeQuerySnippet"}])]
        (try
          (serialization/load :model/NativeQuerySnippet [other])
          (is (= "serdes snippet (copy)"
                 (t2/select-one-fn :name :model/NativeQuerySnippet :entity_id "AAAAAAAAAAAAAAAAAAAAA")))
          (finally
            (t2/delete! :model/NativeQuerySnippet :entity_id "AAAAAAAAAAAAAAAAAAAAA")))))))

(deftest dashboard-question-cycle-test
  (testing "a dashboard question and its dashboard import together, each pointing at the other"
    (mt/with-temp [:model/Collection    {coll-id :id :as coll} {}
                   :model/Dashboard     {dash-id :id :as dash} {:collection_id coll-id}
                   :model/Card          {card-id :id :as card} {:collection_id coll-id :dashboard_id dash-id}
                   :model/DashboardCard _                      {:dashboard_id dash-id :card_id card-id}]
      (let [exported (concat (export-all :model/Collection [coll])
                             (export-all :model/Dashboard [dash])
                             (export-all :model/Card [card]))]
        (t2/delete! :model/DashboardCard :dashboard_id dash-id)
        (is (= [] (serialization/load-all (map serialization/key-of exported) (partial mapv (into {} (map (juxt serialization/key-of identity)) exported)))))
        (is (= dash-id (t2/select-one-fn :dashboard_id :model/Card :id card-id)))
        (is (= [card-id] (t2/select-fn-vec :card_id :model/DashboardCard :dashboard_id dash-id)))))))
