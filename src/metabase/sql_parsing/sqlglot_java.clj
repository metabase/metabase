(ns metabase.sql-parsing.sqlglot-java
  "Native SQLGlot AST shim implementing the same sql_tools contract as GraalPy."
  (:require
   [metabase.sql-parsing.common :as common]
   [metabase.sql-parsing.protocol :as protocol])
  (:import
   (com.metabase.sqlglot.metabase SqlTools SqlTools$Failure)))

(set! *warn-on-reflection* true)

(def ^:private ^SqlTools tools (SqlTools.))

(defn- call-java
  [f]
  (try
    (f)
    (catch SqlTools$Failure e
      (throw (common/call-failed-ex (str (.type e) ": " (.getMessage e)) e)))))

(defn- java-value
  "Normalize structured inputs to the shim's string-keyed map/list/scalar convention."
  [value]
  (cond
    (instance? java.util.Map value)
    (into {} (map (fn [^java.util.Map$Entry entry]
                    (let [k (.getKey entry)]
                      [(if (keyword? k) (subs (str k) 1) (str k))
                       (java-value (.getValue entry))]))
                  (.entrySet ^java.util.Map value)))
    (keyword? value) (subs (str value) 1)
    (or (coll? value) (instance? java.util.Collection value)) (mapv java-value value)
    :else value))

(defn- clojure-value
  "Convert Java result collections to the protocol's persistent, keyword-keyed values."
  [value]
  (cond
    (instance? java.util.Map value)
    (into {} (map (fn [^java.util.Map$Entry entry]
                    (let [k (.getKey entry)]
                      [(if (string? k) (keyword k) k) (clojure-value (.getValue entry))]))
                  (.entrySet ^java.util.Map value)))
    (instance? java.util.Collection value) (mapv clojure-value value)
    :else value))

(defn parser
  "The `:sqlglot-java` SqlParser, using direct JVM values for inputs and results."
  []
  (reify protocol/SqlParser
    (referenced-tables [_ dialect sql]
      (clojure-value (call-java #(.referencedTables tools sql dialect))))
    (referenced-fields [_ dialect sql]
      (clojure-value (call-java #(.referencedFields tools sql dialect))))
    (returned-columns-lineage [_ dialect sql default-table-schema sqlglot-schema]
      (clojure-value (call-java #(.returnedColumnsLineage tools dialect sql default-table-schema
                                                          (java-value sqlglot-schema)))))
    (validate-query [_ dialect sql _default-table-schema sqlglot-schema]
      (clojure-value (call-java #(.validateQuery tools dialect sql
                                                 (java-value (or sqlglot-schema {}))))))
    (simple-query [_ dialect sql]
      (clojure-value (call-java #(.simpleQuery tools sql dialect))))
    (add-into-clause [_ dialect sql table-name]
      (call-java #(.addIntoClause tools sql table-name dialect)))
    (field-references [_ dialect sql]
      (clojure-value (call-java #(.fieldReferences tools sql dialect))))
    (replace-names [_ dialect sql replacements]
      (call-java #(.replaceNames tools sql (java-value replacements) dialect)))
    (single-stmt-of-type [_ dialect sql stmt-type]
      (clojure-value (call-java #(.isSingleStmtOfType tools sql stmt-type dialect))))
    (transpile-sql [_ sql from-dialect to-dialect]
      (clojure-value (call-java #(.transpileSql tools sql from-dialect to-dialect))))))
