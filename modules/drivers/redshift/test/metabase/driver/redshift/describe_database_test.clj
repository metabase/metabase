(ns ^:mb/driver-tests metabase.driver.redshift.describe-database-test
  "Compares the table query `describe-database` sends against the one it replaced, in isolation.

  `outgoing-get-tables-sql` is a frozen copy of the query as it stood before the schema filter was pushed into SQL.
  `schema-pushdown-vs-outgoing-live-test` runs both against a real Redshift, reports the rows each returns and how
  long each takes, and asserts that the two agree on the tables `describe-database` ends up keeping."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver.redshift :as redshift]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.sync.describe-database :as sql-jdbc.describe-database]
   [metabase.driver.sync :as driver.s]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- outgoing-get-tables-sql
  "The table query as it stood before the schema filter was pushed into SQL, frozen on purpose.

  Never update it to follow [[metabase.driver.redshift]]. It is the baseline the current query is measured against,
  and a copy rewritten to match whatever production sends measures nothing."
  []
  [(str/join
    "\n"
    ["select"
     "  c.relname as name,"
     "  n.nspname as schema,"
     "  case c.relkind"
     "    when 'r' then 'table'"
     "    when 'p' then 'partitioned table'"
     "    when 'v' then 'view'"
     "    when 'f' then 'foreign table'"
     "    when 'm' then 'materialized view'"
     "    end as type,"
     "  d.description"
     "  from pg_catalog.pg_namespace n, pg_catalog.pg_class c"
     "  left join pg_catalog.pg_description d on c.oid = d.objoid and d.objsubid = 0"
     "  left join pg_catalog.pg_class dc on d.classoid=dc.oid and dc.relname='pg_class'"
     "  left join pg_catalog.pg_namespace dn on dn.oid=dc.relnamespace and dn.nspname='pg_catalog'"
     "  where c.relnamespace = n.oid"
     "    and n.nspname !~ '^information_schema|catalog_history|pg_|metabase_cache_'"
     "    and c.relkind in ('r', 'p', 'v', 'f', 'm')"
     "    and pg_catalog.has_schema_privilege(n.oid, 'USAGE')"
     "    and (pg_catalog.has_table_privilege(c.oid,'SELECT')"
     "         or pg_catalog.has_any_column_privilege(c.oid,'SELECT'))"
     "union all"
     "select"
     "  tablename as name,"
     "  schemaname as schema,"
     "  'EXTERNAL TABLE' as type,"
     "  null as description"
     "from svv_external_tables t"
     "where schemaname !~ '^information_schema|catalog_history|pg_|metabase_cache_'"
     "  and pg_catalog.has_schema_privilege(t.schemaname, 'USAGE')"])])

(deftest ^:parallel outgoing-baseline-carries-no-parameters-test
  (testing "the frozen baseline must not gain the pushdown, or the live comparison measures a query against itself"
    (is (= 1 (count (outgoing-get-tables-sql))))))

(defn- timed-query
  [spec statement]
  (let [timer (u/start-timer)
        rows  (vec (jdbc/query spec statement))]
    {:rows rows, :ms (u/since-ms timer)}))

;; One top-level fn per query so a profiler can tell them apart: two `jdbc/query` calls made inline from the same
;; place share a call stack, and clj-async-profiler folds them into a single flamegraph node that cannot be split
;; apart afterwards.
(defn- run-outgoing-query
  [spec]
  (timed-query spec (outgoing-get-tables-sql)))

(defn- run-current-query
  [spec inclusion-patterns]
  (timed-query spec (#'redshift/get-tables-sql inclusion-patterns)))

(def ^:private measurement-rounds 3)

(deftest schema-pushdown-vs-outgoing-live-test
  (mt/test-driver :redshift
    (let [spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
          [inclusion-patterns
           exclusion-patterns] (driver.s/db-details->schema-filter-patterns (mt/db))
          syncable? (fn [{:keys [schema]}]
                      (sql-jdbc.describe-database/include-schema-logging-exclusion
                       inclusion-patterns exclusion-patterns schema))]
      (is (seq (rest (#'redshift/get-tables-sql inclusion-patterns)))
          "the pushdown must be active or this comparison measures nothing")
      ;; whichever query runs first pays for opening the pooled connection, which is larger than the difference
      ;; being measured
      (run-outgoing-query spec)
      (run-current-query spec inclusion-patterns)
      (let [rounds   (vec (repeatedly measurement-rounds
                                      #(hash-map :outgoing (run-outgoing-query spec)
                                                 :current  (run-current-query spec inclusion-patterns))))
            outgoing (:outgoing (first rounds))
            current  (:current (first rounds))]
        (log/infof "get-tables rows: outgoing %d, current %d"
                   (count (:rows outgoing)) (count (:rows current)))
        (log/infof "get-tables ms over %d rounds: outgoing %s, current %s"
                   measurement-rounds
                   (mapv #(Math/round ^double (:ms (:outgoing %))) rounds)
                   (mapv #(Math/round ^double (:ms (:current %))) rounds))
        (is (seq (:rows outgoing)))
        (is (seq (:rows current)))
        (is (= (set (filter syncable? (:rows outgoing)))
               (set (filter syncable? (:rows current)))))))))
