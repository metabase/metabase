(ns ^:mb/driver-tests metabase.transforms.index-test
  "End-to-end test that indexes declared on a transform target are applied to the physical target table when the
  transform runs, and re-applied when it runs again. Proves the Phase 1 wiring: `target.indexes` flows out of the
  target and through the creation lifecycle, whatever the driver's mix of `:inline` and `:standalone` index methods.

  The test is driver-generic and selects drivers by feature, so it starts running for a driver the moment it
  declares `:index/inline-create` or `:index/standalone-create`. To add a driver, implement [[index-fixture]] and
  [[physical-indexes]] below; until then the `:default` methods fail the test with instructions."
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

;;; Both multimethods dispatch on the exact driver keyword, deliberately without the driver hierarchy: a child driver
;;; (e.g. Redshift under Postgres) supports different index methods than its parent, so inheriting the parent's
;;; fixture would assert the wrong thing. Every driver gets its own explicit pair.

(defmulti index-fixture
  "The indexes to declare on the transform target for `driver`, and the value [[physical-indexes]] must read back
  once they took effect: `{:indexes [...], :expected ...}`. Should exercise every index method the driver supports.
  The target table is built from the transforms-test dataset's `transforms_products` (columns include `category`
  text and `price` float)."
  {:arglists '([driver])}
  identity)

(defmulti physical-indexes
  "Read the indexes on `schema`.`table` back out of `database`'s system catalog, in the same shape as the
  `:expected` value of this driver's [[index-fixture]]."
  {:arglists '([driver database schema table])}
  (fn [driver _database _schema _table] driver))

(defmethod index-fixture :default
  [driver]
  (throw (ex-info (str driver " declares index support (`:index/inline-create` or `:index/standalone-create`) but "
                       "has no test coverage here. Implement `index-fixture` and `physical-indexes` for it in "
                       (namespace `index-fixture) ".")
                  {:driver driver})))

(defmethod physical-indexes :default
  [driver _database _schema _table]
  (throw (ex-info (str "No `physical-indexes` implementation for " driver " in " (namespace `index-fixture) ".")
                  {:driver driver})))

;;; --- Postgres: standalone btree ---

(defmethod index-fixture :postgres
  [_driver]
  {:indexes  [{:kind :btree :name "by_category" :columns [{:name "category"}]}]
   :expected #{"by_category"}})

(defmethod physical-indexes :postgres
  [_driver database schema table]
  (->> (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec database)
                   ["SELECT indexname FROM pg_indexes WHERE schemaname = ? AND tablename = ?" schema table])
       (map :indexname)
       set))

;;; --- Redshift: inline sortkey ---

(defmethod index-fixture :redshift
  [_driver]
  {:indexes  [{:kind :sortkey :style :interleaved :columns [{:name "category"} {:name "price"}]}]
   :expected {:columns ["category" "price"] :style :interleaved}})

(defmethod physical-indexes :redshift
  [_driver database schema table]
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

;;; --- ClickHouse: inline order-by + standalone skip-index, both in one target ---

(defmethod index-fixture :clickhouse
  [_driver]
  {:indexes  [{:kind :order-by :columns [{:name "category"}]}
              {:kind    :skip-index :name "by_price" :type :minmax
               :columns [{:name "price"}] :granularity 1}]
   ;; ClickHouse normalizes the index expression in the catalog and reports a single column wrapped in parens, so
   ;; `expr` reads back as "(price)".
   :expected {:sorting-key  "category"
              :skip-indexes [{:name "by_price" :type "minmax" :expr "(price)" :granularity 1}]}})

(defmethod physical-indexes :clickhouse
  [_driver database schema table]
  (let [spec (sql-jdbc.conn/db->pooled-connection-spec database)]
    {:sorting-key  (-> (jdbc/query spec ["SELECT sorting_key FROM system.tables WHERE database = ? AND name = ?"
                                         schema table])
                       first :sorting_key)
     :skip-indexes (->> (jdbc/query spec [(str "SELECT name, type, expr, granularity FROM"
                                               " system.data_skipping_indices WHERE database = ? AND table = ?")
                                          schema table])
                        (mapv #(update % :granularity long)))}))

;;; --- the test ---

(defn- index-test-drivers
  "Drivers that run transforms and declare any index support."
  []
  (set/union (mt/normal-driver-select {:+features [:transforms/table :index/inline-create]})
             (mt/normal-driver-select {:+features [:transforms/table :index/standalone-create]})))

(deftest ^:synchronized declared-indexes-applied-and-replayed-test
  (mt/test-drivers (index-test-drivers)
    (mt/dataset transforms-dataset/transforms-test
      (let [driver driver/*driver*
            {:keys [indexes expected]} (index-fixture driver)
            schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
        (with-transform-cleanup! [{table-name :name :as target}
                                  {:type    "table"
                                   :schema  schema
                                   :name    "idx_products"
                                   :indexes indexes}]
          (let [source-table (t2/select-one-fn :name :model/Table (mt/id :transforms_products))
                query        (query-test-util/make-query {:source-table source-table})]
            (mt/with-temp [:model/Transform transform {:name   "index-transform"
                                                       :source {:type :query :query query}
                                                       :target target}]
              (testing "a full run applies the declared indexes to the physical table"
                (transforms.execute/execute! transform {:run-method :manual})
                (transforms.tu/wait-for-table table-name 10000)
                (is (= expected (physical-indexes driver (mt/db) schema table-name))))
              (testing "a re-run rebuilds the table and the indexes come back with it"
                (transforms.execute/execute! transform {:run-method :manual})
                (is (= expected (physical-indexes driver (mt/db) schema table-name)))))))))))
