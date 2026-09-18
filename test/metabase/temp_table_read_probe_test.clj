(ns ^:mb/driver-tests metabase.temp-table-read-probe-test
  "Temporary: finds which way of reading a capped result leaves a warehouse transaction usable."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.test :as mt])
  (:import
   (java.sql Connection ResultSet Statement)))

(set! *warn-on-reflection* true)

(def ^:private three-rows
  "SELECT 1 AS id UNION ALL SELECT 2 AS id UNION ALL SELECT 3 AS id")

(defn- read-rows
  "Read `rs` to its end, or stop after `stop-after` rows when that is given."
  [^ResultSet rs stop-after]
  (loop [n 0]
    (if (and (or (nil? stop-after) (< n stop-after))
             (.next rs))
      (do (.getObject rs 1) (recur (inc n)))
      n)))

(defn- probe
  "Create a temp table of three rows, read it as `read!` does, then see whether the connection still answers."
  [label read!]
  (try
    (driver/do-with-test-connection
     driver/*driver*
     (mt/db)
     (fn [conn]
       (let [table (driver/temp-table-name driver/*driver*)]
         (driver/execute-on-connection! driver/*driver* conn
                                        (driver/compile-create-temp-table
                                         driver/*driver*
                                         {:table table :query {:query three-rows :params []}}))
         (read! conn table)
         (with-open [^Statement stmt (.createStatement ^Connection conn)
                     ^ResultSet rs   (.executeQuery stmt "SELECT 1")]
           (.next rs))
         (println "PROBE" label "=> connection still usable"))))
    (catch Exception e
      (println "PROBE" label "=> BROKE:" (ex-message e)))))

(defn- select-all
  "Read `SELECT * FROM table` with `max-rows` given to `setMaxRows`, stopping after `stop-after` rows."
  [max-rows stop-after]
  (fn [conn table]
    (with-open [^Statement stmt (.createStatement ^Connection conn)]
      (when max-rows
        (.setMaxRows stmt (int max-rows)))
      (with-open [^ResultSet rs (.executeQuery stmt (str "SELECT * FROM " table))]
        (read-rows rs stop-after)))))

(deftest temp-table-read-probe-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/testing)
    (probe "full read, no cap"            (select-all nil nil))
    (probe "setMaxRows 1, read to end"    (select-all 1 nil))
    (probe "setMaxRows 1, stop at 1"      (select-all 1 1))
    (probe "no setMaxRows, stop at 1"     (select-all nil 1))
    (probe "setMaxRows 5 over 3 rows"     (select-all 5 nil))
    (probe "SQL LIMIT 1, read to end"
           (fn [conn table]
             (with-open [^Statement stmt (.createStatement ^Connection conn)
                         ^ResultSet rs   (.executeQuery stmt (str "SELECT * FROM " table " LIMIT 1"))]
               (read-rows rs nil))))
    (probe "setMaxRows 1 with fetch size 1, read to end"
           (fn [conn table]
             (with-open [^Statement stmt (doto (.createStatement ^Connection conn)
                                           (.setMaxRows (int 1))
                                           (.setFetchSize (int 1)))]
               (with-open [^ResultSet rs (.executeQuery stmt (str "SELECT * FROM " table))]
                 (read-rows rs nil)))))
    (is true)))
