(ns metabase.typed-schemas.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.typed-schemas.core :as typed-schemas]
   [metabase.typed-schemas.source :as source]))

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

(defn- literal-source
  "A [[source/SchemaSource]] over literal values. `tables` are filtered by the
  requested table ids so tests can see which tables fetching asked for."
  [{:keys [database-ids collection-ids library-scope library-tables
           questions models metrics tables]}]
  (reify source/SchemaSource
    (database-ids [_ _] database-ids)
    (collection-ids [_ _] collection-ids)
    (library-scope [_ _] library-scope)
    (questions [_ _ _] (vec questions))
    (models [_ _] (vec models))
    (metrics [_ _ _] (vec metrics))
    (tables [_ _ table-ids] (cond->> (vec tables)
                              table-ids (filterv #(contains? table-ids (:id %)))))
    (library-tables [_ _] (vec library-tables))))

;; fetch-items decides *what* to fetch; the source supplies literal rows, so
;; the test pins the scoping rules, not the db.
(deftest fetch-items-includes-tables-mapped-by-library-metrics-test
  (let [source (literal-source
                {:library-scope  {:metric-collection-ids #{20}
                                  :data-collection-ids   #{10}}
                 :library-tables [{:id 10}]
                 :metrics        [{:type "metric", :key "revenue", :id 1, :mappedTableIds [42]}]
                 :tables         [{:id 10, :type "table", :key "publishedTable"}
                                  {:id 42, :type "table", :key "mappedTable"}
                                  {:id 99, :type "table", :key "notInScope"}]})]
    (is (= {:questions []
            :models    []
            :tables    [{:id 10, :type "table", :key "publishedTable"}
                        {:id 42, :type "table", :key "mappedTable"}]
            :metrics   [{:type "metric", :key "revenue", :id 1, :mappedTableIds [42]}]}
           (typed-schemas/fetch-items {:include-data-library? true} source)))))
