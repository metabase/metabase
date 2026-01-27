(ns ^{:clj-kondo/ignore [:discouraged-namespace]}
 metabase.driver.sql.sqlglot
  "Basic example of running Python code using GraalVM polyglot."
  (:require
   [metabase.util.json :as json]
   [metabase.util.performance :refer [empty?]]
   [toucan2.core :as t2])
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

;; TODO: Make the catalog and db optional.
;; TODO: Malli schemas.
(defn referenced-tables
  "Return tables referenced in the `sql` query.

  Return value is `[[catalog db table]...]`.

  `catalog` is name of the database. Can be nil.
  `db` is name of the `table`'s schema. Can be nil.
  `table` is a name."
  [driver sql catalog db]
  (let [;; for development comment out interpreter so py changes are propagated to our context
        ctx (or #_@interpreter (python-context))
        _ (.eval ctx "python" "import sql_tools")
        pyfn (.eval ctx "python" "sql_tools.referenced_tables")
        dialect (when-not (= :h2 driver)
                  (name driver))]
    (vec (json/decode (.asString (.execute pyfn (object-array [dialect sql catalog db])))))))

;; TODO: This should probably live somewhere in util.
(defn schema
  "WIP"
  [database-id]
  (let [;; TODO: avoid db calls probably thru mp
        db @(def dd (t2/select-one :model/Database database-id))
        tables @(def tt (t2/select-fn-set identity :model/Table :db_id database-id))
        table-ids (into #{} (map :id tables))
        columns @(def cc (t2/select-fn-set identity :model/Field :table_id [:in table-ids]))
        ;;
        id->table (into {}
                        (map (juxt :id identity))
                        tables)]
    (loop [columns columns
           result {}]
      (if (empty? columns)
        result
        (let [[this-col & rest-cols] columns
              this-table (id->table (:table_id this-col))]
          (recur rest-cols
                         ;; a. first attempt without database name -- no catalog, only the schema table col
                         ;; b. not providing correct type atm, not needed yet
                 (assoc-in result [(:schema this-table) (:name this-table) (:name this-col)] "unknown")))))))

(defn returned-columns-lineage
  "WIP"
  [driver sql catalog db schema]
  (let [;; for development comment out interpreter so py changes are propagated to our context
        ctx (or #_@interpreter (python-context))
        _ (.eval ctx "python" "import sql_tools")
        pyfn (.eval ctx "python" "sql_tools.returned_columns_lineage")
        dialect (when-not (= :h2 driver)
                  (name driver))]
    (json/decode (.asString (.execute pyfn (object-array [dialect sql catalog db schema]))))))
