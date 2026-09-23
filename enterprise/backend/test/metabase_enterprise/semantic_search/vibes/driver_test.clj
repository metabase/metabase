(ns metabase-enterprise.semantic-search.vibes.driver-test
  "Vibes on normal SQLite warehouse connections, including the native query processor."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.vibes.jev :as jev]
   [metabase-enterprise.semantic-search.vibes.sqlite :as vibes.sqlite]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sqlite]
   [metabase.query-processor.test :as qp]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (com.mchange.v2.c3p0 ComboPooledDataSource)
   (java.sql Connection DriverManager)
   (org.sqlite SQLiteConnection)))

(set! *warn-on-reflection* true)

(def ^:private candidates
  "WITH meetings(description) AS (VALUES ('item 1'), ('item 3'), ('item 2')) ")

(defn- stub-scores [_ roster _]
  (update-vals roster
               (fn [candidate]
                 (/ (double (parse-long (re-find #"\d+" (str (vals candidate))))) 10.0))))

(defn- q [conn sql]
  (jdbc/execute! conn [sql] {:builder-fn jdbc.rs/as-unqualified-maps}))

(deftest disabled-warehouse-connection-test
  (mt/with-temporary-setting-values [vibes-enabled false]
    (with-open [raw (DriverManager/getConnection "jdbc:sqlite::memory:")]
      (sql-jdbc.execute/do-with-connection-with-options
       :sqlite {:connection raw} nil
       (fn [conn]
         (is (identical? raw conn))
         (is (= [{:n 1}] (q conn "SELECT 1 AS n")))
         (is (thrown-with-msg? Exception #"no such function: vibes"
                               (q conn "SELECT vibes('p', 'item 1')"))))))))

(deftest pooled-warehouse-connection-test
  (vibes.sqlite/reset-cache!)
  (mt/with-temporary-setting-values [vibes-enabled true]
    (mt/with-dynamic-fn-redefs [jev/score-candidates! stub-scores]
      (with-open [pool (doto (ComboPooledDataSource.)
                         (.setJdbcUrl "jdbc:sqlite::memory:")
                         (.setMinPoolSize 1)
                         (.setInitialPoolSize 1)
                         (.setCheckoutTimeout 1000)
                         (.setMaxPoolSize 1))]
        (testing "repeated checkouts register on the physical connection and preserve the pool wrapper"
          (let [physical-connections (atom [])]
            (dotimes [_ 2]
              (with-open [conn ^Connection (sql-jdbc.execute/do-with-connection-with-options
                                            :sqlite {:datasource pool} {:keep-open? true} identity)]
                (swap! physical-connections conj (.unwrap conn SQLiteConnection))
                (is (= [{:v 0.3}] (q conn "SELECT vibes('p', 'item 3') AS v")))))
            (is (apply identical? @physical-connections))))
        (sql-jdbc.execute/do-with-connection-with-options
         :sqlite {:datasource pool} nil
         (fn [^Connection conn]
           (testing "prepared statements preserve candidate, prompt, and LIMIT parameter ordering"
             (with-open [stmt (sql-jdbc.execute/prepared-statement
                               :sqlite conn
                               (str candidates "SELECT description FROM meetings WHERE description <> ? "
                                    "RERANK BASED ON VIBES(?) LIMIT ?")
                               ["item 3" "best" 1])
                         rs (.executeQuery stmt)]
               (is (.next rs))
               (is (= "item 2" (.getString rs 1)))
               (is (false? (.next rs)))))
           (testing "plain statements are rewritten too"
             (with-open [stmt (.createStatement conn)
                         rs (.executeQuery stmt (str candidates "SELECT description FROM meetings "
                                                     "RERANK BASED ON VIBES('best') ASC LIMIT 1"))]
               (is (.next rs))
               (is (= "item 1" (.getString rs 1)))))
           (testing "nested use retains the rewriting connection without registering functions again"
             (sql-jdbc.execute/do-with-connection-with-options
              :sqlite {:connection conn} nil
              (fn [nested]
                (is (identical? conn nested))
                (is (= [{:description "item 3"}]
                       (q nested (str candidates "SELECT description FROM meetings "
                                      "RERANK BASED ON VIBES('best') LIMIT 1")))))))))))))

(deftest native-query-processor-test
  (vibes.sqlite/reset-cache!)
  (mt/with-temporary-setting-values [vibes-enabled true]
    (mt/with-dynamic-fn-redefs [jev/score-candidates! stub-scores]
      (mt/with-temp [:model/Database db {:engine :sqlite :details {:db ":memory:"}}]
        (doseq [sql [(str candidates "SELECT description FROM meetings "
                          "ORDER BY vibes('best', description) DESC")
                     (str candidates "SELECT description FROM meetings RERANK BASED ON VIBES('best')")
                     (str "-- SQL editor comment\n"
                          "WITH user_prompt AS (SELECT 'best' AS prompt), "
                          "meetings(description) AS (VALUES ('item 1'), ('item 3'), ('item 2')) "
                          "SELECT description FROM meetings RERANK BASED ON VIBES")]]
          (testing sql
            (is (= [["item 3"] ["item 2"] ["item 1"]]
                   (mt/rows (qp/process-query {:database (:id db)
                                               :type :native
                                               :native {:query sql}}))))))))))
