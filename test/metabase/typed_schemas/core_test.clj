(ns metabase.typed-schemas.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.typed-schemas.core :as typed-schemas]
   [metabase.typed-schemas.schema.metric :as schema.metric]
   [metabase.typed-schemas.schema.table :as schema.table]
   [metabase.typed-schemas.scope :as scope]))

(def ^:private test-info
  {:generated-at "2026-01-01T00:00:00Z"
   :instance-url "https://metabase.example.com"})

(deftest options-reject-unknown-keys-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"Invalid semantic schema options\."
                        (typed-schemas/fetch-items {:unknown-option true}))))

(deftest options-reject-collection-and-database-scopes-together-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"mutually exclusive"
                        (typed-schemas/fetch-items {:database {:id 1}
                                                    :include-data-library? true}))))

(deftest create-schema-assembles-items-test
  (is (= {:schemaVersion 2
          :generatedAt   "2026-01-01T00:00:00Z"
          :metabase      {:instanceUrl "https://metabase.example.com"}
          :questions     {"ordersByMonth" {:type "card", :key "ordersByMonth", :id 1}}
          :models        {"orders" {:actions {"create" {:kind "action", :id 9}}}}
          :tables        {"orders" {:type "table", :key "orders", :id 3}}
          :metrics       {"revenue" {:type "metric", :key "revenue", :id 2}}}
         (typed-schemas/create-schema
          {:questions [{:type "card", :key "ordersByMonth", :id 1}]
           :models    [{:key "orders", :name "Orders", :actions {"create" {:kind "action", :id 9}}}]
           :tables    [{:type "table", :key "orders", :id 3}]
           :metrics   [{:type "metric", :key "revenue", :id 2}]}
          test-info))))

(deftest create-schema-disambiguates-duplicate-keys-test
  (let [schema (typed-schemas/create-schema
                {:questions []
                 :models    []
                 :tables    [{:type "table", :key "orders", :id 3}
                             {:type "table", :key "orders", :id 4}]
                 :metrics   []}
                test-info)]
    (is (= ["orders3" "orders4"] (keys (:tables schema))))
    (is (= ["orders3" "orders4"] (map :key (vals (:tables schema)))))))

(deftest create-schema-defaults-info-test
  (let [schema (typed-schemas/create-schema {:questions [], :models [], :tables [], :metrics []})]
    (is (string? (:generatedAt schema)))
    (is (contains? (:metabase schema) :instanceUrl))))

;; fetch-items decides *what* to select; the selection functions themselves are
;; stubbed with literal rows so the test pins the scoping rules, not the db.
(deftest fetch-items-includes-tables-mapped-by-library-metrics-test
  (with-redefs [scope/library-scope                (constantly {:metric-collection-ids #{20}
                                                                :data-collection-ids   #{10}})
                schema.metric/metric-schemas       (fn [_database-ids _collection-ids]
                                                     [{:type "metric", :key "revenue", :id 1, :mappedTableIds [42]}])
                schema.table/select-library-tables (constantly [{:id 10}])
                schema.table/select-tables         (fn [_database-ids table-ids]
                                                     (map (fn [id] {:id id}) (sort table-ids)))
                schema.table/table-schemas         (fn [tables]
                                                     (mapv #(assoc % :type "table" :key (str "table" (:id %))) tables))]
    (is (= {:questions []
            :models    []
            :tables    [{:id 10, :type "table", :key "table10"}
                        {:id 42, :type "table", :key "table42"}]
            :metrics   [{:type "metric", :key "revenue", :id 1, :mappedTableIds [42]}]}
           (typed-schemas/fetch-items {:include-data-library? true})))))
