(ns metabase.sample-data.example-content-test
  (:require
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.query-processor :as qp]
   [metabase.sample-data.example-content :as example-content]
   [metabase.sample-data.impl]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- sample-database-db []
  {:details (#'metabase.sample-data.impl/try-to-extract-sample-database! :sqlite)
   :engine  :sqlite
   :name    "Sample Database"})

(defn- field-ids-in-query
  "All numeric field ids referenced anywhere in a (pMBQL) dataset_query."
  [query]
  (let [ids (volatile! #{})]
    (walk/postwalk
     (fn [x]
       (when (and (vector? x) (= :field (first x)))
         (let [id (last x)]
           (when (number? id) (vswap! ids conj id))))
       x)
     query)
    @ids))

(defn- table-ids-in-query
  "All numeric :source-table ids referenced anywhere in a (pMBQL) dataset_query."
  [query]
  (let [ids (volatile! #{})]
    (walk/postwalk
     (fn [x]
       (when (and (map? x) (number? (:source-table x)))
         (vswap! ids conj (:source-table x)))
       x)
     query)
    @ids))

(deftest recreate-example-content-test
  (mt/with-model-cleanup [:model/Collection :model/Card :model/Dashboard :model/DashboardCard
                          :model/Dimension :model/Permissions]
    ;; Pre-create an unrelated database with tables/fields so the sample DB's synced table/field ids do
    ;; NOT coincide with the EDN ids - otherwise the remap would be an identity no-op and prove nothing.
    (mt/with-temp [:model/Database other {}
                   :model/Table    ot {:db_id (:id other)}]
      (doseq [i (range 120)]
        (t2/insert! :model/Field {:table_id (:id ot) :name (str "filler_" i) :base_type :type/Integer
                                  :database_type "INT" :position i}))
      (mt/with-temp [:model/Database db (sample-database-db)]
        (sync/sync-database! db)
        (example-content/recreate-example-content! (:id db))
        (let [cards     (t2/select :model/Card :database_id (:id db))
              coll-ids  (set (keep :collection_id cards))
              valid-fid (set (t2/select-fn-set :id :model/Field
                                               {:join  [[:metabase_table :t] [:= :t.id :metabase_field.table_id]]
                                                :where [:= :t.db_id (:id db)]}))
              valid-tid (set (t2/select-fn-set :id :model/Table :db_id (:id db)))]
          (testing "the example cards are recreated against the new sample database"
            (is (= 39 (count cards)))
            (is (every? #(= (:id db) (:database_id %)) cards)))
          (testing "every card lives in the example collection"
            (is (seq coll-ids))
            (is (every? :is_sample (t2/select :model/Collection :id [:in coll-ids]))))
          (testing "every field/table reference in every card resolves to a real column of the new database"
            (doseq [card cards]
              (let [q (:dataset_query card)]
                (doseq [fid (field-ids-in-query q)]
                  (is (contains? valid-fid fid)
                      (format "card %s references missing field %s" (:name card) fid)))
                (doseq [st (table-ids-in-query q)]
                  (is (contains? valid-tid st)
                      (format "card %s references missing table %s" (:name card) st))))))
          (testing "the dashboard and its dashcards are recreated and resolve to recreated cards"
            (let [dash      (t2/select-one :model/Dashboard :collection_id [:in coll-ids])
                  dashcards (t2/select :model/DashboardCard :dashboard_id (:id dash))
                  card-ids  (set (map :id cards))]
              (is (some? dash))
              (is (pos? (count dashcards)))
              (is (every? #(or (nil? (:card_id %)) (contains? card-ids (:card_id %))) dashcards))))
          (testing "a recreated card actually runs against the new sample database"
            (let [runnable (first (filter #(and (nil? (:source_card_id %))
                                                (= :question (:type %))
                                                (seq (table-ids-in-query (:dataset_query %))))
                                          cards))]
              (is (some? runnable))
              (is (pos? (count (mt/rows (qp/process-query (:dataset_query runnable)))))))))))))
