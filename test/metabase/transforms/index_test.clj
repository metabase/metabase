(ns ^:mb/driver-tests metabase.transforms.index-test
  "End-to-end tests that indexes declared on a transform target are applied to the physical target table when the
  transform runs. Proves the Phase 1 wiring: `target.indexes` flows out of the target and through the creation
  lifecycle. Postgres exercises the standalone path, where the index is a btree created via `compile-create-index`
  after the table exists (in `complete-execution!`). ClickHouse exercises a mixed-kind target through one run: the
  inline order-by must ride the CTAS while the standalone skip-index is created afterwards."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test :as mt]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.query-test-util :as query-test-util]
   [metabase.transforms.test-dataset :as transforms-dataset]
   [metabase.transforms.test-util :as transforms.tu :refer [with-transform-cleanup!]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- table-index-names
  "Names of the indexes on `schema`.`table`, read back out of the Postgres catalog."
  [spec schema table]
  (->> (jdbc/query spec ["SELECT indexname FROM pg_indexes WHERE schemaname = ? AND tablename = ?" schema table])
       (map :indexname)
       set))

(deftest ^:synchronized standalone-index-applied-on-full-run-test
  (testing "a btree index declared on a transform target is created on the physical table after a full run"
    (mt/test-driver :postgres
      (mt/dataset transforms-dataset/transforms-test
        (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
          (with-transform-cleanup! [{table-name :name :as target}
                                    {:type    "table"
                                     :schema  schema
                                     :name    "idx_products"
                                     :indexes [{:kind :btree :name "by_category" :columns [{:name "category"}]}]}]
            (let [source-table (t2/select-one-fn :name :model/Table (mt/id :transforms_products))
                  query        (query-test-util/make-query {:source-table source-table})]
              (mt/with-temp [:model/Transform transform {:name   "index-transform"
                                                         :source {:type :query :query query}
                                                         :target target}]
                (transforms.execute/execute! transform {:run-method :manual})
                (transforms.tu/wait-for-table table-name 10000)
                (let [spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))]
                  (is (contains? (table-index-names spec schema table-name) "by_category")
                      (str "expected by_category on " table-name
                           ", got " (pr-str (table-index-names spec schema table-name)))))))))))))

(deftest ^:synchronized mixed-kind-indexes-applied-on-full-run-test
  (testing "a ClickHouse target with an inline order-by and a standalone skip-index gets both after a full run"
    (mt/test-driver :clickhouse
      (mt/dataset transforms-dataset/transforms-test
        (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
          (with-transform-cleanup! [{table-name :name :as target}
                                    {:type    "table"
                                     :schema  schema
                                     :name    "idx_products"
                                     :indexes [{:kind :order-by :columns [{:name "category"}]}
                                               {:kind    :skip-index :name "by_price" :type :minmax
                                                :columns [{:name "price"}] :granularity 1}]}]
            (let [source-table (t2/select-one-fn :name :model/Table (mt/id :transforms_products))
                  query        (query-test-util/make-query {:source-table source-table})]
              (mt/with-temp [:model/Transform transform {:name   "index-transform"
                                                         :source {:type :query :query query}
                                                         :target target}]
                (transforms.execute/execute! transform {:run-method :manual})
                (transforms.tu/wait-for-table table-name 10000)
                (let [spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))]
                  (testing "the inline order-by set the MergeTree sorting key"
                    (is (= "category"
                           (-> (jdbc/query spec ["SELECT sorting_key FROM system.tables WHERE database = ? AND name = ?"
                                                 schema table-name])
                               first :sorting_key))))
                  (testing "the standalone skip-index exists with the declared shape"
                    ;; ClickHouse normalizes the index expression in the catalog and reports a single column wrapped
                    ;; in parens, so `expr` reads back as "(price)".
                    (is (= {:name "by_price" :type "minmax" :expr "(price)" :granularity 1}
                           (some-> (jdbc/query spec [(str "SELECT name, type, expr, granularity FROM"
                                                          " system.data_skipping_indices WHERE database = ? AND table = ?")
                                                     schema table-name])
                                   first
                                   (update :granularity long))))))))))))))
