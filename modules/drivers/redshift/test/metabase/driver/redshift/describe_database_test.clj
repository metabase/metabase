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

(defn- arms
  "The two `UNION ALL` arms of the current table query, each as its own statement.

  The query binds its schema list once per arm, so the parameters split in half: the first half belongs to the
  `pg_class` arm, the second to the `svv_external_tables` arm."
  [inclusion-patterns]
  (let [[sql & params] (#'redshift/get-tables-sql inclusion-patterns)
        pieces (str/split sql #"(?i)\nunion all\n")
        half   (quot (count params) 2)]
    (assert (= 2 (count pieces))
            "the table query must be two arms joined by a single `union all` line")
    [(into [(first pieces)] (take half params))
     (into [(second pieces)] (drop half params))]))

(defn- without-privilege-checks
  [[sql & params]]
  (into [(str/replace sql #"(?m)^.*has_(?:schema|table|any_column)_privilege.*$\n?" "")] params))

(deftest ^:parallel outgoing-baseline-carries-no-parameters-test
  (testing "the frozen baseline must not gain the pushdown, or the live comparison measures a query against itself"
    (is (= 1 (count (outgoing-get-tables-sql))))))

(deftest ^:parallel derived-variants-test
  (testing "each arm carries its own copy of the schema parameters"
    (let [[pg-class external] (arms "spectrum,public")]
      (is (str/includes? (first pg-class) "pg_catalog.pg_class"))
      (is (str/includes? (first external) "svv_external_tables"))
      (is (= ["spectrum" "public"] (rest pg-class)))
      (is (= ["spectrum" "public"] (rest external)))))
  (testing "the diagnostic variant drops every privilege check and keeps the parameters"
    (let [[pg-class] (arms "spectrum")
          stripped   (without-privilege-checks pg-class)]
      (is (not= pg-class stripped))
      (is (not (re-find #"privilege" (first stripped))))
      (is (= (rest pg-class) (rest stripped))))))

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

(defn- run-full-query
  [spec inclusion-patterns]
  (timed-query spec (#'redshift/get-tables-sql inclusion-patterns)))

(defn- run-pg-class-arm
  [spec inclusion-patterns]
  (timed-query spec (first (arms inclusion-patterns))))

(defn- run-external-arm
  [spec inclusion-patterns]
  (timed-query spec (second (arms inclusion-patterns))))

(defn- run-pg-class-arm-without-privileges
  [spec inclusion-patterns]
  (timed-query spec (without-privilege-checks (first (arms inclusion-patterns)))))

(defn- run-external-arm-without-privileges
  [spec inclusion-patterns]
  (timed-query spec (without-privilege-checks (second (arms inclusion-patterns)))))

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

(def ^:private breakdown-rounds 2)

;; A measurement harness for one open question: `describe-database` costs 15-36s per call and pushing the schema
;; filter into SQL did not move it, so the time is server-side, not rows on the wire. Experiment 1 times each `union
;; all` arm on its own; experiment 2 times the `pg_class` arm with the privilege functions removed, which says
;; whether restricting rows in a CTE ahead of those checks is the fix. The no-privilege variants are diagnostic and
;; must never ship: without them Metabase would sync tables the connecting user cannot read.
(deftest describe-database-cost-breakdown-test
  (mt/test-driver :redshift
    (let [spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
          inclusion-patterns (first (driver.s/db-details->schema-filter-patterns (mt/db)))]
      ;; whichever query runs first pays for opening the pooled connection, which is larger than the difference
      ;; being measured
      (run-full-query spec inclusion-patterns)
      (let [rounds (vec (repeatedly breakdown-rounds
                                    #(hash-map :full             (run-full-query spec inclusion-patterns)
                                               :pg-class         (run-pg-class-arm spec inclusion-patterns)
                                               :external         (run-external-arm spec inclusion-patterns)
                                               :pg-class-no-priv (run-pg-class-arm-without-privileges spec inclusion-patterns)
                                               :external-no-priv (run-external-arm-without-privileges spec inclusion-patterns))))
            rows   (fn [variant] (:rows (variant (first rounds))))]
        (doseq [variant [:full :pg-class :external :pg-class-no-priv :external-no-priv]]
          (log/infof "%s: %d rows, ms %s"
                     (name variant)
                     (count (rows variant))
                     (mapv #(Math/round ^double (:ms (variant %))) rounds)))
        (is (seq (rows :pg-class)))
        (is (seq (rows :external)))
        (is (= (count (rows :full))
               (+ (count (rows :pg-class)) (count (rows :external))))
            "the arms must partition the full query, or the split is measuring something else")
        (is (>= (count (rows :pg-class-no-priv)) (count (rows :pg-class)))
            "dropping the privilege filters can only add rows")))))
