^{:clj-kondo/ignore [:metabase/modules]}
(ns metabase.sql-tools.sqlglot.shim
  "Basic example of running Python code using GraalVM polyglot."
  (:require
   [medley.core :as m]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.util :as u]
   [metabase.util.json :as json])
  (:import
   (org.graalvm.polyglot Context HostAccess Source Value)))

;; 1. Install sqlglot into resources
;; pip install sqlglot --target resources/python-libs --no-compile

(set! *warn-on-reflection* true)

(defn- python-context
  ^Context []
  (.. (Context/newBuilder (into-array String ["python"]))
      (option "engine.WarnInterpreterOnly" "false")
      (option "python.PythonPath" "python-sources")
      (allowHostAccess HostAccess/ALL)
      (allowIO true)
      (build)))

(def ^:private interpreter (delay (python-context)))

(declare analyze-sql)

;; TODO: Probably should be private.
(defn p
  "Parser entrypoint."
  [sql]
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
  (json/decode (.asString  (analyze-sql @interpreter sql)) true))

(defn analyze-sql [context sql]
  ;; 1. Import the module (ensure sql_tools is loaded)
  (.eval context "python" "import sql_tools")

  ;; 2. Get the Python function object
  (let [analyze-fn (.eval context "python" "sql_tools.analyze")]

    ;; 3. Call it directly with arguments
    ;; GraalVM handles the conversion of the Clojure string to a Python string
    (.execute analyze-fn (object-array [sql]))))

(defn eval-python
  ^Value [^Context ctx ^String code]
  (.eval ctx (.buildLiteral (Source/newBuilder "python" code "<eval>"))))

(defn- driver->dialect
  [driver]
  (when-not (= :h2 driver)
    (name driver)))

(defn referenced-tables
  "Return tables referenced in the `sql` query.

  Return value is `[[table_schema table]...]`."
  [driver sql default-table-schema]
  (let [;; for development comment out interpreter so py changes are propagated to our context
        ctx (or #_@interpreter (python-context))
        _ (.eval ctx "python" "import sql_tools")
        pyfn (.eval ctx "python" "sql_tools.referenced_tables")
        dialect (when-not (= :h2 driver)
                  (name driver))]
    (vec (json/decode (.asString (.execute pyfn (object-array [dialect sql
                                                               default-table-schema])))))))

;; TODO: should live in shim probably
;; TODO: Malli
(defn- normalize-dependency
  [driver dependency]
  (mapv (fn [component]
          (when (string? (not-empty component))
            (sql.normalize/normalize-name driver component)))
        dependency))

(defn- normalized-dependencies
  [driver [_alias _pure? _dependencies :as single-lineage]]
  (update single-lineage 2 #(mapv (partial normalize-dependency driver)
                                  %)))

;; TODO: Rename lineage to something more accurate
(defn returned-columns-lineage
  [driver sql default-table-schema sqlglot-schema]
  (let [;; for development comment out interpreter so py changes are propagated to our context
        ctx (or #_@interpreter (python-context))
        _ (.eval ctx "python" "import sql_tools")
        pyfn (.eval ctx "python" "sql_tools.returned_columns_lineage")
        dialect (when-not (= :h2 driver)
                  (name driver))
        lineage (json/decode (.asString (.execute pyfn (object-array [dialect
                                                                      sql
                                                                      default-table-schema
                                                                      sqlglot-schema]))))
        normalized (mapv (partial normalized-dependencies driver) lineage)]
    normalized))

(defn- sanitize-validation-output
  [validation-output]
  (-> validation-output
      (update :status (comp u/->kebab-case-en keyword))
      (m/update-existing :type (comp u/->kebab-case-en keyword))))

(defn validate-query
  "WIP"
  [driver sql default-table-schema sqlglot-schema]
  (let [;; for development comment out interpreter so py changes are propagated to our context
        ctx (or #_@interpreter (python-context))
        _ (.eval ctx "python" "import sql_tools")
        pyfn (.eval ctx "python" "sql_tools.validate_query")
        dialect (when-not (= :h2 driver)
                  (name driver))]
    (-> (.asString (.execute pyfn (object-array [dialect
                                                 sql
                                                 default-table-schema
                                                 sqlglot-schema])))
        json/decode+kw
        sanitize-validation-output)))
