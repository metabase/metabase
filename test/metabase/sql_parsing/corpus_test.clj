(ns metabase.sql-parsing.corpus-test
  "Checks over SQL that is not part of this repository. Each test reads its cases from a file that an environment
  variable names, and does nothing when the variable is not set.

  `MB_SQL_PARSING_DIFFERENTIAL_CASES`: an `.edn` or `.json` file of `{:cases [{:sql ... :dialect ...} ...]}`, the
  same shape as the files in `test_cases/` (see [[metabase.sql-parsing.case-files/expand]]; other keys are
  ignored). For each distinct query, both backends answer `referenced-tables`, `referenced-fields` and
  `field-references`, and the test fails for each answer on which they disagree. There are no expected answers.
  `MB_SQL_PARSING_DIFFERENTIAL_REPORT`, when set, is a file to write each disagreement to as JSON.

  The failures and the report hold the SQL, so do not run these tests where the logs are public."
  (:require
   [clojure.test :refer :all]
   [metabase.sql-parsing.case-files :as case-files]
   [metabase.sql-parsing.core :as sql-parsing]
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
