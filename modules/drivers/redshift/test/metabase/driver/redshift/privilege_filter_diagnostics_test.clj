(ns ^:mb/driver-tests metabase.driver.redshift.privilege-filter-diagnostics-test
  "Can Redshift's privilege filter be made affordable, and if so how?

  `get-tables-sql` used to end with `has_schema_privilege` / `has_table_privilege` /
  `has_any_column_privilege`. Removing them took the catalog query from 7.8s to 0.3s, and their cost was flat
  in the number of relations returned -- a database holding none answered as slowly as one holding 132. That
  is consistent with the functions being evaluated across the whole of `pg_class` before the schema filter
  narrows anything, but it does not prove it: a fixed per-statement cost for touching them at all fits the
  same evidence, and the two point at opposite fixes.

  So these probe every option rather than the favourite, in four groups:

  - [[cost-shape-probes]] separates those two explanations. This is the one that decides the rest.
  - [[which-function-probes]] splits the three functions, since they may not cost alike.
  - [[ordering-probes]] tries to make the planner filter before it evaluates, keeping today's semantics.
  - [[select-list-probes]] moves the functions out of `where` entirely, which is the candidate fix: one
    statement, no round trip, and no reliance on the planner declining to optimize.
  - [[source-probes]] times the set-based alternatives, and [[privilege-source-agreement-test]] checks
    whether they actually agree with the functions -- a cheaper source that answers differently is no use.

  Reports, not assertions: read the `[redshift-priv]` lines. Every probe is timed and every probe catches its
  own failure, because half of them are testing whether a catalog view exists at all.

    ./bin/test-agent --drivers=redshift \\
      :only '[metabase.driver.redshift.privilege-filter-diagnostics-test]'"
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sync :as driver.s]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :plugins))
(use-fixtures :once (fixtures/initialize :db))

(def ^:private tag "[redshift-priv]")

(defn- run-probe
  "Times one probe. A probe that throws records the error rather than aborting the run: several of these exist
  to find out whether a catalog view is present, so failure is a result and not an accident."
  [conn-spec {:keys [label sql]}]
  (let [start (System/nanoTime)
        ms    #(quot (- (System/nanoTime) start) 1000000)]
    (try
      (let [rows (jdbc/query conn-spec sql)]
        {:label label, :ms (ms), :row-count (count rows), :rows rows})
      (catch Throwable e
        {:label label, :ms (ms), :error (ex-message e)}))))

(defn- report! [{:keys [label ms row-count error]}]
  (log/infof "%s %-58s %7d ms  rows=%s%s"
             tag label ms (or row-count "-") (if error (str "  ERROR: " error) "")))

(defn- in-clause
  "`in (...)` over `oids`, inlined. They are `Long`s read back out of `pg_class` moments earlier, so there is
  nothing to parameterize and `oid = ?` with a bound bigint does not typecheck on Redshift anyway."
  [oids]
  (str "(" (str/join ", " oids) ")"))

(defn- placeholders [schema-names]
  (str "(" (str/join ", " (repeat (count schema-names) "?")) ")"))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Group 1: cost shape                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- cost-shape-probes
  "Does the cost track how many rows the function runs over, or is it a floor for naming the function at all?

  Read the first four together. If they climb with the row count, the fix is to filter before evaluating and
  [[ordering-probes]] should work. If they are all the same, the function costs that much once per statement,
  every option here is dead, and the only choices left are dropping the filter or a set-based source."
  [oids catalog-size]
  (let [one   (take 1 oids)
        ten   (take 10 oids)]
    [{:label "0 rows: scalar has_table_privilege, no table scan"
      :sql   [(format "select has_table_privilege(%d, 'SELECT') as ok" (first oids))]}
     {:label "1 row: has_table_privilege over 1 oid"
      :sql   [(str "select c.oid, has_table_privilege(c.oid, 'SELECT') as ok "
                   "from pg_catalog.pg_class c where c.oid in " (in-clause one))]}
     {:label (format "%d rows: has_table_privilege over 10 oids" (count ten))
      :sql   [(str "select c.oid, has_table_privilege(c.oid, 'SELECT') as ok "
                   "from pg_catalog.pg_class c where c.oid in " (in-clause ten))]}
     {:label (format "%d rows: has_table_privilege over every narrowed oid" (count oids))
      :sql   [(str "select c.oid, has_table_privilege(c.oid, 'SELECT') as ok "
                   "from pg_catalog.pg_class c where c.oid in " (in-clause oids))]}
     {:label (format "%d rows: has_table_privilege over all of pg_class" catalog-size)
      :sql   ["select count(*) as n from pg_catalog.pg_class c where has_table_privilege(c.oid, 'SELECT')"]}
     {:label "control: same shape, no privilege call, all of pg_class"
      :sql   ["select count(*) as n from pg_catalog.pg_class c where c.relkind in ('r','p','v','f','m')"]}]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        Group 2: which function costs                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- narrowed-branch
  "The `pg_class` branch of `get-tables-sql` reduced to a count, with `extra` predicates appended. Only the
  predicates differ between these probes, so the differences between them are the predicates."
  [schema-names extra]
  (into [(str/join "\n"
                   (remove nil?
                           (concat
                            ["select count(*) as n"
                             "from pg_catalog.pg_namespace n, pg_catalog.pg_class c"
                             "where c.relnamespace = n.oid"
                             "  and n.nspname !~ '^information_schema|catalog_history|pg_|metabase_cache_'"
                             "  and c.relkind in ('r', 'p', 'v', 'f', 'm')"
                             (when (seq schema-names)
                               (str "  and n.nspname in " (placeholders schema-names)))]
                            extra)))]
        schema-names))

(defn- which-function-probes
  "The three functions were only ever removed together. If one of them carries the cost, the other two can
  stay and the filter survives in part."
  [schema-names]
  [{:label "none (floor)"
    :sql   (narrowed-branch schema-names nil)}
   {:label "has_schema_privilege only"
    :sql   (narrowed-branch schema-names ["  and pg_catalog.has_schema_privilege(n.oid, 'USAGE')"])}
   {:label "has_table_privilege only"
    :sql   (narrowed-branch schema-names ["  and pg_catalog.has_table_privilege(c.oid, 'SELECT')"])}
   {:label "has_any_column_privilege only"
    :sql   (narrowed-branch schema-names ["  and pg_catalog.has_any_column_privilege(c.oid, 'SELECT')"])}
   {:label "table or any_column (the pair as it shipped)"
    :sql   (narrowed-branch schema-names ["  and (pg_catalog.has_table_privilege(c.oid, 'SELECT')"
                                          "       or pg_catalog.has_any_column_privilege(c.oid, 'SELECT'))"])}
   {:label "all three (ceiling)"
    :sql   (narrowed-branch schema-names ["  and pg_catalog.has_schema_privilege(n.oid, 'USAGE')"
                                          "  and (pg_catalog.has_table_privilege(c.oid, 'SELECT')"
                                          "       or pg_catalog.has_any_column_privilege(c.oid, 'SELECT'))"])}])

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    Group 3: make the planner filter first                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- narrowed-oid-sql
  "The narrowing half of `get-tables-sql` projecting just `oid`: the row source the select-list probes wrap."
  [schema-names]
  (str/join "\n"
            (remove nil?
                    ["  select c.oid"
                     "  from pg_catalog.pg_namespace n, pg_catalog.pg_class c"
                     "  where c.relnamespace = n.oid"
                     "    and n.nspname !~ '^information_schema|catalog_history|pg_|metabase_cache_'"
                     "    and c.relkind in ('r', 'p', 'v', 'f', 'm')"
                     (when (seq schema-names)
                       (str "    and n.nspname in " (placeholders schema-names)))])))

(def ^:private selectable-expr
  "  has_table_privilege(s.oid, 'SELECT') or has_any_column_privilege(s.oid, 'SELECT') as selectable")

(defn- select-list-probes
  "The functions moved out of `where` and into the outer select list, which is the whole point: a `where`
  predicate is what the planner may reorder and push down -- that is how `has_any_column_privilege` ended up
  above the schema filter -- while a select-list expression is by definition computed on rows that already
  survived `where`. That should hold even when the subquery is flattened, since flattening leaves it a
  select-list expression, so unlike an `offset 0` fence this works with the optimizer rather than against it.

  The first two return every narrowed row plus a boolean and expect the caller to drop the false ones. The
  third asks whether the filtering can stay in SQL after all; a planner that substitutes the expression back
  into the predicate should land it right back at the slow plan, which is the answer worth having before
  choosing where the filter lives."
  [schema-names]
  [{:label "subquery + privilege in outer SELECT list (no SQL filter)"
    :sql   (into [(str/join "\n" ["select s.oid,"
                                  selectable-expr
                                  "from ("
                                  (narrowed-oid-sql schema-names)
                                  ") s"])]
                 schema-names)}
   {:label "CTE + privilege in outer SELECT list (no SQL filter)"
    :sql   (into [(str/join "\n" ["with narrowed as ("
                                  (narrowed-oid-sql schema-names)
                                  ")"
                                  "select s.oid,"
                                  selectable-expr
                                  "from narrowed s"])]
                 schema-names)}
   {:label "select-list alias, then filtered in SQL one level up"
    :sql   (into [(str/join "\n" ["select count(*) as n from ("
                                  "  select s.oid,"
                                  selectable-expr
                                  "  from ("
                                  (narrowed-oid-sql schema-names)
                                  "  ) s"
                                  ") t"
                                  "where t.selectable"])]
                 schema-names)}])

(defn- ordering-probes
  "Same functions, same user, same answer -- only the set they run over changes. These keep today's semantics
  exactly, so any of them that is fast is a fix needing no argument about behaviour.

  The last one is the two-round-trip shape done as one statement; the Clojure equivalent is timed separately
  in [[describe-then-filter-test]], which is what the driver would actually do."
  [schema-names oids]
  [{:label "CTE: narrow in a WITH, privileges in the outer query"
    :sql   (into [(str/join "\n"
                            ["with narrowed as ("
                             "  select c.oid, c.relname, n.nspname"
                             "  from pg_catalog.pg_namespace n, pg_catalog.pg_class c"
                             "  where c.relnamespace = n.oid"
                             "    and n.nspname !~ '^information_schema|catalog_history|pg_|metabase_cache_'"
                             "    and c.relkind in ('r', 'p', 'v', 'f', 'm')"
                             (when (seq schema-names)
                               (str "    and n.nspname in " (placeholders schema-names)))
                             ")"
                             "select count(*) as n from narrowed"
                             "where has_table_privilege(oid, 'SELECT')"
                             "   or has_any_column_privilege(oid, 'SELECT')"])]
                 schema-names)}
   {:label "subquery + offset 0 (optimization fence, if honoured)"
    :sql   (into [(str/join "\n"
                            ["select count(*) as n from ("
                             "  select c.oid"
                             "  from pg_catalog.pg_namespace n, pg_catalog.pg_class c"
                             "  where c.relnamespace = n.oid"
                             "    and n.nspname !~ '^information_schema|catalog_history|pg_|metabase_cache_'"
                             "    and c.relkind in ('r', 'p', 'v', 'f', 'm')"
                             (when (seq schema-names)
                               (str "    and n.nspname in " (placeholders schema-names)))
                             "  offset 0"
                             ") s"
                             "where has_table_privilege(s.oid, 'SELECT')"
                             "   or has_any_column_privilege(s.oid, 'SELECT')"])]
                 schema-names)}
   {:label "second round trip: privileges over an explicit oid list"
    :sql   [(str "select c.oid, "
                 "has_table_privilege(c.oid, 'SELECT') or has_any_column_privilege(c.oid, 'SELECT') as selectable "
                 "from pg_catalog.pg_class c where c.oid in " (in-clause oids))]}])

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    Group 4: set-based privilege sources                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private source-probes
  "Alternatives that hand back privileges as a relation to join against instead of a function to call per row.
  Several may not exist on these clusters or may be ungranted to the CI user; that is what the errors are for.
  Speed alone does not qualify any of them -- see [[privilege-source-agreement-test]]."
  [{:label "context: current_user, session_user, version"
    :sql   ["select current_user as current_user, session_user as session_user, version() as version"]}
   {:label "svv_relation_privileges: exists? how many rows?"
    :sql   ["select count(*) as n from svv_relation_privileges"]}
   {:label "svv_relation_privileges: columns available"
    :sql   ["select * from svv_relation_privileges limit 3"]}
   {:label "svv_role_grants: exists?"
    :sql   ["select count(*) as n from svv_role_grants"]}
   {:label "svv_user_grants: exists?"
    :sql   ["select count(*) as n from svv_user_grants"]}
   {:label "information_schema.table_privileges: count"
    :sql   ["select count(*) as n from information_schema.table_privileges where privilege_type = 'SELECT'"]}
   {:label "information_schema.tables: count"
    :sql   ["select count(*) as n from information_schema.tables"]}
   {:label "pg_class.relacl readable? how many non-null?"
    :sql   ["select count(*) as n, count(relacl) as with_acl from pg_catalog.pg_class"]}
   {:label "aclexplode() available?"
    :sql   ["select count(*) as n from pg_catalog.pg_class c, aclexplode(c.relacl) a"]}
   {:label "catalog size (denominator for the cost-shape group)"
    :sql   ["select count(*) as n from pg_catalog.pg_class"]}])

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     Tests                                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- narrowed-relations
  "Every relation `get-tables-sql` would consider before any privilege filtering, as
  `{:oid .. :schema .. :name ..}`. The oids feed the probes; the schema+name pairs are what the agreement test
  compares."
  [conn-spec schema-names]
  (jdbc/query conn-spec
              (into [(str/join "\n"
                               (remove nil?
                                       ["select c.oid as oid, n.nspname as schema, c.relname as name"
                                        "from pg_catalog.pg_namespace n, pg_catalog.pg_class c"
                                        "where c.relnamespace = n.oid"
                                        "  and n.nspname !~ '^information_schema|catalog_history|pg_|metabase_cache_'"
                                        "  and c.relkind in ('r', 'p', 'v', 'f', 'm')"
                                        (when (seq schema-names)
                                          (str "  and n.nspname in " (placeholders schema-names)))]))]
                    schema-names)))

(deftest privilege-filter-cost-test
  (mt/test-driver :redshift
    (testing "where the privilege filter's cost actually lives"
      (let [db           (mt/db)
            [inclusion]  (driver.s/db-details->schema-filter-patterns db)
            schema-names (when-not (str/blank? inclusion)
                           (remove str/blank? (map str/trim (str/split inclusion #","))))
            conn-spec    (sql-jdbc.conn/db->pooled-connection-spec db)
            rels         (narrowed-relations conn-spec schema-names)
            oids         (mapv :oid rels)]
        (log/infof "%s narrowing to %s -- %d relations" tag (pr-str schema-names) (count rels))
        (log/infof "%s ---- group 4: set-based sources and context ----" tag)
        (doseq [probe source-probes]
          (let [result (run-probe conn-spec probe)]
            (report! result)
            (doseq [row (:rows result)]
              (log/infof "%s     %s" tag (str/join "  " (for [[k v] row] (str (name k) "=" v)))))))
        (if (empty? oids)
          (log/warnf "%s no relations in the narrowed schemas; skipping the oid-driven groups" tag)
          (let [catalog-size (or (some-> (run-probe conn-spec (last source-probes)) :rows first :n) -1)]
            (log/infof "%s ---- group 1: cost shape (the deciding group) ----" tag)
            (doseq [probe (cost-shape-probes oids catalog-size)]
              (report! (run-probe conn-spec probe)))
            (log/infof "%s ---- group 2: which function costs ----" tag)
            (doseq [probe (which-function-probes schema-names)]
              (report! (run-probe conn-spec probe)))
            (log/infof "%s ---- group 3: filter before evaluating ----" tag)
            (doseq [probe (ordering-probes schema-names oids)]
              (report! (run-probe conn-spec probe)))
            (log/infof "%s ---- group 5: privilege in the outer SELECT list ----" tag)
            (doseq [probe (select-list-probes schema-names)]
              (report! (run-probe conn-spec probe)))))
        (is true "cost breakdown is a report -- read the [redshift-priv] lines")))))

(deftest describe-then-filter-test
  (mt/test-driver :redshift
    (testing "the two-round-trip shape, timed as the driver would actually pay it"
      ;; Group 3 times the second round trip as SQL. This times both halves plus the Clojure in between, which
      ;; is the number to compare against today's single query.
      (let [db           (mt/db)
            [inclusion]  (driver.s/db-details->schema-filter-patterns db)
            schema-names (when-not (str/blank? inclusion)
                           (remove str/blank? (map str/trim (str/split inclusion #","))))
            conn-spec    (sql-jdbc.conn/db->pooled-connection-spec db)
            t0           (System/nanoTime)
            rels         (narrowed-relations conn-spec schema-names)
            t1           (System/nanoTime)
            selectable   (when (seq rels)
                           (jdbc/query conn-spec
                                       [(str "select c.oid as oid, "
                                             "has_table_privilege(c.oid, 'SELECT') "
                                             "  or has_any_column_privilege(c.oid, 'SELECT') as selectable "
                                             "from pg_catalog.pg_class c where c.oid in "
                                             (in-clause (map :oid rels)))]))
            t2           (System/nanoTime)
            keep?        (into #{} (comp (filter :selectable) (map :oid)) selectable)
            kept         (filterv (comp keep? :oid) rels)
            t3           (System/nanoTime)
            ms           #(quot (- %2 %1) 1000000)]
        (log/infof "%s two-trip: fetch %d rels %d ms | privileges %d ms | filter in clj %d ms | total %d ms -> %d kept"
                   tag (count rels) (ms t0 t1) (ms t1 t2) (ms t2 t3) (ms t0 t3) (count kept))
        (is true "timing report -- read the [redshift-priv] line")))))

(deftest privilege-source-agreement-test
  (mt/test-driver :redshift
    (testing "do the cheap sources agree with the functions about what is selectable"
      ;; A source that is fast and answers differently is not a candidate. `has_*_privilege` is ground truth
      ;; here because it is what the driver shipped, so any disagreement is a behaviour change to argue for
      ;; on its own merits rather than a free substitution.
      (let [db          (mt/db)
            conn-spec   (sql-jdbc.conn/db->pooled-connection-spec db)
            truth       (try
                          (into #{}
                                (map (juxt :schema :name))
                                (jdbc/query conn-spec
                                            [(str/join "\n"
                                                       ["select n.nspname as schema, c.relname as name"
                                                        "from pg_catalog.pg_namespace n, pg_catalog.pg_class c"
                                                        "where c.relnamespace = n.oid"
                                                        "  and n.nspname !~ '^information_schema|catalog_history|pg_'"
                                                        "  and c.relkind in ('r', 'p', 'v', 'f', 'm')"
                                                        "  and pg_catalog.has_schema_privilege(n.oid, 'USAGE')"
                                                        "  and (pg_catalog.has_table_privilege(c.oid,'SELECT')"
                                                        "       or pg_catalog.has_any_column_privilege(c.oid,'SELECT'))"])]))
                          (catch Throwable e
                            (log/errorf "%s ground truth failed: %s" tag (ex-message e))
                            nil))
            candidates  {"information_schema.table_privileges"
                         [(str/join "\n" ["select table_schema as schema, table_name as name"
                                          "from information_schema.table_privileges"
                                          "where privilege_type = 'SELECT'"
                                          "  and table_schema !~ '^information_schema|catalog_history|pg_'"])]
                         "information_schema.tables"
                         [(str/join "\n" ["select table_schema as schema, table_name as name"
                                          "from information_schema.tables"
                                          "where table_schema !~ '^information_schema|catalog_history|pg_'"])]
                         "svv_relation_privileges"
                         [(str/join "\n" ["select namespace_name as schema, relation_name as name"
                                          "from svv_relation_privileges"
                                          "where privilege_type = 'SELECT'"
                                          "  and namespace_name !~ '^information_schema|catalog_history|pg_'"])]}]
        (when truth
          (log/infof "%s ground truth (has_*_privilege): %d selectable relations" tag (count truth)))
        (doseq [[name' sql] (sort candidates)]
          (let [start  (System/nanoTime)
                result (try
                         (into #{} (map (juxt :schema :name)) (jdbc/query conn-spec sql))
                         (catch Throwable e {:error (ex-message e)}))
                ms     (quot (- (System/nanoTime) start) 1000000)]
            (if (map? result)
              (log/infof "%s agreement %-40s %7d ms  ERROR: %s" tag name' ms (:error result))
              (let [missing (when truth (set/difference truth result))
                    extra   (when truth (set/difference result truth))]
                (log/infof "%s agreement %-40s %7d ms  n=%d  missing=%s  extra=%s%s"
                           tag name' ms (count result)
                           (if truth (count missing) "?") (if truth (count extra) "?")
                           (if (and truth (empty? missing) (empty? extra)) "  EXACT MATCH" ""))
                (doseq [r (take 5 missing)]
                  (log/infof "%s     missing (truth says selectable, source does not): %s" tag (pr-str r)))
                (doseq [r (take 5 extra)]
                  (log/infof "%s     extra (source says selectable, truth does not):   %s" tag (pr-str r)))))))
        (is true "agreement report -- read the [redshift-priv] lines")))))
