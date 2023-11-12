(ns metabase.driver.sql-jdbc.perf-test
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
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

(defn- run-auto-commit-performance-test
  [make-query-fn {:keys [start bound] :as opts}]
  (doseq [auto-commit [true false]]
    (binding [sql-jdbc.execute/*read-only-connection-auto-commit* auto-commit]
      (mt/test-drivers (descendants driver/hierarchy :sql-jdbc)
        (mt/dataset sample-dataset
          (let [queries (mapv make-query-fn (range start bound))]
            (run-query (first queries))
            #_{:clj-kondo/ignore [:discouraged-var]}
            (prn (assoc opts :driver driver/*driver* :auto-commit auto-commit))
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

(deftest auto-commit-performance-simple-test
  (run-auto-commit-performance-test
   (fn [i]
     (-> (mt/mbql-query orders
           {:aggregation [[:count]]
            :condition   [:and
                          [:> $total 12]
                          [:< $quantity i]]
            :breakout    [!month.created_at]
            :order-by    [[:desc $created_at]]})
         qp/compile
         :query))
   {:test :simple :start 1 :bound 16}))

(deftest auto-commit-performance-join-test
  (run-auto-commit-performance-test
   (fn [i]
     (-> (mt/mbql-query orders
           {:joins       [{:source-table $$orders
                           :fields    :all
                           :alias     "o2"
                           :strategy  :inner-join
                           :condition [:< $id &o2.$id]}]
            :condition   [:and
                          [:< $id 21]
                          [:> $total 12]
                          [:<= $quantity i]
                          [:< &o2.$quantity 3]
                          [:< $total &o2.$total]]
            :aggregation [[:count]]
            :breakout    [$quantity]
            :order-by    [[:desc $quantity]]})
         qp/compile
         :query))
   {:test :join :start 13 :bound 16})) ; TODO

(comment
  (jdbc/with-db-connection [^Connection conn "jdbc:postgresql://vacskamati/metabase?user=metabase&password=metasample123"]
    (prn conn))

  (metabase.test.data.interface/db-test-env-var! :postgresql :host "vacskamati")
  (metabase.test.data.interface/db-test-env-var! :postgresql :user "metabase")
  (metabase.test.data.interface/db-test-env-var! :postgresql :password "metasample123")
  (metabase.test.data.interface/db-test-env-var! :mysql :host "vacskamati")
  (metabase.test.data.interface/db-test-env-var! :mysql :user "root")
  (metabase.test.data.interface/db-test-env-var! :mysql :password "metasample123")

  (metabase.test.data.env/set-test-drivers! #{:postgres :mysql})

  (jdbc/with-db-connection [conn (metabase.driver.sql-jdbc.connection/connection-details->spec
                                  :postgres
                                  (metabase.test.data.interface/dbdef->connection-details :postgres nil {}))]
    (jdbc/query conn ["SELECT * FROM pg_catalog.pg_tables"]))

  (jdbc/with-db-connection [conn (metabase.driver.sql-jdbc.connection/connection-details->spec
                                  :mysql
                                  (metabase.test.data.interface/dbdef->connection-details :mysql nil {}))]
    (jdbc/query conn ["SELECT * FROM pg_catalog.pg_tables"]))

  (doseq [db (toucan2.core/select :metabase_database)]
    (metabase.driver.sql-jdbc.connection/invalidate-pool-for-db! db))

  (->> (toucan2.core/select :metabase_database :name "sample-dataset")
       (filter (comp #{"postgres" "mysql"} :engine))
       (map :id)
       (run! #(toucan2.core/delete! :metabase_database :id %)))

  (def results
    (with-open [rdr (java.io.PushbackReader. (io/reader "/Users/metamben/github/metabase/read-only-tr-perf-test-mariadb-10.2-local.edn"))]
      (loop [s (take-while #(not= % ::eof)
                           (repeatedly #(edn/read {:readers {'criterium.core.OutlierCount #'identity}
                                                   :eof ::eof}
                                                  rdr)))
             m {}]
        (if (seq s)
          (let [db (first s)
                [now later] (split-with (complement symbol?) (rest s))
                stats (into {} (map vec) (partition-all 2 now))]
            (recur later (assoc m db stats)))
          m))))

  (defn- print-results [results]
    (println "DB,auto commit,isolation level,samples,calls,mean (s),std-deviation (s²),tail quantile (%),lower quantile (s),upper quantile (s),outlier variance (%)")
    (doseq [[db test-runs] results
            [{:keys [auto-commit isolation-level]}
             {:keys [execution-count sample-count mean
                     variance outlier-variance
                     lower-q upper-q tail-quantile]}] test-runs]
      (printf "%s,%s,%s,%d,%d,%2.6f,%E,%f,%f,%f,%2.4f%n"
              db,auto-commit,(if auto-commit "" (name isolation-level)),
              sample-count,execution-count,(first mean),(Math/sqrt (first variance)),
              (* tail-quantile 100),(first lower-q),(first upper-q),(* outlier-variance 100))))

  (print-results results)

  (criterium/bench (Thread/sleep 1000))

  0)
