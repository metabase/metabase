(ns metabase.sql-parsing.corpus-test
  "Checks over SQL that is not part of this repository. Each test reads its cases from a file that an environment
  variable names, and does nothing when the variable is not set.

  `MB_SQL_PARSING_DIFFERENTIAL_CASES`: an `.edn` or `.json` file of `{:cases [{:sql ... :dialect ...} ...]}`, the
  same shape as the files in `test_cases/` (see [[metabase.sql-parsing.case-files/expand]]; other keys are
  ignored). For each distinct query, both backends answer `referenced-tables`, `referenced-fields` and
  `field-references`, and the test fails for each answer on which they disagree. There are no expected answers.
  `MB_SQL_PARSING_DIFFERENTIAL_REPORT`, when set, is a file to write each disagreement to as JSON.

  `MB_SQL_PARSING_SCORECARD_CORPUS`: the root of a labelled corpus of SQL that tries to hide tables from table
  extraction (`schemas/*.yaml` and `corpus/**/*.yaml`, as its `CONTRACT.md` describes). For each backend, each case
  is scored on `referenced-tables` and `referenced-fields`, first as parsed and then with each view's base tables
  added. The test logs the outcome counts and does not fail on them: it is a diagnostic, not a gate.
  `MB_SQL_PARSING_SCORECARD_REPORT`, when set, is a file to write the counts and the critical cases to as JSON, and
  `MB_SQL_PARSING_SCORECARD_LIMIT` limits the number of cases.

  The failures and the report hold the SQL, so do not run these tests where the logs are public."
  (:require
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.sql-parsing.case-files :as case-files]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- env-path
  "The value of the environment variable `var-name`, or nil when it is not set or blank."
  [var-name]
  (not-empty (System/getenv var-name)))

(defn- distinct-queries
  "Each distinct `[sql dialect]` in `cases`, in file order."
  [cases]
  (distinct (for [{:keys [sql dialect]} (case-files/expand cases)
                  :when (string? sql)]
              [sql dialect])))

;;; -------------------------------------------------- differential ------------------------------------------------

(def ^:private differential-functions
  "Each function the backends are compared on, and what callers get from its value without the order that carries no
  meaning."
  {:referenced-tables {:f sql-parsing/referenced-tables, :logical set}
   :referenced-fields {:f sql-parsing/referenced-fields, :logical set}
   :field-references  {:f sql-parsing/field-references,  :logical identity}})

(defn- error-type
  "The kind of failure, without its message: the Python error name both backends report, or the exception class."
  [^Throwable e]
  (or (:sql-parsing/python-error-type (ex-data e))
      (.getName (class e))))

(defn- answer
  "`{:value v}` from `(f parser dialect sql)`, or `{:error type, :message m}` when it throws."
  [f parser dialect sql]
  (try
    {:value (f parser dialect sql)}
    (catch Exception e
      {:error (error-type e), :message (ex-message e)})))

(defn- outcome
  "`:match` when the GraalPy and Java answers agree, else what differs: `:mismatch`, `:error-type-mismatch`,
  `:python-only-error` or `:java-only-error`."
  [logical python java]
  (cond
    (and (:error python) (:error java)) (if (= (:error python) (:error java)) :match :error-type-mismatch)
    (:error python)                     :python-only-error
    (:error java)                       :java-only-error
    (= (logical (:value python))
       (logical (:value java)))         :match
    :else                               :mismatch))

(deftest differential-test
  (if-let [path (env-path "MB_SQL_PARSING_DIFFERENTIAL_CASES")]
    (let [queries     (distinct-queries (case-files/file-cases path))
          python      (sql-parsing/parser :sqlglot)
          java        (sql-parsing/parser :sqlglot-java)
          divergences (volatile! [])
          counts      (volatile! {})]
      (testing "the GraalPy and Java backends give the same answer to each query"
        (doseq [[sql dialect] queries
                [function {:keys [f logical]}] differential-functions]
          (let [python-answer (answer f python dialect sql)
                java-answer   (answer f java dialect sql)
                result        (outcome logical python-answer java-answer)]
            (vswap! counts update-in [function result] (fnil inc 0))
            (when-not (= :match result)
              (vswap! divergences conj {:function function, :dialect dialect, :sql sql, :outcome result
                                        :python python-answer, :java java-answer})
              (is (= :match result)
                  (str (name function) " on " (pr-str dialect) ": " (name result) "\n" sql
                       "\nGraalPy: " (pr-str python-answer)
                       "\nJava:    " (pr-str java-answer)))))))
      (log/infof "Differential over %d queries: %s" (count queries) (pr-str @counts))
      (when-let [report (env-path "MB_SQL_PARSING_DIFFERENTIAL_REPORT")]
        (spit report (json/encode {:queries     (count queries)
                                   :counts      @counts
                                   :divergences @divergences}))))
    (log/info "MB_SQL_PARSING_DIFFERENTIAL_CASES is not set: skipping the differential.")))

;;; --------------------------------------------------- scorecard --------------------------------------------------

(def ^:private upper-case-dialects
  "Corpus dialects that fold unquoted names to upper case."
  #{"snowflake" "oracle" "h2" "vertica"})

(def ^:private lower-case-dialects
  "Corpus dialects that fold unquoted names to lower case."
  #{"postgresql" "redshift" "mysql" "databricks" "hive" "duckdb" "generic" "trino" "presto" "starburst" "athena"
    "sparksql"})

(def ^:private sqlglot-dialect
  "The sqlglot dialect for each corpus dialect whose name differs. A corpus dialect not here has the same name."
  {"postgresql" "postgres", "mssql" "tsql", "sparksql" "spark", "starburst" "trino", "h2" nil, "vertica" nil
   "generic" nil})

(def ^:private advisory-dialects
  "Corpus dialects that sqlglot has no grammar for. Their outcomes are not in the critical counts."
  #{"h2" "vertica"})

(def ^:private critical-outcomes
  "Outcomes that mean a permission check can miss a table."
  #{"crash" "bailout" "leak" "open"})

(defn- fold
  [identifier dialect]
  (cond
    (upper-case-dialects dialect) (u/upper-case-en identifier)
    (lower-case-dialects dialect) (u/lower-case-en identifier)
    :else                         identifier))

(defn- blank->nil
  [s]
  (when-not (str/blank? s) s))

(defn- column-name
  [column]
  (name (if (map? column) (:name column) column)))

(defn- symbol-table
  "How the names a parser reports for `dialect` map to the logical names that the labels of `schema` use."
  [{:keys [multi_schema default_schema tables]} dialect]
  (let [multi?  (boolean multi_schema)
        logical (fn [{table-name :name, :keys [schema]}] (if multi? (str schema "." table-name) table-name))]
    {:tables     (into {}
                       (for [{table-name :name, :keys [schema] :as table} tables
                             :let  [l (logical table)]
                             k     (concat
                                    (when (or (not multi?) (= schema default_schema))
                                      [[nil (fold table-name dialect)] [nil table-name]])
                                    (for [s (if multi?
                                              (hash-set schema (fold schema dialect))
                                              (set (keep identity [default_schema
                                                                   (some-> default_schema (fold dialect))])))]
                                      [s (fold table-name dialect)])
                                    (when multi?
                                      (for [s (hash-set schema (fold schema dialect))]
                                        [s table-name])))]
                         [k l]))
     :columns    (into {} (for [table tables] [(logical table) (mapv column-name (:columns table))]))
     :column-map (into {} (for [table tables
                                column (:columns table)
                                :let [c (column-name column)]
                                k [[(logical table) (fold c dialect)] [(logical table) c]]]
                            [k c]))
     :view-reads (into {} (for [table tables :when (:view_reads table)]
                            [(logical table) (mapv name (:view_reads table))]))}))

(defn- lookup-table
  [symbols schema table]
  (or (get (:tables symbols) [(blank->nil schema) table])
      (get (:tables symbols) [nil table])))

(defn- parse-failure?
  "Whether `e` says that the parser could not read the SQL, as opposed to a crash: running out of stack or time."
  [e]
  (let [error-type (:sql-parsing/python-error-type (ex-data e))]
    (and error-type (not= "RecursionError" error-type))))

(defn- ask
  "What `parser` reports for the case, in the logical names of `symbols`: `:tables`, `:fields`, the names that
  resolve to no table (`:unresolved`), whether the SQL parsed, and the failure when the parser crashed."
  [parser {:keys [sql]} symbols dialect]
  (let [sqlglot (get sqlglot-dialect dialect dialect)
        empty   {:parse-ok true :tables #{} :fields #{} :unresolved []}]
    (try
      (let [tables (sql-parsing/referenced-tables parser sqlglot sql)
            fields (try (sql-parsing/referenced-fields parser sqlglot sql) (catch Throwable _ nil))
            found  (reduce (fn [found [_catalog schema table]]
                             (if-let [l (lookup-table symbols schema table)]
                               (update found :tables conj l)
                               (update found :unresolved conj (str/join "." (keep blank->nil [schema table])))))
                           empty
                           tables)]
        (reduce (fn [found [_catalog schema table column]]
                  (let [l (lookup-table symbols schema table)]
                    (cond
                      (nil? l)       found
                      (= column "*") (update found :fields into (map #(str l "." %) (get (:columns symbols) l)))
                      :else          (if-let [c (get (:column-map symbols) [l column])]
                                       (update found :fields conj (str l "." c))
                                       found))))
                found
                fields))
      (catch Throwable e
        (if (parse-failure? e)
          (assoc empty :parse-ok false)
          (assoc empty :crashed (str (.getSimpleName (class e)) ": " (ex-message e))))))))

(defn- expand-views
  "`found` with the base tables of each view in it, as a permission check that knows the catalog sees them."
  [found symbols]
  (update found :tables #(into % (mapcat (fn [table] (get (:view-reads symbols) table))) %)))

(defn- score
  "The outcome of the case, worst first, as the corpus contract defines it."
  [{:keys [expect oracle_needed]} {:keys [parse-ok tables fields unresolved crashed]}]
  (let [want-tables  (set (:tables expect))
        must-include (let [m (set (:must_include expect))] (if (seq m) m want-tables))
        must-exclude (set (:must_exclude expect))
        want-fields  (set (:fields expect))
        bad-fields   (set (:fields_exclude expect))
        flagged?     (or (seq unresolved) (not parse-ok))
        shadowed     (seq (set/intersection must-exclude tables))
        missed       (sort (remove tables must-include))
        verdict      (fn [outcome detail] {:outcome outcome, :detail detail, :missed missed, :got (sort tables)})]
    (cond
      crashed
      (verdict "crash" crashed)

      (:fail_closed expect)
      (cond
        (and (not flagged?) (empty? (set/intersection must-include tables)))
        (verdict "open" "resolved clean, flagged nothing, missed the target")
        shadowed                                    (verdict "shadow" (str "reported shadowed " (vec shadowed)))
        (seq (set/intersection bad-fields fields)) (verdict "field-extra" "excluded field")
        :else                                       (verdict "ok" ""))

      (and (seq want-tables) (empty? tables) (not flagged?))
      (verdict "bailout" "empty result reads as touches-nothing")

      (and (seq missed) (not flagged?))
      (verdict "leak" (str "missed " (vec missed)))

      (and (false? (:parse_ok expect)) parse-ok (empty? unresolved))
      (verdict (if (seq tables) "lenient" "open") "invalid SQL accepted")

      shadowed
      (verdict "shadow" (str "reported shadowed " (vec shadowed)))

      (seq (remove want-tables tables))
      (verdict "extra" (str "reported " (vec (remove want-tables tables))))

      (seq (set/intersection bad-fields fields))
      (verdict "field-extra" "excluded field")

      (and (seq want-fields) (not= want-fields fields))
      (verdict (if oracle_needed "divergence" "fields") "")

      :else
      (verdict "ok" ""))))

(defn- bucket
  "For a critical outcome, why the case is hard: `:config` (it needs server settings), `:view` (it needs the
  catalog, because a table it must report is not in the SQL) or `:parser` (anything else)."
  [{:keys [sql expect] :as case} {:keys [outcome]}]
  (when (critical-outcomes outcome)
    (cond
      (or (:config case) (:config_unknown case))
      :config

      (some #(not (str/includes? (u/lower-case-en sql) (u/lower-case-en %))) (set (:must_include expect)))
      :view

      :else
      :parser)))

(defn- read-yaml
  [file]
  (yaml/parse-string (slurp file) :max-aliases-for-collections 100000 :code-point-limit (* 64 1024 1024)))

(defn- yaml-files
  [dir]
  (sort (filter #(str/ends-with? (str %) ".yaml") (file-seq (io/file dir)))))

(defn- summary
  "The outcome counts of `results`, without the advisory dialects in the critical counts."
  [results]
  (let [gated     (remove #(advisory-dialects (:dialect %)) results)
        criticals (filter #(critical-outcomes (get-in % [:verdict :outcome])) gated)]
    {:cases            (count results)
     :outcomes         (into (sorted-map) (frequencies (map #(get-in % [:verdict :outcome]) gated)))
     :critical         (count criticals)
     :gated            (count gated)
     :critical-buckets (frequencies (keep :bucket gated))
     :per-dialect      (into (sorted-map)
                             (for [[dialect rs] (group-by :dialect results)]
                               [dialect {:n        (count rs)
                                         :ok       (count (filter #(= "ok" (get-in % [:verdict :outcome])) rs))
                                         :critical (count (filter #(critical-outcomes (get-in % [:verdict :outcome]))
                                                                  rs))}]))
     :failures         (for [{:keys [case verdict bucket dialect]} (take 4000 criticals)]
                         {:id (:id case), :dialect dialect, :bucket bucket, :outcome (:outcome verdict)
                          :detail (:detail verdict), :missed (:missed verdict), :got (:got verdict)})}))

(defn- corpus-cases
  "The cases under `root`/corpus, at most `limit` of them when `limit` is not nil."
  [root limit]
  (cond->> (for [f (yaml-files (io/file root "corpus"))
                 c (read-yaml f)]
             (merge {:schema "s1"} c))
    limit (take limit)))

(defn- answers
  "What `backend` reports for each case, as parsed (`:raw`) and with the views expanded (`:views`)."
  [backend cases symbols]
  (let [parser (sql-parsing/parser backend)]
    (vec (for [c cases
               :let [dialect (or (:dialect c) "postgresql")
                     st      (symbols (name (:schema c)) dialect)
                     found   (ask parser c st dialect)]]
           {:dialect dialect, :case c, :raw found, :views (expand-views found st)}))))

(defn- scorecard
  "The [[summary]] of `answers` scored in `mode`, `:raw` or `:views`."
  [answers mode]
  (summary (for [{:keys [case] :as a} answers
                 :let [verdict (score case (get a mode))]]
             (assoc a :verdict verdict :bucket (bucket case verdict)))))

(deftest scorecard-test
  (if-let [root (env-path "MB_SQL_PARSING_SCORECARD_CORPUS")]
    (let [schemas (into {} (for [^java.io.File f (yaml-files (io/file root "schemas"))]
                             [(str/replace (.getName f) ".yaml" "") (read-yaml f)]))
          cases   (corpus-cases root (some-> (env-path "MB_SQL_PARSING_SCORECARD_LIMIT") parse-long))
          symbols (memoize (fn [schema dialect] (symbol-table (get schemas schema) dialect)))
          report  (into {} (for [backend [:sqlglot :sqlglot-java]
                                 :let [backend-answers (answers backend cases symbols)]]
                             [backend {:raw   (scorecard backend-answers :raw)
                                       :views (scorecard backend-answers :views)}]))]
      (doseq [[backend modes] report
              [mode {:keys [cases outcomes critical gated critical-buckets]}] modes]
        (log/infof "Scorecard, %s, %s: %d cases, critical %d/%d, buckets %s, outcomes %s"
                   (name backend) (name mode) cases critical gated (pr-str critical-buckets) (pr-str outcomes)))
      (when-let [path (env-path "MB_SQL_PARSING_SCORECARD_REPORT")]
        (spit path (json/encode report))))
    (log/info "MB_SQL_PARSING_SCORECARD_CORPUS is not set: skipping the scorecard.")))
