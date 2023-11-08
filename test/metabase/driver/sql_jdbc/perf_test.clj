(ns metabase.driver.sql-jdbc.perf-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [criterium.core :as criterium]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- run-query [query]
  (sql-jdbc.execute/do-with-connection-with-options
   driver/*driver* (mt/db) nil
   (fn [^java.sql.Connection conn]
     (run! :count (jdbc/query {:connection conn} [query])))))

(deftest auto-commit-performance-test
  (doseq [auto-commit [true false]
          set-isolation-level (if auto-commit
                                [false]
                                [false true])]
    (binding [sql-jdbc.execute/*read-only-connection-auto-commit* auto-commit
              sql-jdbc.execute/*read-only-connection-set-isolation-level* set-isolation-level]
      (mt/test-drivers (descendants driver/hierarchy :sql-jdbc)
        (mt/dataset sample-dataset
          (let [queries (mapv (fn [i]
                                (-> (mt/mbql-query orders
                                      {:aggregation [[:count]]
                                       :condition   [:and
                                                     [:> $total 12]
                                                     [:< $quantity i]]
                                       :breakout    [!month.created_at]
                                       :order-by    [[:desc $created_at]]})
                                    qp/compile
                                    :query))
                              (range 1 16))]
            (run-query (first queries))
            #_{:clj-kondo/ignore [:discouraged-var]}
            (printf "Benchmarking with auto-commit %s with isolation-level %s for driver %s%n"
                    auto-commit (if set-isolation-level "set" "unset") driver/*driver*)
            (flush)
            (binding [criterium/*sample-count* 10
                      criterium/*target-execution-time* (* 100 1000 1000)] ; ns
              (let [results (criterium/benchmark
                             (->> (for [query queries]
                                    (future (run-query query)))
                                  (run! deref))
                             {})]
                #_{:clj-kondo/ignore [:discouraged-var]}
                (prn (dissoc results :samples :runtime-details :results))))
            (flush)))))))
