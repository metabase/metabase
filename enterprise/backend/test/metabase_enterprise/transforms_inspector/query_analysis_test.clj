(ns ^:mb/driver-tests metabase-enterprise.transforms-inspector.query-analysis-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-inspector.query-analysis :as query-analysis]
   [metabase.driver :as driver]
   [metabase.driver.sql.util :as sql.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest analyze-mbql-query-multi-stage-returns-nil-test
  (testing "analyze-mbql-query returns nil for multi-stage queries"
    (let [mp    (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                    lib/append-stage)
          transform {:source {:type :query :query query}
                     :name   "multi-stage-test"}]
      (is (nil? (query-analysis/analyze-mbql-query transform))))))

(deftest analyze-mbql-query-single-stage-returns-result-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "analyze-mbql-query returns result for single-stage queries"
      (let [mp    (mt/metadata-provider)
            query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                      (lib/join (-> (lib/join-clause
                                     (lib.metadata/table mp (mt/id :products))
                                     [(lib/= (lib.metadata/field mp (mt/id :orders :product_id))
                                             (-> (lib.metadata/field mp (mt/id :products :id))
                                                 (lib/with-join-alias "Products")))])
                                    (lib/with-join-alias "Products")
                                    (lib/with-join-fields :all))))
            transform {:source {:type :query :query query}
                       :name   "single-stage-test"}
            result    (query-analysis/analyze-mbql-query transform)]
        (is (some? result))
        (is (some? (:preprocessed-query result)))
        (is (= 1 (count (:join-structure result))))
        (is (some? (:visited-fields result)))))))

;;; -------------------------------------------------- Helpers --------------------------------------------------

(defn- qt
  "Quote a table name for the current driver, with schema qualification."
  [table-key]
  (let [{:keys [name schema]} (t2/select-one [:model/Table :name :schema] :id (mt/id table-key))]
    (sql.u/quote-name driver/*driver* :table schema name)))

(defn- qf
  "Quote a field/column name for the current driver."
  [table-key col-key]
  (let [col-name (t2/select-one-fn :name :model/Field :id (mt/id table-key col-key))]
    (sql.u/quote-name driver/*driver* :field col-name)))

(defn- join-steps-drivers
  "The SQL drivers with left joins whose native join steps sql-tools can generate."
  []
  (mt/normal-driver-select {:+parent   :sql
                            :+features [:left-join]
                            :+fns      [sql-tools/join-steps-supported-driver?]}))

(defn- make-native-transform
  [query]
  {:source {:type :query :query query}
   :name   "query-analysis-test"})

;;; -------------------------------------------------- Native CTE / subquery tests --------------------------------------------------

(deftest analyze-native-query-cte-join-source-table-is-nil-test
  (mt/test-drivers (join-steps-drivers)
    (testing "join against a CTE alias produces nil :source-table"
      (let [query     (lib/native-query
                       (mt/metadata-provider)
                       (str "WITH cte AS (SELECT * FROM " (qt :orders) ") "
                            "SELECT p.*, cte." (qf :orders :user_id) " "
                            "FROM " (qt :people) " p "
                            "LEFT JOIN cte ON p." (qf :people :id) " = cte." (qf :orders :user_id)))
            transform (make-native-transform query)]
        (is (=? {:join-structure [{:strategy :left-join, :source-table nil}]}
                (query-analysis/analyze-native-query transform)))))))

(deftest analyze-native-query-mixed-simple-and-cte-joins-test
  (mt/test-drivers (join-steps-drivers)
    (testing "mix of simple table join and CTE join: only simple table has source-table"
      (let [query     (lib/native-query
                       (mt/metadata-provider)
                       (str "WITH cte AS (SELECT * FROM " (qt :reviews) ") "
                            "SELECT o.*, pr." (qf :products :title) ", cte." (qf :reviews :rating) " "
                            "FROM " (qt :orders) " o "
                            "JOIN " (qt :products) " pr ON o." (qf :orders :product_id) " = pr." (qf :products :id) " "
                            "LEFT JOIN cte ON o." (qf :orders :id) " = cte." (qf :reviews :id)))
            transform (make-native-transform query)]
        (is (=? {:join-structure [{:strategy :inner-join, :source-table (mt/id :products)}
                                  {:strategy :left-join, :source-table nil}]}
                (query-analysis/analyze-native-query transform)))))))

;;; ------------------------------------------- Native step queries -------------------------------------------

(defn- run-sql
  "The rows of `sql`, run on the test database."
  [sql]
  (mt/rows (qp/process-query (lib/native-query (mt/metadata-provider) sql))))

(defn- count-of
  "The single count `sql` returns."
  [sql]
  (long (ffirst (run-sql sql))))

(defn- step-counts
  "The counts the step query of each join returns, as longs."
  [result]
  (mapv (fn [{:keys [step-sql]}] (mapv long (first (run-sql step-sql))))
        (:join-structure result)))

(deftest analyze-native-query-step-queries-count-the-join-chain-test
  (mt/test-drivers (join-steps-drivers)
    (testing "a LEFT JOIN with a compound condition counts the rows as written and the rows that found a match"
      (let [query     (lib/native-query
                       (mt/metadata-provider)
                       (str "SELECT o." (qf :orders :id) " "
                            "FROM " (qt :orders) " o "
                            "LEFT JOIN " (qt :products) " pr "
                            "ON pr." (qf :products :id) " = o." (qf :orders :product_id) " "
                            "AND pr." (qf :products :category) " = 'Widget' "
                            "WHERE o." (qf :orders :total) " > 100"))
            result    (query-analysis/analyze-native-query (make-native-transform query))
            orders    (count-of (str "SELECT COUNT(*) FROM " (qt :orders)))
            widgets   (count-of (str "SELECT COUNT(*) FROM " (qt :orders) " o "
                                     "JOIN " (qt :products) " pr "
                                     "ON pr." (qf :products :id) " = o." (qf :orders :product_id) " "
                                     "WHERE pr." (qf :products :category) " = 'Widget'"))]
        (is (=? {:from-table-id  (mt/id :orders)
                 :join-structure [{:strategy :left-join, :source-table (mt/id :products)}]}
                result))
        (testing "the WHERE clause is left out of every count"
          (is (= orders (count-of (:from-count-sql result))))
          (is (= [[orders widgets]] (step-counts result))))))))

(deftest analyze-native-query-matched-count-is-the-inner-join-count-test
  (mt/test-drivers (join-steps-drivers)
    (testing "a condition true of every unmatched row counts no match, where COUNT(CASE WHEN <condition>) counted all"
      (let [query  (lib/native-query
                    (mt/metadata-provider)
                    (str "SELECT o." (qf :orders :id) " "
                         "FROM " (qt :orders) " o "
                         "LEFT JOIN " (qt :products) " pr ON pr." (qf :products :id) " IS NULL"))
            result (query-analysis/analyze-native-query (make-native-transform query))
            orders (count-of (str "SELECT COUNT(*) FROM " (qt :orders)))]
        (is (= [[orders 0]] (step-counts result)))))))

(deftest analyze-native-query-comma-join-has-no-join-structure-test
  (mt/test-drivers (mt/normal-driver-select {:+parent :sql})
    (testing "a comma join is refused, since its condition is in the WHERE clause, and visited fields still resolve"
      (let [query  (lib/native-query
                    (mt/metadata-provider)
                    (str "SELECT o." (qf :orders :id) " "
                         "FROM " (qt :orders) " o, " (qt :products) " pr "
                         "WHERE pr." (qf :products :id) " = o." (qf :orders :product_id)))
            result (query-analysis/analyze-native-query (make-native-transform query))]
        (is (nil? (:join-structure result)))
        (is (contains? (get-in result [:visited-fields :all]) (mt/id :orders :product_id)))))))
