(ns metabase.transforms.index-test-util
  "Shared per-driver cases and driver selectors for the transform-index e2e tests, used by both the `:table` suite
  ([[metabase.transforms.index-test]]) and the incremental suite ([[metabase-enterprise.transforms.incremental-test]])."
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
  ;; `sortkey` is the column's 1-based position in the key; an interleaved key alternates the sign, so a negative
  ;; value anywhere means interleaved while `abs` still gives the position.
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
  "Driver -> test case: `:indexes` to declare (covering every index method the driver supports), `:physical-indexes`
  a `(fn [database schema table])` reading them back from the system catalog, `:expected` what it should return, and
  `:fetched` the normalized [[metabase.driver/fetch-table-indexes]] maps (sans `:definition`) for the same indexes.
  Target columns come from the transforms-test `transforms_products` (`category` text, `price` float)."
  {;; Postgres: standalone btree
   :postgres   {:indexes          [{:kind :btree :name "by_category" :columns [{:name "category"}]}]
                :expected         #{"by_category"}
                :physical-indexes postgres-indexes
                :fetched          #{{:name "by_category" :kind :btree :access_method "btree"
                                     :is_unique false :is_primary false :is_valid true
                                     :key_columns ["category"] :include_columns [] :partial_predicate nil}}}
   ;; Redshift: inline sortkey
   :redshift   {:indexes          [{:kind :sortkey :style :interleaved :columns [{:name "category"} {:name "price"}]}]
                :expected         {:columns ["category" "price"] :style :interleaved}
                :physical-indexes redshift-sortkey
                :fetched          #{{:name nil :kind :sortkey :access_method nil
                                     :is_unique false :is_primary false :is_valid true
                                     :key_columns ["category" "price"] :include_columns [] :partial_predicate nil}}}
   ;; ClickHouse: inline order-by + standalone skip-index in one target. It echoes a single-column key/expr back in
   ;; parens, hence "(category)" and "(price)" (a multi-column key would read as a bare "a, b").
   :clickhouse {:indexes          [{:kind :order-by :columns [{:name "category"}]}
                                   {:kind    :skip-index :name "by_price" :type :minmax
                                    :columns [{:name "price"}] :granularity 1}]
                :expected         {:sorting-key  "(category)"
                                   :skip-indexes [{:name "by_price" :type "minmax" :expr "(price)" :granularity 1}]}
                :physical-indexes clickhouse-indexes
                :fetched          #{{:name "by_price" :kind :skip-index :access_method "minmax"
                                     :is_unique false :is_primary false :is_valid true
                                     :key_columns ["price"] :include_columns [] :partial_predicate nil}
                                    {:name nil :kind :order-by :access_method nil
                                     :is_unique false :is_primary false :is_valid true
                                     :key_columns ["category"] :include_columns [] :partial_predicate nil}}}})

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
  "`indexes` rewritten to reference a non-existent column, so applying them must fail."
  [indexes]
  (mapv #(assoc % :columns [{:name "definitely_not_a_real_column"}]) indexes))
