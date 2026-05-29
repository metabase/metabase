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
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
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
           {(ws.table-remapping/prune-no-level {:db "" :schema "" :table "admin_assert"})
            (ws.table-remapping/prune-no-level {:db "" :schema "ws_alice" :table "admin_assert"})})]
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
           {(ws.table-remapping/prune-no-level {:db "" :schema "db_c6633c128ed24e74" :table "pa_events"})
            (ws.table-remapping/prune-no-level {:db "" :schema "ws_alice" :table "pa_events"})})]
      (is (contains? tables {:schema "ws_alice" :table "pa_events"})
          (str "expected workspace db-as-schema ref in parsed tables; got: " tables
               "\n  rewritten SQL: " rewritten))
      (is (not-any? #(= (:schema %) "db_c6633c128ed24e74") tables)
          (str "expected canonical db-name gone from parsed tables; got: " tables)))))

;;; For 3-slot drivers (SQL Server, BigQuery), `referenced-tables-raw` returns 2-slot
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
           {(ws.table-remapping/prune-no-level {:db "bigquery-public-data" :schema "census_bureau_usa" :table "population_by_zip_2010"})
            (ws.table-remapping/prune-no-level {:db "ws-project" :schema "ws_alice" :table "population_by_zip_2010"})})]
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
   `[<db-name-string>, <wsd-config-map>]` where wsd-config has `:input_schemas`
   and `:output` (the already-expanded `{:db ?, :schema ?}` map)."
  [section]
  (let [[db-name-kw wsd] (-> section :databases first)]
    [(name db-name-kw) wsd]))

(def ^:private fixture-rewriter-test-cases
  "Per-driver chain test cases. The fixture YAML carries `:input_schemas` and the
   already-expanded `:output` map; the catalog (SQL Server/BigQuery) lives
   inside that map. Each test case adds the engine + details needed to drive
   the loader's expansion path, plus the SQL the QP would emit for a
   representative source table."
  [{:fixture-driver :postgres
    :driver         :postgres
    :engine         :postgres
    :details        {}
    :source-table   "orders"
    :canonical-sql  "SELECT \"public\".\"orders\".\"id\" FROM \"public\".\"orders\""}
   {:fixture-driver :mysql
    :driver         :mysql
    :engine         :mysql
    :details        {:db "prod_db"}
    :source-table   "orders"
    :canonical-sql  "SELECT `orders`.`id` FROM `orders`"}
   {:fixture-driver :clickhouse
    :driver         :clickhouse
    :engine         :clickhouse
    :details        {}
    :source-table   "events"
    :canonical-sql  "SELECT `prod_events`.`events`.`tag` FROM `prod_events`.`events`"}
   {:fixture-driver :sqlserver
    :driver         :sqlserver
    :engine         :sqlserver
    :details        {:db "AnalyticsDB"}
    :source-table   "orders"
    :canonical-sql  "SELECT [AnalyticsDB].[dbo].[orders].[id] FROM [AnalyticsDB].[dbo].[orders]"}
   {:fixture-driver :bigquery
    :driver         :bigquery-cloud-sdk
    :engine         :bigquery-cloud-sdk
    :details        {:project-id "metabase-prod"}
    :source-table   "orders"
    :canonical-sql  "SELECT `metabase-prod.core.orders`.`id` FROM `metabase-prod.core.orders`"}])

(deftest per-driver-fixture-rewriter-chain-test
  (testing "Each per-driver fixture YAML loads, sets up a TableRemapping, and the rewriter swaps slots correctly"
    (doseq [{:keys [fixture-driver driver engine details source-table canonical-sql]} fixture-rewriter-test-cases
            :when (workspaces.tu/driver-loadable? driver)]
      (testing (str fixture-driver " fixture -> rewriter chain")
        (let [section          (load-fixture-section fixture-driver)
              [db-name wsd]    (fixture-wsd section)
              first-input      (first (:input_schemas wsd))
              ;; The fixture's `:output` is already the expanded `{:db ?, :schema ?}`
              ;; map (`workspaces.config/build-workspace-config` emits the runtime
              ;; shape directly), so the loader stores it verbatim.
              expected-output  (:output wsd)
              fake-db          {:engine engine :details details}
              ;; The from-spec handed to the rewriter must match what the driver
              ;; actually *emits* in SQL, which is governed by qualified-name-components.
              emitted-slots    (set (driver/qualified-name-components driver))
              input-positions  (ws/engine-namespace-positions fake-db {:schema first-input})
              from-spec        {:db     (if (:db emitted-slots)     (or (:db input-positions)     "") "")
                                :schema (if (:schema emitted-slots) (or (:schema input-positions) "") "")
                                :table  source-table}]
          (mt/with-empty-h2-app-db!
            (mt/with-temp [:model/Database {db-id :id} {:name db-name :engine engine :details details}]
              (mt/with-premium-features #{:workspaces}
                (try
                  ;; 1. Load through the production loader. Populates the atom.
                  (advanced-config.file.workspace/apply-workspace-section! section)
                  ;; 2. Read the namespace via the production reader.
                  (let [ws-ns      (ws/db-workspace-namespace db-id)
                        to-spec    (merge from-spec ws-ns)
                        {:keys [tables rewritten]} (rewrite-and-parse
                                                    driver canonical-sql
                                                    {(ws.table-remapping/prune-no-level from-spec)
                                                     (ws.table-remapping/prune-no-level to-spec)})]
                    (testing "atom output matches the loader's expansion of fixture's output_namespace"
                      (is (= expected-output ws-ns)
                          "db-workspace-namespace must return the loader's expanded :output map"))
                    ;; MySQL is special-cased: it has no schema layer, so Phase 1 (table
                    ;; metadata mutation) adds the iso `:db` qualifier — Phase 2's SQLGlot
                    ;; rewriter never sees a qualifier to swap. Skip the rewriter SQL
                    ;; assertions for MySQL; the atom-output assertion above is what matters.
                    (when (not= driver :mysql)
                      (testing "rewritten SQL parses to the workspace :schema slot"
                        (let [expected-schema (or (:schema expected-output) (:db expected-output))]
                          (is (contains? tables {:schema expected-schema :table source-table})
                              (str "expected {:schema " expected-schema ", :table " source-table
                                   "} in parsed tables; got: " tables
                                   "\n  rewritten SQL: " rewritten))))
                      (testing "rewritten SQL no longer references the canonical schema"
                        (when (:schema input-positions)
                          (is (not-any? #(= (:schema %) (:schema input-positions)) tables)
                              (str "expected canonical schema " (pr-str (:schema input-positions))
                                   " gone from parsed refs; got: " tables))))
                      ;; 3-slot drivers (where workspace output has :db): parser is lossy on :db,
                      ;; so verify via the rewritten string.
                      (when-let [output-db (:db expected-output)]
                        (let [from-text (str (re-find #"(?i)\bFROM\b.*$" rewritten))]
                          (testing "rewritten FROM clause contains workspace :db slot"
                            (is (re-find (re-pattern (java.util.regex.Pattern/quote output-db)) from-text)
                                (str "expected " (pr-str output-db) " in FROM; got: " from-text)))))))
                  (finally
                    (ws/clear-instance-workspace!)))))))))))
