(ns metabase.driver.sql-jdbc.perf-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [criterium.core :as criterium]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.query-processor :as qp]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt])
  (:import
   (java.sql Connection ResultSet)))

(set! *warn-on-reflection* true)

(defn- run-query [query]
  (sql-jdbc.execute/do-with-connection-with-options
   driver/*driver* (mt/db) nil
   (fn [^java.sql.Connection conn]
     (jdbc/query {:connection conn} [query]))))

(deftest auto-commit-performance-test
  (doseq [auto-commit [true false]]
    (binding [sql-jdbc.execute/*read-only-connection-auto-commit* auto-commit]
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
            (prn {:driver driver/*driver*, :auto-commit auto-commit})
            (flush)
            (qp.store/with-metadata-provider (:id (mt/db))
              (let [results (criterium/benchmark
                             (->> (for [query queries]
                                    (future (sql-jdbc.execute/do-with-connection-with-options
                                             driver/*driver*
                                             (mt/db)
                                             nil
                                             (fn [^Connection conn]
                                               (with-open [stmt (sql-jdbc.execute/statement driver/*driver* conn)
                                                           ^ResultSet rs (sql-jdbc.execute/execute-statement!
                                                                          driver/*driver* stmt query)]
                                                 (let [rsmeta (.getMetaData rs)]
                                                   (when (not= (.getColumnCount rsmeta) 2)
                                                     (throw (ex-info "unexpected column count"
                                                                     {:count (.getColumnCount rsmeta)})))
                                                   (while (.next rs)
                                                     (dotimes [col 2]
                                                       (let [col (inc col)]
                                                         (.getObject rs col)
                                                         (when (.wasNull rs)
                                                           (throw (ex-info (str "column " col " null")
                                                                           {:column col}))))))))))))
                                  (run! deref))
                             {})]
                #_{:clj-kondo/ignore [:discouraged-var]}
                (prn (dissoc results :samples :runtime-details :results :os-details))))
            (flush)))))))
