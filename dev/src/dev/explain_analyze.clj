(ns dev.explain-analyze
  "Utilities to run EXPLAIN ANALYZE on queries made by Toucan 2.

  Usage:
    ;; Option 1: Use the `explain` macro to wrap forms
    (explain
      (t2/select :model/User :id 1))

    ;; Option 2: Manually start/stop
    (start!)
    (t2/select :model/User :id 1)
    (stop!)

  The EXPLAIN ANALYZE results will be printed to the console for each query."
  (:require
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.pipeline :as t2.pipeline])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(def ^:dynamic *analyze-query*
  "When bound to true, EXPLAIN ANALYZE will be run for each query executed by Toucan 2."
  false)

(defn- run-explain-analyze
  "Run EXPLAIN ANALYZE on a query and print the results."
  [^Connection conn query]
  (let [[sql & params] query
        explain-sql    (str "EXPLAIN ANALYZE " sql)]
    (try
      (with-open [stmt (.prepareStatement conn explain-sql)]
        (doseq [[idx param] (map-indexed vector params)]
          (.setObject stmt (inc idx) param))
        (with-open [rs (.executeQuery stmt)]
          (let [results (loop [rows []]
                          (if (.next rs)
                            (recur (conj rows (.getString rs 1)))
                            rows))]
            (println "\n===== EXPLAIN ANALYZE =====")
            (println "Query:" sql)
            (when (seq params)
              (println "Params:" (pr-str params)))
            (println "----------------------------")
            (doseq [row results]
              (println row))
            (println "============================\n"))))
      (catch Exception e
        (log/warnf e "Failed to run EXPLAIN ANALYZE for query: %s" sql)))))

(defn- explain-analyze-fn
  "Around method that runs EXPLAIN ANALYZE when *analyze-query* is bound to true."
  [next-method rf conn query-type model query]
  (when *analyze-query*
    (run-explain-analyze conn query))
  (next-method rf conn query-type model query))

(defn start!
  "Start intercepting queries to run EXPLAIN ANALYZE.
  Remember to also bind *analyze-query* to true, or use the `explain` macro."
  []
  (methodical/add-aux-method-with-unique-key!
   #'t2.pipeline/transduce-execute-with-connection
   :around
   :default
   explain-analyze-fn
   ::explain-analyze))

(defn stop!
  "Stop intercepting queries for EXPLAIN ANALYZE."
  []
  (methodical/remove-aux-method-with-unique-key!
   #'t2.pipeline/transduce-execute-with-connection
   :around
   :default
   ::explain-analyze))

(defn do-explain
  "Implementation for the `explain` macro."
  [thunk]
  (start!)
  (try
    (binding [*analyze-query* true]
      (thunk))
    (finally
      (stop!))))

(defmacro explain
  "Run forms with EXPLAIN ANALYZE enabled for all Toucan 2 queries.

  Example:
    (explain
      (t2/select :model/User :id 1))

  This will print the EXPLAIN ANALYZE output for each query executed."
  [& body]
  `(do-explain (^:once fn* [] ~@body)))

(comment
  ;; Example usage:
  (require '[toucan2.core :as t2])

  ;; Using the macro
  (explain
   (t2/select :model/User :id 1))

  ;; Manual start/stop with dynamic binding
  (start!)
  (binding [*analyze-query* true]
    (t2/select :model/User :id 1))
  (stop!))
