  (ns metabase.driver.sql.sqlglot
    "Basic example of running Python code using GraalVM polyglot."
    (:require
     [cheshire.core :as json])
    (:import
     (org.graalvm.polyglot Context HostAccess Source Value)))

;; 1. Install sqlglot into resources
;; pip install sqlglot --target resources/python-libs --no-compile

(set! *warn-on-reflection* true)

(defn python-context
  ^Context []
  (.. (Context/newBuilder (into-array String ["python"]))
      (option "engine.WarnInterpreterOnly" "false")
      (option "python.PythonPath" "python-sources")
      (allowHostAccess HostAccess/ALL)
      (allowIO true)
      (build)))

(def interpreter (delay (python-context)))

(declare analyze-sql)

(defn p [sql]
  ;; todo: the shim doesn't 100% return json. need to fix that
  ;;   sqlglot=> (p "-- FIXTURE: interpolation/crosstab
  ;; SELECT * FROM crosstab($$

  ;;     SELECT
  ;;         history.page,
  ;;         date_trunc('month', history.h_timestamp)::DATE,
  ;;         count(history.id) as total
  ;;     FROM history
  ;;     WHERE h_timestamp between '2024-01-01' and '2024-12-01'
  ;;     GROUP BY page, date_trunc('month', history.h_timestamp)
  ;; $$,

  ;;         $$
  ;;             SELECT
  ;;                 date_trunc('month', generate_series('2024-01-01', '2024-02-01', '1 month'::INTERVAL))::DATE
  ;; $$
  ;; ) AS ct(
  ;;     page INTEGER,
  ;;     \"Jan\" FLOAT,
  ;;     \"Feb\" FLOAT
  ;; )")
  ;; Execution error (PolyglotException) at <python>/default (encoder.py:161).
  ;; TypeError: Object of type Type is not JSON serializable
  (json/parse-string (.asString  (analyze-sql @interpreter sql)) true))

(comment
  (eval-python @interpreter "import sqlglot")
  (println (.asString (eval-python @interpreter "repr(sqlglot.parse_one(\"SELECT $REDSHIFT$\\nselect 1\\n$REDSHIFT$\", read=\"postgres\"))")))

  (analyze-sql @interpreter "SELECT id FROM users")
  )

(defn analyze-sql [context sql]
  ;; 1. Import the module (ensure sql_tools is loaded)
  (.eval context "python" "import sql_tools")

  ;; 2. Get the Python function object
  (let [analyze-fn (.eval context "python" "sql_tools.analyze")]

    ;; 3. Call it directly with arguments
    ;; GraalVM handles the conversion of the Clojure string to a Python string
    (.execute analyze-fn (object-array [sql]))))

;; Usage


(defn eval-python
  ^Value [^Context ctx ^String code]
  (.eval ctx (.buildLiteral (Source/newBuilder "python" code "<eval>"))))

(comment
  ;; 2. See the sqlglot generated ast
  (with-open [ctx (init-sqlglot-context)]
    (eval-python ctx "import sqlglot")
    (println (.asString (eval-python ctx "repr(sqlglot.parse_one(\"SELECT $REDSHIFT$\\nselect 1\\n$REDSHIFT$\", read=\"postgres\"))")))))
