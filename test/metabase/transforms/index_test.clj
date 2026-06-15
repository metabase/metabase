(ns ^:mb/driver-tests metabase.transforms.index-test
  "End-to-end test that indexes declared on a transform target are applied to the physical target table when the
  transform runs, and re-applied when it runs again. Proves the Phase 1 wiring: `target.indexes` flows out of the
  target and through the creation lifecycle, whatever the driver's mix of `:inline` and `:standalone` index methods.

  The same assertions run for both transform kinds, since the target table is built at a different seam for each: a
  SQL transform creates it with a CTAS, a Python transform with `create-table!`. [[test-declared-indexes!]] is the
  shared body; [[declared-indexes-applied-and-replayed-test]] drives it with a SQL source and
  [[declared-indexes-applied-on-python-transform-test]] with a Python one.

  The test is driver-generic and selects drivers by feature, so it starts running for a driver the moment it
  declares `:index/inline-create` or `:index/standalone-create`. To add a driver, add an entry to [[driver-cases]];
  until then the test fails for that driver with instructions."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test :as mt]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.query-test-util :as query-test-util]
   [metabase.transforms.test-dataset :as transforms-dataset]
   [metabase.transforms.test-util :as transforms.tu :refer [with-transform-cleanup!]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- postgres-indexes
  [database schema table]
  (->> (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec database)
                   ["SELECT indexname FROM pg_indexes WHERE schemaname = ? AND tablename = ?" schema table])
       (map :indexname)
       set))

(defn- redshift-sortkey
  [database schema table]
  ;; `svv_redshift_columns.sortkey` encodes both facts in one column: a positive value is the column's 1-based
  ;; position in a COMPOUND key; an INTERLEAVED key alternates the sign, so any negative value marks the whole key
  ;; interleaved while `abs` still gives the position.
  (let [rows (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec database)
                         [(str "SELECT column_name, sortkey FROM svv_redshift_columns "
                               "WHERE schema_name = ? AND table_name = ? AND sortkey <> 0 ORDER BY abs(sortkey)")
                          schema table])]
    (when (seq rows)
      {:columns (mapv :column_name rows)
       :style   (if (some (comp neg? :sortkey) rows) :interleaved :compound)})))

(defn- clickhouse-indexes
  [database schema table]
  (let [spec (sql-jdbc.conn/db->pooled-connection-spec database)]
    {:sorting-key  (-> (jdbc/query spec ["SELECT sorting_key FROM system.tables WHERE database = ? AND name = ?"
                                         schema table])
                       first :sorting_key)
     :skip-indexes (->> (jdbc/query spec [(str "SELECT name, type, expr, granularity FROM"
                                               " system.data_skipping_indices WHERE database = ? AND table = ?")
                                          schema table])
                        (mapv #(update % :granularity long)))}))

(def ^:private driver-cases
  "Driver -> the test case for it: `:indexes` to declare on the transform target (should exercise every index method
  the driver supports), `:physical-indexes` a `(fn [database schema table])` that reads the indexes back out of the
  database's system catalog, and `:expected` the value it must return once they took effect. The target table is
  built from the transforms-test dataset's `transforms_products` (columns include `category` text and `price`
  float)."
  {;; Postgres: standalone btree
   :postgres   {:indexes          [{:kind :btree :name "by_category" :columns [{:name "category"}]}]
                :expected         #{"by_category"}
                :physical-indexes postgres-indexes}
   ;; Redshift: inline sortkey
   :redshift   {:indexes          [{:kind :sortkey :style :interleaved :columns [{:name "category"} {:name "price"}]}]
                :expected         {:columns ["category" "price"] :style :interleaved}
                :physical-indexes redshift-sortkey}
   ;; ClickHouse: inline order-by + standalone skip-index, both in one target. ClickHouse normalizes the index
   ;; expression in the catalog and reports a single column wrapped in parens, so `expr` reads back as "(price)".
   :clickhouse {:indexes          [{:kind :order-by :columns [{:name "category"}]}
                                   {:kind    :skip-index :name "by_price" :type :minmax
                                    :columns [{:name "price"}] :granularity 1}]
                :expected         {:sorting-key  "category"
                                   :skip-indexes [{:name "by_price" :type "minmax" :expr "(price)" :granularity 1}]}
                :physical-indexes clickhouse-indexes}})

(defn- index-test-drivers
  "Drivers that run transforms and declare any index support."
  []
  (set/union (mt/normal-driver-select {:+features [:transforms/table :index/inline-create]})
             (mt/normal-driver-select {:+features [:transforms/table :index/standalone-create]})))

(defn- python-index-test-drivers
  "Index-supporting drivers that also run Python transforms."
  []
  (set/intersection (index-test-drivers) (mt/normal-drivers-with-feature :transforms/python)))

(defn- missing-case-message [driver]
  (str driver " declares index support (`:index/inline-create` or `:index/standalone-create`) but has no test "
       "coverage here. Add an entry for it to `driver-cases`."))

(defn- query-source
  "A SQL transform source that selects the whole `transforms_products` table (built via a CTAS)."
  []
  {:type  :query
   :query (query-test-util/make-query
           {:source-table (t2/select-one-fn :name :model/Table (mt/id :transforms_products))})})

(defn- python-source
  "A Python transform source that returns `transforms_products` unchanged (built via `create-table!`), so the target
  carries the same columns the driver-cases indexes reference."
  []
  {:type            "python"
   :source-database (mt/id)
   :source-tables   [(transforms.tu/source-table-entry "transforms_products" (mt/id :transforms_products))]
   :body            "def transform(transforms_products):\n    return transforms_products"})

(defn- test-declared-indexes!
  "Shared body for both transform kinds: declare the driver's `:indexes` on a fresh target, run a transform whose
  source is built by the 0-arg `make-source`, and assert `:physical-indexes` reads `:expected` back from the
  catalog. Runs twice to prove the indexes survive a full rebuild."
  [{:keys [indexes expected physical-indexes]} make-source]
  (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
    (with-transform-cleanup! [{table-name :name :as target}
                              {:type    "table"
                               :schema  schema
                               :name    "idx_products"
                               :indexes indexes}]
      (mt/with-temp [:model/Transform transform {:name   "index-transform"
                                                 :source (make-source)
                                                 :target target}]
        (testing "a full run applies the declared indexes to the physical table"
          (transforms.execute/execute! transform {:run-method :manual})
          (transforms.tu/wait-for-table table-name 10000)
          (is (= expected (physical-indexes (mt/db) schema table-name))))
        (testing "a re-run rebuilds the table and the indexes come back with it"
          (transforms.execute/execute! transform {:run-method :manual})
          (is (= expected (physical-indexes (mt/db) schema table-name))))))))

(deftest ^:synchronized declared-indexes-applied-and-replayed-test
  (mt/test-drivers (index-test-drivers)
    (mt/dataset transforms-dataset/transforms-test
      (let [test-case (driver-cases driver/*driver*)]
        (is (some? test-case) (missing-case-message driver/*driver*))
        (when test-case
          (test-declared-indexes! test-case query-source))))))

(deftest ^:synchronized ^:mb/transforms-python-test declared-indexes-applied-on-python-transform-test
  (mt/test-drivers (python-index-test-drivers)
    (mt/with-premium-features #{:transforms-basic :transforms-python}
      (mt/dataset transforms-dataset/transforms-test
        (let [test-case (driver-cases driver/*driver*)]
          (is (some? test-case) (missing-case-message driver/*driver*))
          (when test-case
            (test-declared-indexes! test-case python-source)))))))
