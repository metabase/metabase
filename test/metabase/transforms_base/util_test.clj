(ns ^:mb/driver-tests metabase.transforms-base.util-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.query-test-util :as query-test-util]
   [metabase.transforms.test-dataset :as transforms-dataset]
   [metabase.transforms.test-util :as transforms.tu :refer [with-transform-cleanup!]]
   [toucan2.core :as t2]))

(defn- mbql-source
  "Build an MBQL transform source map for the given db and table."
  [db-id table-id]
  (let [mp    (lib-be/application-database-metadata-provider db-id)
        query (lib/query mp (lib.metadata/table mp table-id))]
    {:type "query" :query query}))

;;; ------------------------------------------------ predict-target-fields ------------------------------------------------

(deftest predict-target-fields-mbql-test
  (testing "predicts fields from an MBQL query against the test database"
    (mt/with-premium-features #{:transforms-basic}
      (let [predicted (transforms-base.u/predict-target-fields (mbql-source (mt/id) (mt/id :orders)))]
        (is (pos? (count predicted)))
        (is (contains? (set (map :name predicted)) "SUBTOTAL"))
        (doseq [col predicted]
          (is (string? (:name col)))
          (is (string? (:display-name col)))
          (is (keyword? (:base-type col)))
          (is (keyword? (:effective-type col)))
          (is (integer? (:position col))))))))

(deftest predict-target-fields-mbql-over-native-card-test
  (testing "predicts fields from an MBQL query whose source is a native SQL card"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/Card card {:name            "Native Source"
                                       :database_id     (mt/id)
                                       :dataset_query   {:database (mt/id)
                                                         :type     :native
                                                         :native   {:query "SELECT 1 AS id, 2.0 AS total"}}
                                       :result_metadata [{:name "id", :base_type :type/Integer
                                                          :display_name "ID", :field_ref [:field "id" {:base-type :type/Integer}]}
                                                         {:name "total", :base_type :type/Float
                                                          :display_name "Total", :field_ref [:field "total" {:base-type :type/Float}]}]}]
        (let [mp        (lib-be/application-database-metadata-provider (mt/id))
              card-meta (lib.metadata/card mp (:id card))
              query     (lib/query mp card-meta)
              source    {:type "query" :query query}
              predicted (transforms-base.u/predict-target-fields source)]
          (is (= 2 (count predicted)))
          (is (= #{"id" "total"} (set (map :name predicted))))
          (testing "types are resolved from the card's result_metadata"
            (let [by-name (into {} (map (juxt :name identity)) predicted)]
              (is (= :type/Integer (:base-type (get by-name "id"))))
              (is (= :type/Float (:base-type (get by-name "total")))))))))))

(deftest ^:mb/driver-tests predict-target-fields-native-test
  (testing "predicts fields from a native SQL query using sql-parsing"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms-basic}
        (mt/dataset transforms-dataset/transforms-test
          (let [products-table (t2/select-one :model/Table (mt/id :transforms_products))
                source {:type "query"
                        :query {:database (mt/id)
                                :type     :native
                                :native   {:query (str "SELECT name, price FROM "
                                                       (when (:schema products-table)
                                                         (str (:schema products-table) "."))
                                                       (:name products-table))}}}
                predicted (transforms-base.u/predict-target-fields source)]
            (is (= 2 (count predicted)))
            (testing "column names are normalized to match driver casing"
              (doseq [col predicted]
                (is (string? (:name col)))
                (is (keyword? (:base-type col)))
                (is (integer? (:position col)))))
            (testing "pure pass-through columns resolve source types"
              (doseq [col predicted]
                (is (not= :type/* (:base-type col))
                    (str "field " (:name col) " should resolve to a concrete type, not :type/*"))))))))))

(deftest predict-target-fields-python-test
  (testing "returns nil for python transforms"
    (is (nil? (transforms-base.u/predict-target-fields {:type "python"
                                                        :body "df = ctx.source.orders"})))))

;;; ------------------------------------------------ sync-target-fields! ------------------------------------------------

(deftest sync-target-fields!-no-fields-exist-test
  (testing "table exists with no fields — all predicted fields are created"
    (mt/with-temp [:model/Table target {:db_id (mt/id) :name "target_no_fields" :schema "public"
                                        :active false :transform_target true
                                        :data_source :metabase-transform :data_authority :computed
                                        :initial_sync_status "complete"}]
      (let [predicted [{:name "id"    :display-name "ID"    :base-type :type/Integer :effective-type :type/Integer :position 0}
                       {:name "total" :display-name "Total" :base-type :type/Float   :effective-type :type/Float   :position 1}]
            result    (transforms-base.u/sync-target-fields! (:id target) predicted)]
        (is (= {:created 2 :retired 0} result))
        (let [fields (t2/select :model/Field :table_id (:id target) {:order-by [[:position :asc]]})]
          (is (= 2 (count fields)))
          (is (= ["id" "total"] (mapv :name fields)))
          (is (every? :active fields)))))))

(deftest sync-target-fields!-some-fields-exist-test
  (testing "table exists with some matching and some stale fields — matching kept, stale retired, new created"
    (mt/with-temp [:model/Table target      {:db_id (mt/id) :name "target_some_fields" :schema "public"
                                             :active false :transform_target true
                                             :data_source :metabase-transform :data_authority :computed
                                             :initial_sync_status "complete"}
                   :model/Field existing-id {:table_id (:id target) :name "id"
                                             :base_type :type/BigInteger :database_type "BIGINT"
                                             :display_name "Custom ID" :active true}
                   :model/Field _stale      {:table_id (:id target) :name "old_col"
                                             :base_type :type/Text :database_type "VARCHAR"
                                             :active true}]
      (let [predicted [{:name "id"    :display-name "ID"    :base-type :type/Integer :effective-type :type/Integer :position 0}
                       {:name "total" :display-name "Total" :base-type :type/Float   :effective-type :type/Float   :position 1}]
            result    (transforms-base.u/sync-target-fields! (:id target) predicted)]
        (is (= {:created 1 :retired 1} result))
        (testing "matching field is kept with its original metadata"
          (let [id-field (t2/select-one :model/Field :id (:id existing-id))]
            (is (true? (:active id-field)))
            (is (= "Custom ID" (:display_name id-field)))
            (is (= :type/BigInteger (:base_type id-field)))))
        (testing "new field is created"
          (let [total-field (t2/select-one :model/Field :table_id (:id target) :name "total")]
            (is (some? total-field))
            (is (true? (:active total-field)))
            (is (= :type/Float (:base_type total-field)))))
        (testing "stale field is retired (inactive), not deleted"
          (let [old-field (t2/select-one :model/Field :table_id (:id target) :name "old_col")]
            (is (some? old-field) "stale field should still exist in the database")
            (is (false? (:active old-field)))))
        (testing "only predicted fields are active"
          (is (= #{"id" "total"}
                 (t2/select-fn-set :name :model/Field :table_id (:id target) :active true))))))))

(deftest sync-target-fields!-all-fields-stale-test
  (testing "table exists with fields that are all stale — all retired, all predicted created"
    (mt/with-temp [:model/Table target {:db_id (mt/id) :name "target_all_stale" :schema "public"
                                        :active false :transform_target true
                                        :data_source :metabase-transform :data_authority :computed
                                        :initial_sync_status "complete"}
                   :model/Field _old1  {:table_id (:id target) :name "gone_a"
                                        :base_type :type/Text :database_type "VARCHAR" :active true}
                   :model/Field _old2  {:table_id (:id target) :name "gone_b"
                                        :base_type :type/Integer :database_type "INT" :active true}]
      (let [predicted [{:name "new_x" :display-name "New X" :base-type :type/Float :effective-type :type/Float :position 0}]
            result    (transforms-base.u/sync-target-fields! (:id target) predicted)]
        (is (= {:created 1 :retired 2} result))
        (is (= #{"new_x"} (t2/select-fn-set :name :model/Field :table_id (:id target) :active true)))
        (is (= #{"gone_a" "gone_b"} (t2/select-fn-set :name :model/Field :table_id (:id target) :active false)))))))

(deftest sync-target-fields!-already-inactive-fields-ignored-test
  (testing "already-inactive fields are not re-retired"
    (mt/with-temp [:model/Table target    {:db_id (mt/id) :name "target_inactive" :schema "public"
                                           :active false :transform_target true
                                           :data_source :metabase-transform :data_authority :computed
                                           :initial_sync_status "complete"}
                   :model/Field _inactive {:table_id (:id target) :name "old"
                                           :base_type :type/Text :database_type "VARCHAR" :active false}]
      (let [predicted [{:name "id" :display-name "ID" :base-type :type/Integer :effective-type :type/Integer :position 0}]
            result    (transforms-base.u/sync-target-fields! (:id target) predicted)]
        (is (= {:created 1 :retired 0} result))
        (is (= #{"id"} (t2/select-fn-set :name :model/Field :table_id (:id target) :active true)))))))

;;; ------------------------------------------------ seed-target-fields! (end-to-end) ------------------------------------------------

(deftest seed-target-fields!-end-to-end-test
  (testing "seed-target-fields! chains predict -> sync"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/Table target {:db_id (mt/id) :name "target_seed_e2e" :schema "public"
                                          :active false :transform_target true
                                          :data_source :metabase-transform :data_authority :computed
                                          :initial_sync_status "complete"}]
        (let [source (mbql-source (mt/id) (mt/id :orders))
              result (transforms-base.u/seed-target-fields! (:id target) source)]
          (is (pos? (:created result)))
          (is (= 0 (:retired result)))
          (is (pos? (t2/count :model/Field :table_id (:id target) :active true))))))))

(deftest seed-target-fields!-via-transform-insert-test
  (testing "inserting a transform seeds fields for its target table"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/Collection coll      {:name "Transforms" :namespace :transforms}
                     :model/Transform  transform {:name          "My Transform"
                                                  :collection_id (:id coll)
                                                  :source        {:query (-> (mbql-source (mt/id) (mt/id :orders)) :query)
                                                                  :type  "query"}
                                                  :target        {:database (mt/id)
                                                                  :type     "table"
                                                                  :schema   "public"
                                                                  :name     "my_target"}}]
        (testing "transform was created with target_table_id"
          (is (some? (:target_table_id transform))))
        (testing "target table has seeded fields"
          (let [fields (t2/select :model/Field :table_id (:target_table_id transform)
                                  {:order-by [[:position :asc]]})]
            (is (pos? (count fields)))
            (is (contains? (set (map :name fields)) "SUBTOTAL"))))))))

;;; ------------------------------------------------ e2e: seed -> execute -> sync ------------------------------------------------

(deftest ^:mb/driver-tests seed-then-execute-then-sync-test
  (testing "Seeded provisional fields are fleshed out by sync after transform execution"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms-basic}
        (mt/dataset transforms-dataset/transforms-test
          (let [schema (transforms.tu/default-schema-or-public)]
            (with-transform-cleanup! [target {:type   "table"
                                              :schema schema
                                              :name   "seeded_products"}]
              (let [query     (query-test-util/make-query {:source-table (t2/select-one-fn :name :model/Table (mt/id :transforms_products))})
                    transform (t2/insert-returning-instance! :model/Transform
                                                             {:name   "seed-test-transform"
                                                              :source {:type  :query
                                                                       :query query}
                                                              :target target})]
                (testing "step 1: seeded fields exist with placeholder database_type"
                  (let [seeded (t2/select :model/Field :table_id (:target_table_id transform) :active true)]
                    (is (pos? (count seeded)) "should have seeded fields")
                    (doseq [f seeded]
                      (is (= "NULL" (:database_type f))
                          (str "seeded field " (:name f) " should have placeholder database_type")))))
                (testing "step 2: execute transform creates the physical table"
                  (transforms.execute/execute! transform {:run-method :manual})
                  (transforms.tu/wait-for-table (:name target) 10000))
                (testing "step 3: after sync, fields have real database types"
                  (let [table  (t2/select-one :model/Table :id (:target_table_id transform))
                        _      (sync/sync-table! table)
                        fields (t2/select :model/Field :table_id (:id table) :active true)]
                    (is (pos? (count fields)))
                    (doseq [f fields]
                      (is (not= "NULL" (:database_type f))
                          (str "field " (:name f) " should have a real database_type after sync")))))))))))))
