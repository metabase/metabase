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
  a `(fn [database schema table])` reading them back from the system catalog, and `:expected` what it should return.
  Target columns come from the transforms-test `transforms_products` (`category` text, `price` float)."
  {;; Postgres: standalone btree
   :postgres   {:indexes          [{:kind :btree :name "by_category" :columns [{:name "category"}]}]
                :expected         #{"by_category"}
                :physical-indexes postgres-indexes}
   ;; Redshift: inline sortkey
   :redshift   {:indexes          [{:kind :sortkey :style :interleaved :columns [{:name "category"} {:name "price"}]}]
                :expected         {:columns ["category" "price"] :style :interleaved}
                :physical-indexes redshift-sortkey}
   ;; ClickHouse: inline order-by + standalone skip-index in one target. It echoes a single-column key/expr back in
   ;; parens, hence "(category)" and "(price)" (a multi-column key would read as a bare "a, b").
   :clickhouse {:indexes          [{:kind :order-by :columns [{:name "category"}]}
                                   {:kind    :skip-index :name "by_price" :type :minmax
                                    :columns [{:name "price"}] :granularity 1}]
                :expected         {:sorting-key  "(category)"
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
  "`indexes` rewritten to reference a non-existent column, so applying them must fail."
  [indexes]
  (mapv #(assoc % :columns [{:name "definitely_not_a_real_column"}]) indexes))

(defn- idx
  "A normalized [[metabase.driver/fetch-table-indexes]] entry (sans `:definition`) with defaults, for terse `:expected`."
  [nm kind access-method key-columns & {:keys [unique primary include partial]
                                        :or   {unique false primary false include [] partial nil}}]
  {:name nm :kind kind :access-method access-method :is-unique unique :is-primary primary :is-valid true
   :key-columns key-columns :include-columns include :partial-predicate partial})

(def fetch-cases
  "Driver -> fetch-correctness cases. Each case creates `:table` via the literal `:create` statements (popular index
  kinds, made directly so we cover catalog shapes the apply path never produces, e.g. Postgres gin/partial), and
  `:expected` is the set of normalized [[metabase.driver/fetch-table-indexes]] maps (sans `:definition`) it must return.
  Index models differ, so a case carries however many indexes that driver puts on one table."
  {:postgres
   [{:label  "btree, unique, composite, INCLUDE, partial, gin, brin, hash, expression, and the primary key"
     :table  "mb_fetch_pg"
     :create ["CREATE TABLE mb_fetch_pg (id INT PRIMARY KEY, user_id INT, email TEXT, a INT, b INT, data JSONB, created_at TIMESTAMP)"
              "CREATE INDEX fc_btree ON mb_fetch_pg (user_id)"
              "CREATE UNIQUE INDEX fc_unique ON mb_fetch_pg (email)"
              "CREATE INDEX fc_ab ON mb_fetch_pg (a, b)"
              "CREATE INDEX fc_include ON mb_fetch_pg (a) INCLUDE (b, email)"
              "CREATE INDEX fc_partial ON mb_fetch_pg (user_id) WHERE user_id IS NOT NULL"
              "CREATE INDEX fc_gin ON mb_fetch_pg USING gin (data)"
              "CREATE INDEX fc_brin ON mb_fetch_pg USING brin (created_at)"
              "CREATE INDEX fc_hash ON mb_fetch_pg USING hash (email)"
              "CREATE INDEX fc_expr ON mb_fetch_pg (lower(email))"]
     :expected #{(idx "mb_fetch_pg_pkey" :btree "btree" ["id"] :unique true :primary true)
                 (idx "fc_btree" :btree "btree" ["user_id"])
                 (idx "fc_unique" :btree "btree" ["email"] :unique true)
                 (idx "fc_ab" :btree "btree" ["a" "b"])
                 (idx "fc_include" :btree "btree" ["a"] :include ["b" "email"])
                 (idx "fc_partial" :btree "btree" ["user_id"] :partial "(user_id IS NOT NULL)")
                 (idx "fc_gin" :gin "gin" ["data"])
                 (idx "fc_brin" :brin "brin" ["created_at"])
                 (idx "fc_hash" :hash "hash" ["email"])
                 (idx "fc_expr" :btree "btree" [nil])}}
    {:label "a table with no indexes returns []"
     :table "mb_fetch_pg_empty"
     :create ["CREATE TABLE mb_fetch_pg_empty (a INT, b INT)"]
     :expected #{}}]

   :redshift
   [{:label  "the inline sortkey, unnamed, reconciled by kind + columns"
     :table  "mb_fetch_rs"
     :create ["CREATE TABLE mb_fetch_rs (a INT, b INT) COMPOUND SORTKEY (a, b)"]
     :expected #{(idx nil :sortkey nil ["a" "b"])}}
    {:label "a table with no sortkey returns []"
     :table "mb_fetch_rs_empty"
     :create ["CREATE TABLE mb_fetch_rs_empty (a INT, b INT)"]
     :expected #{}}]

   :clickhouse
   [{:label  "the inline ORDER BY (unnamed) and named skip-indexes (minmax, set)"
     :table  "mb_fetch_ch"
     :create ["CREATE TABLE mb_fetch_ch (a Int64, b Int64) ENGINE = MergeTree ORDER BY (a, b)"
              "ALTER TABLE mb_fetch_ch ADD INDEX by_minmax (a) TYPE minmax GRANULARITY 1"
              "ALTER TABLE mb_fetch_ch MATERIALIZE INDEX by_minmax"
              "ALTER TABLE mb_fetch_ch ADD INDEX by_set (b) TYPE set(100) GRANULARITY 1"
              "ALTER TABLE mb_fetch_ch MATERIALIZE INDEX by_set"]
     :expected #{(idx "by_minmax" :skip-index "minmax" ["a"])
                 (idx "by_set" :skip-index "set" ["b"])
                 (idx nil :order-by nil ["a" "b"])}}
    {:label "an unsorted table returns []"
     :table "mb_fetch_ch_empty"
     :create ["CREATE TABLE mb_fetch_ch_empty (a Int64) ENGINE = MergeTree ORDER BY ()"]
     :expected #{}}]})
