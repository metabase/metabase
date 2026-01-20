  (ns metabase.driver.sql.sqlglot
    "Basic example of running Python code using GraalVM polyglot."
    (:import
     (org.graalvm.polyglot Context HostAccess Source Value)))

;; 1. Install sqlglot into resources
;; pip install sqlglot --target resources/python-libs --no-compile

(set! *warn-on-reflection* true)

(defn python-context
  ^Context []
  (.. (Context/newBuilder (into-array String ["python"]))
      (option "engine.WarnInterpreterOnly" "false")
      (allowHostAccess HostAccess/ALL)
      (allowIO true)
      (build)))

(defn eval-python
  ^Value [^Context ctx ^String code]
  (.eval ctx (.buildLiteral (Source/newBuilder "python" code "<eval>"))))

(defn init-sqlglot-context
  "Create context with sqlglot available."
  ^Context []
  (let [ctx (python-context)
        libs-path (-> (clojure.java.io/resource "python-libs")
                      (.getPath))]
    (eval-python ctx (format "import sys; sys.path.insert(0, '%s')" libs-path))
    ctx))

(comment
  ;; 2. See the sqlglot generated ast
  (with-open [ctx (init-sqlglot-context)]
    (eval-python ctx "import sqlglot")
    (println (.asString (eval-python ctx "repr(sqlglot.parse_one(\"SELECT $REDSHIFT$\\nselect 1\\n$REDSHIFT$\", read=\"postgres\"))")))))