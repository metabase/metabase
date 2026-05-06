(ns metabase-enterprise.workspaces.query-processor.corpus-test
  "Test runner for the workspace remapping SQL corpus.

   Reads test cases from `test_resources/remapping_corpus/*.sql`, applies remappings
   via `sql-tools/replace-names`, and verifies the output contains no production refs.

   Corpus file format (see postgres.sql for examples):
     -- ;;;;                              <- separator
     -- remap: from_schema.table to_schema.table
     -- tags: simple, join, cte           <- for filtering
     -- expect: ok | parse-error          <- expected outcome
     <SQL query>"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-config.file.workspace :as advanced-config.file.workspace]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.test-util :as workspaces.tu]
   [metabase.driver :as driver]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.test :as mt]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Parser ----------------------------------------------------

(defn- parse-remap-directive
  "Parse '-- remap: from_schema.table to_schema.table' into [[from-schema from-table] [to-schema to-table]]."
  [line]
  (let [[_ from to] (re-matches #"--\s*remap:\s+(\S+)\s+(\S+)" line)]
    (when (and from to)
      (let [[fs ft] (str/split from #"\." 2)
            [ts tt] (str/split to #"\." 2)]
        [[fs ft] [ts tt]]))))

(defn- parse-tags-directive
  "Parse '-- tags: foo, bar, baz' into a set of keyword tags."
  [line]
  (let [[_ tags-str] (re-matches #"--\s*tags:\s+(.*)" line)]
    (when tags-str
      (into #{} (map (comp keyword str/trim)) (str/split tags-str #",")))))

(defn- parse-expect-directive
  "Parse '-- expect: ok | parse-error' into a keyword."
  [line]
  (let [[_ expect] (re-matches #"--\s*expect:\s+(\S+)" line)]
    (when expect
      (keyword expect))))

(defn- parse-corpus-entry
  "Parse a single corpus entry (lines between separators) into a test case map."
  [lines]
  (let [remappings (atom {})
        tags       (atom #{})
        expect     (atom :ok)
        sql-lines  (atom [])]
    (doseq [line lines]
      (if-let [remap (parse-remap-directive line)]
        (swap! remappings conj remap)
        (if-let [t (parse-tags-directive line)]
          (reset! tags t)
          (if-let [e (parse-expect-directive line)]
            (reset! expect e)
            ;; Skip blank comment-only lines, collect SQL
            (when-not (re-matches #"--.*" line)
              (swap! sql-lines conj line))))))
    (let [sql (str/trim (str/join "\n" @sql-lines))]
      (when (seq sql)
        {:remappings @remappings
         :tags       @tags
         :expect     @expect
         :sql        sql}))))

(defn- parse-corpus-file
  "Parse a corpus .sql file into a seq of test case maps."
  [resource-path]
  (let [content (slurp (io/resource resource-path))
        ;; Split on "-- ;;;;" separator, drop leading empty chunk
        chunks  (rest (str/split content #"(?m)^--\s*;;;;+\s*$"))]
    (keep (fn [chunk]
            (let [lines (str/split-lines (str/trim chunk))]
              (parse-corpus-entry lines)))
          chunks)))

;;; ---------------------------------------------- Test runner -------------------------------------------------

(defn- build-replacements
  "Build the replacements map for sql-tools/replace-names from a remappings map."
  [remappings]
  {:tables (into {}
                 (map (fn [[[from-schema from-table] [to-schema to-table]]]
                        [{:schema from-schema :table from-table}
                         {:schema to-schema :table to-table}]))
                 remappings)})

(defn- from-ref-pattern
  "Build a regex that matches any 'from' schema.table reference in SQL output."
  [remappings]
  (let [patterns (map (fn [[[from-schema from-table] _]]
                        (str "(?i)"
                             (java.util.regex.Pattern/quote from-schema)
                             "\\s*\\.\\s*"
                             (java.util.regex.Pattern/quote from-table)))
                      remappings)]
    (when (seq patterns)
      (re-pattern (str/join "|" patterns)))))

(defn- run-corpus-entry
  "Run a single corpus test case. Returns nil on success, error string on failure."
  [driver {:keys [remappings tags expect sql]}]
  (try
    (let [replacements (build-replacements remappings)
          rewritten    (sql-tools/replace-names driver sql replacements {:allow-unused? true})]
      (if (= expect :parse-error)
        (format "Expected parse error but got success. Tags: %s\nSQL: %s\nRewritten: %s"
                tags sql rewritten)
        ;; Verify no "from" references remain in the rewritten SQL
        (let [pattern (from-ref-pattern remappings)]
          (when (and pattern (re-find pattern rewritten))
            (format "Rewritten SQL still contains production refs. Tags: %s\nOriginal: %s\nRewritten: %s"
                    tags sql rewritten)))))
    (catch Exception e
      (if (= expect :parse-error)
        nil ;; Expected
        (format "Unexpected parse error. Tags: %s\nSQL: %s\nError: %s"
                tags sql (ex-message e))))))

;;; ---------------------------------------------- Tests -------------------------------------------------------

(deftest postgres-corpus-test
  (let [entries (parse-corpus-file "remapping_corpus/postgres.sql")]
    (is (pos? (count entries))
        "Corpus file should contain at least one test case")
    (doseq [{:keys [tags sql] :as entry} entries]
      (testing (format "tags=%s sql=%.60s..." tags (str/replace sql #"\n" " "))
        (let [error (run-corpus-entry :postgres entry)]
          (is (nil? error) error))))))

;;; ----------------------------- Per-driver SQL emission snapshots ------------------------------
;;;
;;; Ground truth: real Metabase-emitted SQL captured from production-ish instances. Sources:
;;;   - MySQL:      Magento (test) / Admin Assert        (screenshot 2026-04-28 #proj-table-remappings)
;;;   - ClickHouse: Metabase Cloud Storage / Pa Events   (screenshot 2026-04-28 #proj-table-remappings)
;;;   - BigQuery:   BigQuery Census (test) / Population By Zip 2010
;;;   - Snowflake:  representative 3-part identifier shape (db.schema.table)
;;;
;;; Each test:
;;;   1. takes a canonical SQL string emitted by Metabase
;;;   2. runs it through `sql-tools/replace-names` with a workspace remapping
;;;   3. parses the rewritten SQL with `sql-tools/referenced-tables-raw`
;;;   4. asserts the *parsed table references* match expected slot values per driver
;;;
;;; Asserting on parsed-AST table refs (not regex on the SQL string) means we sidestep
;;; quoting/case differences in driver-specific re-emission and verify the semantic
;;; rewrite directly.

(defn- prune-no-level
  "Mirrors `metabase-enterprise.workspaces.query-processor.middleware/prune-no-level`.
   Production strips empty-string sentinels before handing the spec to SQLGlot -- SQLGlot
   treats absent keys as wildcards but `\"\"` as a literal that won't match anything."
  [m]
  (into {} (remove (fn [[_ v]] (= "" v))) m))

(defn- rewrite-and-parse
  "Run a remapping through the rewriter, then parse the result. Returns the set of
   `{:db?, :schema?, :table}` references in the rewritten SQL."
  [driver canonical-sql remappings]
  (let [rewritten (sql-tools/replace-names driver canonical-sql {:tables remappings} {:allow-unused? true})]
    {:rewritten rewritten
     :tables    (set (sql-tools/referenced-tables-raw driver rewritten))}))

(deftest mysql-rewriter-emission-snapshot-test
  (testing "MySQL: bare-table input gets the workspace schema added at AST :schema"
    (let [{:keys [tables rewritten]}
          (rewrite-and-parse
           :mysql
           "SELECT `admin_assert`.`assert_id` FROM `admin_assert`"
           {(prune-no-level {:db "" :schema "" :table "admin_assert"})
            (prune-no-level {:db "" :schema "ws_alice" :table "admin_assert"})})]
      (is (contains? tables {:schema "ws_alice" :table "admin_assert"})
          (str "expected workspace-qualified ref in parsed tables; got: " tables
               "\n  rewritten SQL: " rewritten))
      (is (not-any? #(= % {:table "admin_assert"}) tables)
          (str "expected bare `admin_assert` to be gone from parsed tables; got: " tables)))))

(deftest clickhouse-rewriter-emission-snapshot-test
  (testing "ClickHouse: db-name lives at AST :schema; rewrite swaps it"
    (let [{:keys [tables rewritten]}
          (rewrite-and-parse
           :clickhouse
           "SELECT `db_c6633c128ed24e74`.`pa_events`.`tag` FROM `db_c6633c128ed24e74`.`pa_events`"
           {(prune-no-level {:db "" :schema "db_c6633c128ed24e74" :table "pa_events"})
            (prune-no-level {:db "" :schema "ws_alice" :table "pa_events"})})]
      (is (contains? tables {:schema "ws_alice" :table "pa_events"})
          (str "expected workspace db-as-schema ref in parsed tables; got: " tables
               "\n  rewritten SQL: " rewritten))
      (is (not-any? #(= (:schema %) "db_c6633c128ed24e74") tables)
          (str "expected canonical db-name gone from parsed tables; got: " tables)))))

;;; For 3-slot drivers (Snowflake, BigQuery), `referenced-tables-raw` returns 2-slot
;;; specs (`{:schema, :table}`) -- it doesn't populate the `:db` slot even when the
;;; SQL has 3 levels. The `:db` rewrite still happens inside `replace-names` (the
;;; rewritten SQL string contains the right catalog name), the parser is just lossy.
;;; For these drivers we assert on parsed `:schema`/`:table` AND verify the `:db`
;;; substitution by string presence/absence in the rewritten SQL.

(deftest bigquery-rewriter-emission-snapshot-test
  (testing "BigQuery: project.dataset.table input gets all three slots rewritten"
    (let [{:keys [tables rewritten]}
          (rewrite-and-parse
           :bigquery-cloud-sdk
           "SELECT `bigquery-public-data.census_bureau_usa.population_by_zip_2010`.`geo_id` FROM `bigquery-public-data.census_bureau_usa.population_by_zip_2010`"
           {(prune-no-level {:db "bigquery-public-data" :schema "census_bureau_usa" :table "population_by_zip_2010"})
            (prune-no-level {:db "ws-project" :schema "ws_alice" :table "population_by_zip_2010"})})]
      ;; parsed table refs (no :db slot from the parser) -- confirms dataset+table swapped:
      (is (contains? tables {:schema "ws_alice" :table "population_by_zip_2010"})
          (str "expected workspace dataset+table in parsed refs; got: " tables
               "\n  rewritten SQL: " rewritten))
      (is (not-any? #(= (:schema %) "census_bureau_usa") tables)
          (str "expected canonical dataset gone from parsed refs; got: " tables))
      ;; :db slot lives in the rewritten string only (parser doesn't return it).
      ;; Asserting on FROM clause specifically -- SELECT-clause column refs intentionally
      ;; keep canonical names because we only declared :tables replacements, not :columns.
      (let [from-text (re-find #"(?i)\bFROM\b.*$" rewritten)]
        (is (re-find #"ws-project" from-text)
            (str "expected workspace project in FROM; got: " from-text))
        (is (not (re-find #"bigquery-public-data" from-text))
            (str "expected canonical project gone from FROM; got: " from-text))))))

(deftest snowflake-rewriter-emission-snapshot-test
  (testing "Snowflake: db.schema.table input gets all three slots rewritten"
    (let [{:keys [tables rewritten]}
          (rewrite-and-parse
           :snowflake
           "SELECT \"ANALYTICS\".\"PUBLIC\".\"ORDERS\".\"ID\" FROM \"ANALYTICS\".\"PUBLIC\".\"ORDERS\""
           {(prune-no-level {:db "ANALYTICS" :schema "PUBLIC" :table "ORDERS"})
            (prune-no-level {:db "WS_DB"     :schema "WS_ALICE" :table "ORDERS"})})]
      ;; parsed table refs (no :db slot from the parser) -- confirms schema+table swapped:
      (is (contains? tables {:schema "WS_ALICE" :table "ORDERS"})
          (str "expected workspace schema+table in parsed refs; got: " tables
               "\n  rewritten SQL: " rewritten))
      (is (not-any? #(= (:schema %) "PUBLIC") tables)
          (str "expected canonical schema gone from parsed refs; got: " tables))
      ;; :db slot lives in the rewritten string only (parser doesn't return it).
      ;; Asserting on FROM clause specifically -- SELECT-clause column refs intentionally
      ;; keep canonical names because we only declared :tables replacements, not :columns.
      (let [from-text (re-find #"(?i)\bFROM\b.*$" rewritten)]
        (is (re-find #"WS_DB" from-text)
            (str "expected workspace db in FROM; got: " from-text))
        (is (not (re-find #"ANALYTICS" from-text))
            (str "expected canonical db gone from FROM; got: " from-text))))))

;;; ----------------- Wire-format -> rewriter end-to-end -----------------
;;;
;;; This block closes the loop: it loads each per-driver fixture YAML through the real
;;; loader (`apply-workspace-section!`), reads the workspace namespace via the production
;;; reader (`db-workspace-namespace`), assembles a remapping the way `add-transform-target-mapping!` would, and runs
;;; the rewriter against canonical SQL. If any link in the chain breaks
;;; (loader/atom/reader/spec drift), this test catches it.
;;;
;;; Each fixture-row pairs the per-driver YAML with: a representative
;;; canonical SQL (Metabase-shaped emission for the input table), the
;;; from-side `::table-spec` matching what `spec-for-table` would produce
;;; for the source, and per-driver assertions on the rewritten SQL.

(defn- load-fixture-section [driver-kw]
  (-> (str "metabase_enterprise/workspaces/resources/workspace_config_" (name driver-kw) ".yml")
      io/resource slurp yaml/parse-string :config :workspace))

(defn- fixture-wsd
  "Pull the single workspace-database entry from a fixture: returns
   `[<db-name-string>, <wsd-config-map>]` where wsd-config has `:input`
   and `:output` namespaces."
  [section]
  (let [[db-name-kw wsd] (-> section :databases first)]
    [(name db-name-kw) wsd]))

(def ^:private fixture-rewriter-test-cases
  "Per-driver chain test cases. Everything that's *config-derived* (the input
   filter, the output destination, the database name) is pulled from the
   fixture YAML at test time - so this map only carries the things that are
   NOT in the fixture: the driver keyword to dispatch on, the SQL query the
   QP would emit for a representative source table, and the source `:table`
   slot value (which is per-test-author, not per-fixture)."
  [{:fixture-driver :postgres
    :driver         :postgres
    :source-table   "orders"
    :canonical-sql  "SELECT \"public\".\"orders\".\"id\" FROM \"public\".\"orders\""}

   {:fixture-driver :mysql
    :driver         :mysql
    :source-table   "orders"
    :canonical-sql  "SELECT `orders`.`id` FROM `orders`"}

   {:fixture-driver :clickhouse
    :driver         :clickhouse
    :source-table   "events"
    :canonical-sql  "SELECT `prod_events`.`events`.`tag` FROM `prod_events`.`events`"}

   {:fixture-driver :snowflake
    :driver         :snowflake
    :source-table   "ORDERS"
    :canonical-sql  "SELECT \"ANALYTICS\".\"PUBLIC\".\"ORDERS\".\"ID\" FROM \"ANALYTICS\".\"PUBLIC\".\"ORDERS\""}

   {:fixture-driver :sqlserver
    :driver         :sqlserver
    :source-table   "orders"
    :canonical-sql  "SELECT [AnalyticsDB].[dbo].[orders].[id] FROM [AnalyticsDB].[dbo].[orders]"}

   {:fixture-driver :bigquery
    :driver         :bigquery-cloud-sdk
    :source-table   "orders"
    :canonical-sql  "SELECT `metabase-prod.core.orders`.`id` FROM `metabase-prod.core.orders`"}])

(deftest per-driver-fixture-rewriter-chain-test
  (testing "Each per-driver fixture YAML loads, sets up a TableRemapping, and the rewriter swaps slots correctly"
    (doseq [{:keys [fixture-driver driver source-table canonical-sql]} fixture-rewriter-test-cases
            :when (workspaces.tu/driver-loadable? driver)]
      (testing (str fixture-driver " fixture -> rewriter chain")
        (let [section          (load-fixture-section fixture-driver)
              [db-name wsd]    (fixture-wsd section)
              fixture-input    (first (:input wsd))
              fixture-output   (:output wsd)
              ;; The from-spec handed to the rewriter must match what the driver
              ;; actually *emits* in SQL, which is governed by qualified-name-components.
              ;; This usually matches the fixture's input filter, but not for the
              ;; cardinality-upgrade case (MySQL): the fixture says "remap things
              ;; coming from prod_db", but MySQL's emitted SQL is bare `orders` -
              ;; no schema slot at all. So we zero out slots the driver doesn't emit.
              emitted-slots    (set (driver/qualified-name-components driver))
              from-spec        {:db     (if (:db emitted-slots)     (or (:db fixture-input) "") "")
                                :schema (if (:schema emitted-slots) (or (:schema fixture-input) "") "")
                                :table  source-table}]
          (mt/with-empty-h2-app-db!
            (mt/with-temp [:model/Database {db-id :id} {:name db-name}]
              (try
                ;; 1. Load through the production loader. Populates the atom.
                (advanced-config.file.workspace/apply-workspace-section! section)
                ;; 2. Read the namespace via the production reader.
                (let [ws-ns      (ws/db-workspace-namespace db-id)
                      to-spec    (merge from-spec ws-ns)
                      {:keys [tables rewritten]} (rewrite-and-parse
                                                  driver canonical-sql
                                                  {(prune-no-level from-spec)
                                                   (prune-no-level to-spec)})]
                  (testing "atom output equals fixture output (loader fidelity)"
                    (is (= fixture-output ws-ns)
                        "db-workspace-namespace must return what the fixture's :output declared"))
                  (testing "rewritten SQL parses to the fixture's workspace :schema slot"
                    (is (contains? tables {:schema (:schema fixture-output) :table source-table})
                        (str "expected {:schema " (:schema fixture-output) ", :table " source-table
                             "} in parsed tables; got: " tables
                             "\n  rewritten SQL: " rewritten)))
                  (testing "rewritten SQL no longer references the canonical schema"
                    (when-let [from-schema (:schema fixture-input)]
                      (is (not-any? #(= (:schema %) from-schema) tables)
                          (str "expected canonical schema " (pr-str from-schema)
                               " gone from parsed refs; got: " tables))))
                  ;; 3-slot drivers (where fixture's output has :db): parser is lossy on :db,
                  ;; so verify via the rewritten string. Both presence (workspace :db) and
                  ;; absence (canonical :db, when it differs from workspace :db) are checked.
                  (when-let [output-db (:db fixture-output)]
                    (let [from-text  (str (re-find #"(?i)\bFROM\b.*$" rewritten))
                          input-db   (:db fixture-input)
                          db-changed (not= input-db output-db)]
                      (testing "rewritten FROM clause contains workspace :db slot"
                        (is (re-find (re-pattern (java.util.regex.Pattern/quote output-db)) from-text)
                            (str "expected " (pr-str output-db) " in FROM; got: " from-text)))
                      (when db-changed
                        (testing "rewritten FROM clause does not retain canonical :db slot"
                          (is (not (re-find (re-pattern (java.util.regex.Pattern/quote input-db)) from-text))
                              (str "expected " (pr-str input-db) " gone from FROM; got: " from-text)))))))
                (finally
                  (ws/clear-instance-workspace!))))))))))
