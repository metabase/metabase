(ns ^:mb/driver-tests metabase.driver.redshift.sync-diagnostics-test
  "Why Redshift sync is slow in CI, measured rather than guessed.

  Profiles of CI runs put 27-55% of a shard's wall clock in one call: the `driver/describe-database*`
  that [[metabase.sync.sync-metadata/sync-db-metadata!*]] makes before its first *timed* step, so it
  shows up in no log line and is invisible in `Sync metadata ... (1.1 mins)`. It costs 59-77s median
  per Database sync, 99% of that blocked on the socket, and it costs the same on every cluster in
  `MB_REDSHIFT_TEST_HOSTS` -- so the random host pick is not the variable.

  Two things are still unmeasured, and these tests measure them:

  - [[describe-database-cost-test]] ablates the catalog query clause by clause, so the minute can be
    attributed to the privilege functions, the `pg_description` joins, the `svv_external_tables`
    union, or the sheer number of relations the schema filter has to reject.
  - [[catalog-census-test]] counts what has accumulated on every cluster+database, because the
    ablations only mean something next to the size of the catalog they scan.

  Off unless `MB_REDSHIFT_SYNC_DIAGNOSTICS` is set: the probes cost a few minutes of cluster time,
  which no ordinary PR should pay.

    MB_REDSHIFT_SYNC_DIAGNOSTICS=1 ./bin/test-agent --drivers=redshift \\
      :only '[metabase.driver.redshift.sync-diagnostics-test]'"
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.redshift :as redshift]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sync :as driver.s]
   [metabase.test :as mt]
   [metabase.test.data.redshift :as redshift.tx]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :plugins))
(use-fixtures :once (fixtures/initialize :db))

(defn- enabled?
  []
  (some? (System/getenv "MB_REDSHIFT_SYNC_DIAGNOSTICS")))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Running and reporting probes                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- run-probe
  "Times `sql` against `conn-spec` and returns what happened. A probe that throws records the error
  instead of aborting the run: `stv_*` views the CI user may not be granted should cost us one row of
  the report, not the report."
  [conn-spec {:keys [label sql]}]
  (let [start (System/nanoTime)
        ms    #(quot (- (System/nanoTime) start) 1000000)]
    (try
      (let [rows (jdbc/query conn-spec sql)]
        {:label label, :ms (ms), :row-count (count rows), :rows rows})
      (catch Throwable e
        {:label label, :ms (ms), :error (ex-message e)}))))

(defn- report-timing!
  [tag {:keys [label ms row-count error]}]
  (log/infof "%s %-52s %7d ms  rows=%s%s"
             tag label ms (or row-count "-") (if error (str "  ERROR: " error) "")))

(defn- report-rows!
  [tag {:keys [rows]}]
  (doseq [row rows]
    (log/infof "%s     %s" tag (str/join "  " (for [[k v] row] (str (name k) "=" v))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     Census                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- schema-bucket
  "SQL `case` sorting the schema named by `col` into how CI created it. A cluster is shared by every
  shard of every run, so the number that matters is not how many schemas exist but how many are
  leftovers -- `ci-session` scratch schemas and `metabase-cache` persistence schemas outlive the run
  that made them if its cleanup did not land."
  [col]
  (format (str "case when %1$s ~ '^[0-9]{4}_[0-9]{2}_[0-9]{2}_' then 'ci-session' "
               "when %1$s ~ '^metabase_cache_' then 'metabase-cache' "
               "when %1$s in ('public', 'spectrum') then %1$s "
               "else 'dataset-or-other' end")
          col))

(def ^:private census-probes
  "Everything `describe-database` has to scan past, and the concurrent load it scans past it under."
  [;; `gc-connection-details` only knows the two databases CI names in env vars. A cluster carrying
   ;; more than those is carrying them against the same max-tables limit.
   {:label "databases on this cluster"
    :sql   ["select datname as database from pg_database order by 1"]}
   {:label "schemas by bucket"
    :sql   [(format (str/join "\n" ["select %s as bucket, count(*) as schemas"
                                    "from pg_catalog.pg_namespace n"
                                    "where n.nspname !~ '^information_schema|catalog_history|pg_'"
                                    "group by 1 order by 2 desc"])
                    (schema-bucket "n.nspname"))]}
   {:label "relations by bucket and kind"
    :sql   [(format (str/join "\n" ["select %s as bucket, c.relkind, count(*) as relations"
                                    "from pg_catalog.pg_class c"
                                    "join pg_catalog.pg_namespace n on n.oid = c.relnamespace"
                                    "where n.nspname !~ '^information_schema|catalog_history|pg_'"
                                    "group by 1, 2 order by 3 desc"])
                    (schema-bucket "n.nspname"))]}
   ;; The unnarrowed catalog query's own predicate, counted. `get-tables-sql` says CI measured ~1100
   ;; relations fetched to keep ~10; this is the number that claim is made of.
   {:label "relations the unnarrowed catalog query returns"
    :sql   [(str/join "\n" ["select count(*) as relations"
                            "from pg_catalog.pg_namespace n, pg_catalog.pg_class c"
                            "where c.relnamespace = n.oid"
                            "  and n.nspname !~ '^information_schema|catalog_history|pg_|metabase_cache_'"
                            "  and c.relkind in ('r', 'p', 'v', 'f', 'm')"
                            "  and pg_catalog.has_schema_privilege(n.oid, 'USAGE')"
                            "  and (pg_catalog.has_table_privilege(c.oid,'SELECT')"
                            "       or pg_catalog.has_any_column_privilege(c.oid,'SELECT'))"])]}
   {:label "external tables (the union branch's whole input)"
    :sql   ["select count(*) as external_tables, count(distinct schemaname) as external_schemas
             from svv_external_tables"]}
   {:label "columns by bucket (what describe-fields walks)"
    :sql   [(format (str/join "\n" ["select %s as bucket,"
                                    "       count(*) as columns,"
                                    "       count(distinct c.table_schema || '.' || c.table_name) as tables"
                                    "from svv_columns c"
                                    "where c.table_schema !~ '^information_schema|catalog_history|pg_'"
                                    "group by 1 order by 2 desc"])
                    (schema-bucket "c.table_schema"))]}
   {:label "rows and storage by bucket"
    :sql   [(format (str/join "\n" ["select %s as bucket,"
                                    "       count(*) as tables,"
                                    "       sum(tbl_rows) as rows,"
                                    "       sum(size) as blocks_1mb"
                                    "from svv_table_info"
                                    "group by 1 order by 2 desc"])
                    (schema-bucket "\"schema\""))]}
   {:label "20 schemas holding the most relations"
    :sql   [(str/join "\n" ["select n.nspname as schema, count(*) as relations"
                            "from pg_catalog.pg_class c"
                            "join pg_catalog.pg_namespace n on n.oid = c.relnamespace"
                            "where n.nspname !~ '^information_schema|catalog_history|pg_'"
                            "  and c.relkind in ('r', 'p', 'v', 'f', 'm')"
                            "group by 1 order by 2 desc limit 20"])]}
   ;; Pooled across runs, describe-database ran ~85s median in the first 15 minutes of CI and ~45s
   ;; after minute 25 -- every shard starts at once. These two rows say what this cluster is carrying
   ;; at the moment the probes above were timed.
   {:label "sessions open on this cluster right now"
    :sql   ["select count(*) as sessions, count(distinct user_name) as users, count(distinct db_name) as dbs
             from stv_sessions"]}
   {:label "queries running on this cluster right now"
    :sql   ["select count(*) as running from stv_recents where status = 'Running'"]}])

(deftest catalog-census-test
  (when (enabled?)
    (mt/test-driver :redshift
      (testing "what has accumulated on every cluster+database CI can pick"
        ;; Every host, not just the one this process rolled: a shard's sync pays for what every other
        ;; shard left behind, and `random-host` pins one cluster per process.
        (doseq [result (#'redshift.tx/with-gc-pool!
                        (fn [details]
                          (let [server (#'redshift.tx/server-label details)]
                            [server (#'redshift.tx/with-gc-connection
                                     :redshift details
                                     (fn [conn]
                                       (mapv #(run-probe {:connection conn} %) census-probes))
                                     (fn [e]
                                       (log/errorf "[redshift-census] %s unreachable: %s" server (ex-message e))
                                       nil))])))]
          (let [[server probes] result]
            (doseq [probe probes]
              (report-timing! (str "[redshift-census] " server) probe)
              (report-rows! (str "[redshift-census] " server) probe))))
        (is true "census is a report, not an assertion -- read the [redshift-census] lines")))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          describe-database ablations                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- pg-class-branch-sql
  "The `pg_class` branch of [[metabase.driver.redshift/get-tables-sql]], with each clause under
  suspicion switchable. `schema-names` nil runs it unnarrowed, the way a Database whose
  `:schema-filters-patterns` carry regex syntax gets it."
  [{:keys [schema-names privileges? descriptions?]}]
  (into [(str/join
          "\n"
          (remove
           nil?
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
            (if descriptions? "  d.description" "  null as description")
            "  from pg_catalog.pg_namespace n, pg_catalog.pg_class c"
            (when descriptions?
              (str/join "\n"
                        ["  left join pg_catalog.pg_description d on c.oid = d.objoid and d.objsubid = 0"
                         "  left join pg_catalog.pg_class dc on d.classoid=dc.oid and dc.relname='pg_class'"
                         "  left join pg_catalog.pg_namespace dn on dn.oid=dc.relnamespace and dn.nspname='pg_catalog'"]))
            "  where c.relnamespace = n.oid"
            "    and n.nspname !~ '^information_schema|catalog_history|pg_|metabase_cache_'"
            "    and c.relkind in ('r', 'p', 'v', 'f', 'm')"
            (when (seq schema-names)
              (str "    and n.nspname in (" (str/join ", " (repeat (count schema-names) "?")) ")"))
            (when privileges? "    and pg_catalog.has_schema_privilege(n.oid, 'USAGE')")
            (when privileges?
              (str/join "\n" ["    and (pg_catalog.has_table_privilege(c.oid,'SELECT')"
                              "         or pg_catalog.has_any_column_privilege(c.oid,'SELECT'))"]))]))]
        schema-names))

(defn- external-branch-sql
  "The `svv_external_tables` branch of [[metabase.driver.redshift/get-tables-sql]], alone."
  [{:keys [schema-names]}]
  (into [(str/join
          "\n"
          (remove
           nil?
           ["select"
            "  tablename as name,"
            "  schemaname as schema,"
            "  'EXTERNAL TABLE' as type,"
            "  null as description"
            "from svv_external_tables t"
            "where schemaname !~ '^information_schema|catalog_history|pg_|metabase_cache_'"
            (when (seq schema-names)
              (str "  and t.schemaname in (" (str/join ", " (repeat (count schema-names) "?")) ")"))
            "  and pg_catalog.has_schema_privilege(t.schemaname, 'USAGE')"]))]
        schema-names))

(defn- timing-probes
  "The narrowed driver query first: if the job dies partway, the number worth having is the one sync
  actually pays. Every later probe subtracts one clause from it."
  [schema-names]
  [{:label "driver get-tables-sql, narrowed (what sync runs)"
    :sql   (#'redshift/get-tables-sql schema-names)}
   {:label "driver get-tables-sql, unnarrowed"
    :sql   (#'redshift/get-tables-sql nil)}
   {:label "pg_class branch, narrowed"
    :sql   (pg-class-branch-sql {:schema-names schema-names, :privileges? true, :descriptions? true})}
   {:label "pg_class branch, narrowed, no privilege checks"
    :sql   (pg-class-branch-sql {:schema-names schema-names, :privileges? false, :descriptions? true})}
   {:label "pg_class branch, narrowed, no description joins"
    :sql   (pg-class-branch-sql {:schema-names schema-names, :privileges? true, :descriptions? false})}
   {:label "pg_class branch, narrowed, neither"
    :sql   (pg-class-branch-sql {:schema-names schema-names, :privileges? false, :descriptions? false})}
   {:label "pg_class branch, unnarrowed"
    :sql   (pg-class-branch-sql {:schema-names nil, :privileges? true, :descriptions? true})}
   {:label "pg_class branch, unnarrowed, no privilege checks"
    :sql   (pg-class-branch-sql {:schema-names nil, :privileges? false, :descriptions? true})}
   {:label "external branch, narrowed"
    :sql   (external-branch-sql {:schema-names schema-names})}
   {:label "external branch, unnarrowed"
    :sql   (external-branch-sql {:schema-names nil})}
   {:label "describe-fields-sql, narrowed"
    :sql   (sql-jdbc.sync/describe-fields-sql :redshift {:schema-names schema-names})}])

(deftest describe-database-cost-test
  (when (enabled?)
    (mt/test-driver :redshift
      (testing "which clause of the catalog query costs the minute"
        (let [db           (mt/db)
              [inclusion]  (driver.s/db-details->schema-filter-patterns db)
              schema-names (#'redshift/exactly-named-schemas inclusion)
              conn-spec    (sql-jdbc.conn/db->pooled-connection-spec db)]
          (log/infof "[redshift-probe] narrowing to %s" (pr-str schema-names))
          (doseq [probe (timing-probes schema-names)]
            (report-timing! "[redshift-probe]" (run-probe conn-spec probe)))
          ;; End to end, through the production implementation. The test override filters the
          ;; production result down to one dataset's tables, which would time the filtering rather
          ;; than the query the filtering is applied to.
          (binding [redshift.tx/*override-describe-database-to-filter-by-db-name?* false]
            (let [start  (System/nanoTime)
                  tables (:tables (driver/describe-database* :redshift db))]
              (log/infof "[redshift-probe] %-52s %7d ms  rows=%d"
                         "driver/describe-database* end to end"
                         (quot (- (System/nanoTime) start) 1000000)
                         (count tables))))
          (is true "cost breakdown is a report -- read the [redshift-probe] lines"))))))

(deftest probe-ablations-match-driver-test
  (testing "every clause the ablations remove is still one `get-tables-sql` carries"
    ;; Without this the probes rot silently: `get-tables-sql` gets edited, the ablations keep
    ;; subtracting clauses it no longer has, and the report attributes cost to nothing.
    (let [driver-sql (first (#'redshift/get-tables-sql ["some_schema"]))]
      (doseq [clause ["pg_catalog.has_schema_privilege(n.oid, 'USAGE')"
                      "pg_catalog.has_table_privilege(c.oid,'SELECT')"
                      "pg_catalog.has_any_column_privilege(c.oid,'SELECT')"
                      "left join pg_catalog.pg_description d on c.oid = d.objoid and d.objsubid = 0"
                      "from svv_external_tables t"
                      "and n.nspname in ("
                      "and t.schemaname in ("]]
        (is (str/includes? driver-sql clause)
            (str "ablations are stale: get-tables-sql no longer contains " (pr-str clause)))))))
