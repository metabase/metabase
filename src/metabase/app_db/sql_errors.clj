(ns metabase.app-db.sql-errors
  "Classification of SQL errors raised by the supported application databases.
  [[row-rejected?]] tells a bad row apart from a failure of the database itself."
  (:require
   [clojure.string :as str])
  (:import
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

(defn- exception-chain
  "Every exception reachable from `e`, following causes and JDBC's next-exception links without revisiting cycles."
  [e]
  (loop [pending [e]
         seen    #{}
         found   []]
    (if-let [^Throwable x (first pending)]
      (if (seen x)
        (recur (rest pending) seen found)
        (recur (into (vec (rest pending))
                     (remove nil?)
                     [(.getCause x)
                      (when (instance? SQLException x)
                        (.getNextException ^SQLException x))])
               (conj seen x)
               (conj found x)))
      found)))

(defn row-rejected?
  "Whether `e` was caused by the app DB rejecting a row's data: a data exception (SQLSTATE class 22, e.g. a value too
  long for its column) or an integrity-constraint violation (class 23). Other failures, such as a lost connection or
  a pool checkout timeout, are not about any one row. Walks the full cause and JDBC next-exception chains."
  [e]
  (boolean
   (some #(when (instance? SQLException %)
            (when-let [state (.getSQLState ^SQLException %)]
              (or (str/starts-with? state "22")
                  (str/starts-with? state "23"))))
         (exception-chain e))))
