(ns metabase.driver.sql-jdbc.perf-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [criterium.core :as criterium]
   [honey.sql :as sql]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
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
                                (-> {:from [[:orders :o1] [:orders :o2]]
                                     :select [:o1.quantity [:%count.0]]
                                     :where [:and
                                             [:< :o1.id [:inline 21]]
                                             [:< :o1.id :o2.id]
                                             [:< :o1.total :o2.total]
                                             [:> :o1.total [:inline 12]]
                                             [:< :o2.quantity [:inline 3]]
                                             [:< :o1.quantity [:inline i]]]
                                     :group-by [:o1.quantity]
                                     :order-by [[:o1.quantity :desc]]}
                                    sql/format
                                    first))
                              (range 5 8))]
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
                                                         (.getLong rs col)
                                                         (when (.wasNull rs)
                                                           (throw (ex-info (str "column " col " null")
                                                                           {:column col}))))))))))))
                                  (run! deref))
                             {})]
                #_{:clj-kondo/ignore [:discouraged-var]}
                (prn (dissoc results :samples :runtime-details :results :os-details))))
            (flush)))))))
