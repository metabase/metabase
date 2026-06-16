(ns metabase.transforms.index-test-util
  "Shared fixtures for the transform-index e2e tests: the per-driver test cases (what to declare, how to read the
  physical indexes back, what to expect) and the driver selectors. Used by both the `:table` suite
  ([[metabase.transforms.index-test]]) and the incremental suite
  ([[metabase-enterprise.transforms.incremental-test]]) so the two stay in sync on one set of cases."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test :as mt]))

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

(def driver-cases
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

(defn index-test-drivers
  "Drivers that run transforms and declare any index support."
  []
  (set/union (mt/normal-driver-select {:+features [:transforms/table :index/inline-create]})
             (mt/normal-driver-select {:+features [:transforms/table :index/standalone-create]})))

(defn python-index-test-drivers
  "Index-supporting drivers that also run Python transforms."
  []
  (set/intersection (index-test-drivers) (mt/normal-drivers-with-feature :transforms/python)))

(defn missing-case-message [driver]
  (str driver " declares index support (`:index/inline-create` or `:index/standalone-create`) but has no test "
       "coverage here. Add an entry for it to `driver-cases`."))

(defn bogus-indexes
  "`indexes` rewritten to point every column at a non-existent column, so applying them must fail (whether the
  driver inlines them into the CTAS or creates them standalone)."
  [indexes]
  (mapv #(assoc % :columns [{:name "definitely_not_a_real_column"}]) indexes))
