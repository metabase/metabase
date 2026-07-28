(ns metabase.transforms.index-test-util
  "Shared per-driver cases and driver selectors for the transform-index e2e tests, used by both the `:table` suite
  ([[metabase.transforms.index-test]]) and the incremental suite ([[metabase-enterprise.transforms.incremental-test]])."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- postgres-indexes
  [database schema table]
  (->> (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec database)
                   ["SELECT indexname FROM pg_indexes WHERE schemaname = ? AND tablename = ?" schema table])
       (map :indexname)
       set))

(defn- redshift-table-attributes
  "Read a Redshift table's inline attributes back as `{:sortkey {:columns .. :style ..} :distkey <col-or-nil>}`.
  `sortkey` is the column's 1-based position in the key; an interleaved key alternates the sign, so a negative value
  anywhere means interleaved while `abs` still gives the position. `distkey` is true on the single KEY-dist column."
  [database schema table]
  (let [rows      (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec database)
                              [(str "SELECT column_name, sortkey, distkey FROM svv_redshift_columns "
                                    "WHERE schema_name = ? AND table_name = ? ORDER BY abs(sortkey)")
                               schema table])
        sort-rows (filter (comp (complement zero?) :sortkey) rows)]
    {:sortkey (when (seq sort-rows)
                {:columns (mapv :column_name sort-rows)
                 :style   (if (some (comp neg? :sortkey) sort-rows) :interleaved :compound)})
     :distkey (:column_name (first (filter :distkey rows)))}))

(defn- mysql-indexes
  [database schema table]
  ;; MySQL has no schemas, so `schema` is nil; fall back to the connection's database.
  (->> (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec database)
                   [(str "SELECT DISTINCT index_name FROM information_schema.statistics "
                         "WHERE table_schema = COALESCE(?, DATABASE()) AND table_name = ?")
                    schema table])
       (map :index_name)
       (remove #{"PRIMARY"})
       set))

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

(defn- bigquery-clustering
  "Clustering columns of `table` in dataset `schema`, in clustering order, read from INFORMATION_SCHEMA. BigQuery has no
  JDBC, so this runs through the QP as a native query rather than `jdbc/query`."
  [database schema table]
  (mapv first
        (mt/rows
         (mt/process-query
          {:database (:id database)
           :type     :native
           :native   {:query (format (str "SELECT column_name FROM `%s`.INFORMATION_SCHEMA.COLUMNS "
                                          "WHERE table_name = ? AND clustering_ordinal_position IS NOT NULL "
                                          "ORDER BY clustering_ordinal_position")
                                     schema)
                      :params [table]}}))))

(defn- snowflake-clustering
  "Read a Snowflake table's clustering key back as an ordered vector of column names, or [] when unclustered.
  `CLUSTERING_KEY` comes back as a string like `LINEAR(category, price)`."
  [database schema table]
  (let [clustering-key (-> (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec database)
                                       [(str "SELECT clustering_key FROM information_schema.tables "
                                             "WHERE table_schema = ? AND table_name = ?")
                                        schema table])
                           first :clustering_key)]
    (if-let [s (some-> clustering-key str/trim not-empty)]
      (let [inner (or (second (re-matches #"(?is)\s*LINEAR\s*\((.*)\)\s*" s)) s)]
        (->> (str/split inner #",")
             (map str/trim)
             (map #(str/replace % #"^\"|\"$" ""))
             (remove str/blank?)
             vec))
      [])))

(defn- sqlserver-indexes
  [database schema table]
  (->> (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec database)
                   [(str "SELECT i.name AS index_name FROM sys.indexes i "
                         "WHERE i.object_id = OBJECT_ID(?) AND i.type IN (1, 2) AND i.name IS NOT NULL")
                    (format "[%s].[%s]" schema table)])
       (map :index_name)
       set))

(def driver-cases
  "Driver -> test case: `:indexes` to declare (every method whose column types `transforms_products` can satisfy; the
  rest, e.g. Postgres gin/gist, live in the driver-level and fetch suites), `:physical-indexes` a
  `(fn [database schema table])` reading them back from the system catalog, and `:expected` what it should return.
  Target columns come from the transforms-test `transforms_products` (`category` text, `price` float)."
  {;; Postgres: standalone btree + brin (gin/gist need column types transforms_products doesn't have, so they're
   ;; exercised in the driver-level and fetch suites instead).
   :postgres   {:indexes          [{:kind :btree :name "by_category" :columns [{:name "category"}]}
                                   {:kind :brin :name "by_price_brin" :columns [{:name "price"}]}]
                :expected         #{"by_category" "by_price_brin"}
                :physical-indexes postgres-indexes}
   ;; Redshift: inline distkey + compound sortkey (the realistic combo). Interleaved is covered in fetch-cases.
   :redshift   {:indexes          [{:kind :distkey :style :key :columns [{:name "category"}]}
                                   {:kind :sortkey :style :compound :columns [{:name "price"}]}]
                :expected         {:sortkey {:columns ["price"] :style :compound} :distkey "category"}
                :physical-indexes redshift-table-attributes}
   ;; ClickHouse: inline order-by + standalone skip-index in one target. It echoes a single-column key/expr back in
   ;; parens, hence "(category)" and "(price)" (a multi-column key would read as a bare "a, b").
   :clickhouse {:indexes          [{:kind :order-by :columns [{:name "category"}]}
                                   {:kind    :skip-index :name "by_price" :type :minmax
                                    :columns [{:name "price"}] :granularity 1}]
                :expected         {:sorting-key  "(category)"
                                   :skip-indexes [{:name "by_price" :type "minmax" :expr "(price)" :granularity 1}]}
                :physical-indexes clickhouse-indexes}
   ;; btree goes on `price` because a TEXT column needs a prefix length to be btree-indexed; fulltext needs text,
   ;; so it goes on `category`.
   :mysql      {:indexes          [{:kind :btree :name "by_price" :columns [{:name "price"}]}
                                   {:kind :fulltext :name "ft_category" :columns [{:name "category"}]}]
                :expected         #{"by_price" "ft_category"}
                :physical-indexes mysql-indexes}
   ;; BigQuery: inline, unnamed clustering (`CLUSTER BY`), its only index-equivalent.
   :bigquery-cloud-sdk {:indexes          [{:kind :clustering :columns [{:name "category"}]}]
                        :expected         ["category"]
                        :physical-indexes bigquery-clustering}
   ;; Snowflake: a single standalone clustering key, reported unnamed, so we read back just the clustered columns.
   :snowflake  {:indexes          [{:kind :clustering :name "by_category" :columns [{:name "category"}]}]
                :expected         ["category"]
                :physical-indexes snowflake-clustering}
   ;; SQL Server: standalone clustered + nonclustered, both on `price` (FLOAT). The CTAS path types the text `category`
   ;; as VARCHAR(1024), but the Python create-table! path makes it NVARCHAR(MAX), which can't be an index key, so only
   ;; `price` is indexable through both transform paths.
   :sqlserver  {:indexes          [{:kind :clustered :name "by_price" :columns [{:name "price"}]}
                                   {:kind :nonclustered :name "by_price_nc" :columns [{:name "price"}]}]
                :expected         #{"by_price" "by_price_nc"}
                :physical-indexes sqlserver-indexes}})

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
   [{:label  "btree, unique, composite, INCLUDE, partial, gin, gist, brin, hash, expression, and the primary key"
     :table  "mb_fetch_pg"
     :create ["CREATE TABLE mb_fetch_pg (id INT PRIMARY KEY, user_id INT, email TEXT, a INT, b INT, data JSONB, created_at TIMESTAMP, p POINT)"
              "CREATE INDEX fc_btree ON mb_fetch_pg (user_id)"
              "CREATE UNIQUE INDEX fc_unique ON mb_fetch_pg (email)"
              "CREATE INDEX fc_ab ON mb_fetch_pg (a, b)"
              "CREATE INDEX fc_include ON mb_fetch_pg (a) INCLUDE (b, email)"
              "CREATE INDEX fc_partial ON mb_fetch_pg (user_id) WHERE user_id IS NOT NULL"
              "CREATE INDEX fc_gin ON mb_fetch_pg USING gin (data)"
              "CREATE INDEX fc_gist ON mb_fetch_pg USING gist (p)"
              "CREATE INDEX fc_brin ON mb_fetch_pg USING brin (created_at)"
              "CREATE INDEX fc_hash ON mb_fetch_pg USING hash (email)"
              "CREATE INDEX fc_expr ON mb_fetch_pg (lower(email))"
              "CREATE INDEX fc_mixed ON mb_fetch_pg (user_id, lower(email))"]
     :expected #{(idx "mb_fetch_pg_pkey" :btree "btree" ["id"] :unique true :primary true)
                 (idx "fc_btree" :btree "btree" ["user_id"])
                 (idx "fc_unique" :btree "btree" ["email"] :unique true)
                 (idx "fc_ab" :btree "btree" ["a" "b"])
                 (idx "fc_include" :btree "btree" ["a"] :include ["b" "email"])
                 (idx "fc_partial" :btree "btree" ["user_id"] :partial "(user_id IS NOT NULL)")
                 (idx "fc_gin" :gin "gin" ["data"])
                 (idx "fc_gist" :gist "gist" ["p"])
                 (idx "fc_brin" :brin "brin" ["created_at"])
                 (idx "fc_hash" :hash "hash" ["email"])
                 (idx "fc_expr" :btree "btree" ["lower(email)"])
                 ;; mixed column + expression: order preserved, the expression carries its text
                 (idx "fc_mixed" :btree "btree" ["user_id" "lower(email)"])}}
    {:label "a table with no indexes returns []"
     :table "mb_fetch_pg_empty"
     :create ["CREATE TABLE mb_fetch_pg_empty (a INT, b INT)"]
     :expected #{}}]

   :redshift
   [{:label  "the inline compound sortkey, unnamed, reconciled by kind + columns"
     :table  "mb_fetch_rs"
     :create ["CREATE TABLE mb_fetch_rs (a INT, b INT) COMPOUND SORTKEY (a, b)"]
     :expected #{(idx nil :sortkey nil ["a" "b"])}}
    {:label  "an interleaved sortkey, whose sortkey positions are negative, still orders by abs() position"
     :table  "mb_fetch_rs_interleaved"
     :create ["CREATE TABLE mb_fetch_rs_interleaved (a INT, b INT) INTERLEAVED SORTKEY (a, b)"]
     ;; same normalized shape as the compound case, so `:definition` is the only signal it's interleaved.
     ;; interleaved can't use AUTO distribution, so Redshift assigns EVEN; it surfaces as an unmanaged distkey.
     :definition-contains "INTERLEAVED"
     :expected #{(idx nil :sortkey nil ["a" "b"])
                 (idx nil :distkey "even" [])}}
    {:label  "a KEY distkey alongside a compound sortkey, both reported as unnamed inline rows"
     :table  "mb_fetch_rs_dist"
     :create ["CREATE TABLE mb_fetch_rs_dist (a INT, b INT) DISTSTYLE KEY DISTKEY (a) COMPOUND SORTKEY (b)"]
     :expected #{(idx nil :sortkey nil ["b"])
                 (idx nil :distkey "key" ["a"])}}
    {:label  "an EVEN distribution is reported as a column-less distkey, keyed by style"
     :table  "mb_fetch_rs_even"
     :create ["CREATE TABLE mb_fetch_rs_even (a INT, b INT) DISTSTYLE EVEN"]
     :expected #{(idx nil :distkey "even" [])}}
    {:label  "an ALL distribution is reported as a column-less distkey, distinct from EVEN"
     :table  "mb_fetch_rs_all"
     :create ["CREATE TABLE mb_fetch_rs_all (a INT, b INT) DISTSTYLE ALL"]
     :expected #{(idx nil :distkey "all" [])}}
    {:label  "a table with no explicit sortkey or distribution (AUTO) returns []"
     :table  "mb_fetch_rs_empty"
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
    {:label  "expression keys: a wrapped single-expr skip-index and an ORDER BY whose function key has an inner comma"
     :table  "mb_fetch_ch_expr"
     :create ["CREATE TABLE mb_fetch_ch_expr (a Int64, b Int64, s String) ENGINE = MergeTree ORDER BY (a, cityHash64(s, b))"
              "ALTER TABLE mb_fetch_ch_expr ADD INDEX ix_lower (lower(s)) TYPE set(100) GRANULARITY 1"
              "ALTER TABLE mb_fetch_ch_expr MATERIALIZE INDEX ix_lower"]
     ;; ClickHouse stores these verbatim: skip-index `expr` = `(lower(s))`, `sorting_key` = `a, cityHash64(s, b)`.
     :expected #{(idx "ix_lower" :skip-index "set" ["lower(s)"])
                 (idx nil :order-by nil ["a" "cityHash64(s, b)"])}}
    {:label "an unsorted table returns []"
     :table "mb_fetch_ch_empty"
     :create ["CREATE TABLE mb_fetch_ch_empty (a Int64) ENGINE = MergeTree ORDER BY ()"]
     :expected #{}}]

   :mysql
   [{:label  "btree, unique, composite, fulltext, and the auto PRIMARY KEY index"
     :table  "mb_fetch_mysql"
     :create ["CREATE TABLE mb_fetch_mysql (id INT PRIMARY KEY, user_id INT, email VARCHAR(255), a INT, b INT, body TEXT)"
              "CREATE INDEX fc_btree ON mb_fetch_mysql (user_id)"
              "CREATE UNIQUE INDEX fc_unique ON mb_fetch_mysql (email)"
              "CREATE INDEX fc_ab ON mb_fetch_mysql (a, b)"
              "CREATE FULLTEXT INDEX fc_ft ON mb_fetch_mysql (body)"]
     ;; the PRIMARY KEY surfaces as a unique btree index named 'PRIMARY'.
     :expected #{(idx "PRIMARY" :btree "btree" ["id"] :unique true :primary true)
                 (idx "fc_btree" :btree "btree" ["user_id"])
                 (idx "fc_unique" :btree "btree" ["email"] :unique true)
                 (idx "fc_ab" :btree "btree" ["a" "b"])
                 (idx "fc_ft" :fulltext "fulltext" ["body"])}}
    {:label "a table with no secondary indexes returns just the primary key"
     :table "mb_fetch_mysql_empty"
     :create ["CREATE TABLE mb_fetch_mysql_empty (id INT PRIMARY KEY, a INT)"]
     :expected #{(idx "PRIMARY" :btree "btree" ["id"] :unique true :primary true)}}]

   :bigquery-cloud-sdk
   [{:label  "the inline clustering, unnamed, reconciled by kind + columns"
     :table  "mb_fetch_bq"
     :create ["CREATE TABLE mb_fetch_bq (category STRING, price FLOAT64) CLUSTER BY category"]
     :expected #{(idx nil :clustering nil ["category"])}}
    {:label "a table with no clustering returns []"
     :table "mb_fetch_bq_empty"
     :create ["CREATE TABLE mb_fetch_bq_empty (a INT64, b INT64)"]
     :expected #{}}]

   ;; columns are quoted so snowflake keeps them lower-case; unquoted, the clustering key reads back as `CATEGORY`.
   :snowflake
   [{:label  "the clustering key, unnamed, reconciled by kind + columns"
     :table  "mb_fetch_sf"
     :create ["CREATE TABLE mb_fetch_sf (\"category\" TEXT, \"price\" FLOAT) CLUSTER BY (\"category\")"]
     :expected #{(idx nil :clustering nil ["category"])}}
    {:label "a table with no clustering key returns []"
     :table "mb_fetch_sf_empty"
     :create ["CREATE TABLE mb_fetch_sf_empty (\"a\" INT, \"b\" INT)"]
     :expected #{}}]

   :sqlserver
   [{:label  "clustered PK, nonclustered, unique, composite, INCLUDE, and a filtered index"
     :table  "mb_fetch_ss"
     ;; a named PK constraint so the clustered index has a deterministic name (the default is PK__mb_fetc__<hash>).
     :create ["CREATE TABLE mb_fetch_ss (id INT NOT NULL, user_id INT, email NVARCHAR(255), a INT, b INT, CONSTRAINT pk_fetch_ss PRIMARY KEY (id))"
              "CREATE INDEX fc_nc ON mb_fetch_ss (user_id)"
              "CREATE UNIQUE INDEX fc_unique ON mb_fetch_ss (email)"
              "CREATE INDEX fc_ab ON mb_fetch_ss (a, b)"
              "CREATE INDEX fc_include ON mb_fetch_ss (a) INCLUDE (b, email)"
              "CREATE INDEX fc_filtered ON mb_fetch_ss (user_id) WHERE user_id IS NOT NULL"]
     ;; a PRIMARY KEY surfaces as a unique CLUSTERED index; SQL Server normalizes the filter to bracketed parens.
     :expected #{(idx "pk_fetch_ss" :clustered "clustered" ["id"] :unique true :primary true)
                 (idx "fc_nc" :nonclustered "nonclustered" ["user_id"])
                 (idx "fc_unique" :nonclustered "nonclustered" ["email"] :unique true)
                 (idx "fc_ab" :nonclustered "nonclustered" ["a" "b"])
                 (idx "fc_include" :nonclustered "nonclustered" ["a"] :include ["b" "email"])
                 (idx "fc_filtered" :nonclustered "nonclustered" ["user_id"] :partial "([user_id] IS NOT NULL)")}}
    {:label "a heap with no indexes returns []"
     :table "mb_fetch_ss_empty"
     :create ["CREATE TABLE mb_fetch_ss_empty (a INT, b INT)"]
     :expected #{}}]})
