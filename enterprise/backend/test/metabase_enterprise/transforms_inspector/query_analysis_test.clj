(ns ^:mb/driver-tests metabase-enterprise.transforms-inspector.query-analysis-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-inspector.query-analysis :as query-analysis]
   [metabase.driver :as driver]
   [metabase.driver.sql.util :as sql.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
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
  "The drivers a native transform runs on, whose join steps the inspector can show, and H2."
  []
  (conj (mt/normal-driver-select {:+parent :sql, :+features [:left-join :transforms/table]}) :h2))

(defn- make-native-transform
  [query]
  {:source {:type :query :query query}
   :name   "query-analysis-test"})

(defn- test-sources
  "The test tables as the transform sources a native query's joins resolve against."
  []
  (mapv (fn [k]
          {:table_name (t2/select-one-fn :name :model/Table :id (mt/id k))
           :table_id   (mt/id k)})
        [:orders :people :products :reviews]))

;;; -------------------------------------------------- Native CTE / subquery tests --------------------------------------------------

(deftest analyze-native-query-cte-join-source-table-is-nil-test
  (mt/test-drivers (join-steps-drivers)
    (testing "join against a CTE alias produces nil :source-table, and no step queries"
      (let [query     (lib/native-query
                       (mt/metadata-provider)
                       (str "WITH cte AS (SELECT * FROM " (qt :orders) ") "
                            "SELECT p.*, cte." (qf :orders :user_id) " "
                            "FROM " (qt :people) " p "
                            "LEFT JOIN cte ON p." (qf :people :id) " = cte." (qf :orders :user_id)))
            transform (make-native-transform query)]
        (is (=? {:from-count-sql nil
                 :join-structure [{:strategy :left-join, :source-table nil, :step-sql nil}]}
                (query-analysis/analyze-native-query transform (test-sources))))))))

(deftest analyze-native-query-mixed-simple-and-cte-joins-test
  (mt/test-drivers (join-steps-drivers)
    (testing "a table join and a CTE join: only the table join has a source-table, and neither has a step query"
      (let [query     (lib/native-query
                       (mt/metadata-provider)
                       (str "WITH cte AS (SELECT * FROM " (qt :reviews) ") "
                            "SELECT o.*, pr." (qf :products :title) ", cte." (qf :reviews :rating) " "
                            "FROM " (qt :orders) " o "
                            "JOIN " (qt :products) " pr ON o." (qf :orders :product_id) " = pr." (qf :products :id) " "
                            "LEFT JOIN cte ON o." (qf :orders :id) " = cte." (qf :reviews :id)))
            transform (make-native-transform query)]
        (is (=? {:from-count-sql nil
                 :join-structure [{:strategy :inner-join, :source-table (mt/id :products), :step-sql nil}
                                  {:strategy :left-join, :source-table nil, :step-sql nil}]}
                (query-analysis/analyze-native-query transform (test-sources))))))))

(deftest ^:parallel analyze-native-query-resolves-tables-by-name-among-sources-test
  (mt/test-driver :h2
    (testing "an unqualified table resolves to the transform's source of that name, whatever its schema"
      (let [query (lib/native-query (mt/metadata-provider) "SELECT 1 FROM orders o JOIN people p ON p.id = o.user_id")]
        (is (=? {:from-table-id  101
                 :join-structure [{:source-table 102}]}
                (query-analysis/analyze-native-query (make-native-transform query)
                                                     [{:table_name "ORDERS", :table_id 101, :schema "elsewhere"}
                                                      {:table_name "PEOPLE", :table_id 102, :schema "elsewhere"}])))))))

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

(defn- check-widget-left-join-steps
  "Check the steps of a LEFT JOIN on a compound condition, under a WHERE clause the counts leave out."
  []
  (let [query   (lib/native-query
                 (mt/metadata-provider)
                 (str "SELECT o." (qf :orders :id) " "
                      "FROM " (qt :orders) " o "
                      "LEFT JOIN " (qt :products) " pr "
                      "ON pr." (qf :products :id) " = o." (qf :orders :product_id) " "
                      "AND pr." (qf :products :category) " = 'Widget' "
                      "WHERE o." (qf :orders :total) " > 100"))
        result  (query-analysis/analyze-native-query (make-native-transform query) (test-sources))
        orders  (count-of (str "SELECT COUNT(*) FROM " (qt :orders)))
        widgets (count-of (str "SELECT COUNT(*) FROM " (qt :orders) " o "
                               "JOIN " (qt :products) " pr "
                               "ON pr." (qf :products :id) " = o." (qf :orders :product_id) " "
                               "WHERE pr." (qf :products :category) " = 'Widget'"))]
    (is (=? {:from-table-id  (mt/id :orders)
             :join-structure [{:strategy :left-join, :source-table (mt/id :products)}]}
            result))
    (testing "the WHERE clause is left out of every count"
      (is (= orders (count-of (:from-count-sql result))))
      (is (= [[orders widgets]] (step-counts result))))))

(deftest analyze-native-query-step-queries-count-the-join-chain-test
  (mt/test-drivers (join-steps-drivers)
    (testing "a LEFT JOIN with a compound condition counts the rows as written and the rows that found a match"
      (check-widget-left-join-steps))))

(deftest analyze-native-query-step-queries-with-the-macaw-backend-test
  ;; The drivers Macaw's options were tuned for.
  (mt/test-drivers #{:h2 :postgres}
    (mt/with-temporary-setting-values [sql-tools-parser-backend "macaw"]
      (testing "with the Macaw backend, a LEFT JOIN with a compound condition still counts both"
        (check-widget-left-join-steps)))))

(deftest analyze-native-query-matched-count-is-the-inner-join-count-test
  (mt/test-drivers (join-steps-drivers)
    (testing "a condition true of every unmatched row counts no match, where COUNT(CASE WHEN <condition>) counted all"
      (let [query  (lib/native-query
                    (mt/metadata-provider)
                    (str "SELECT o." (qf :orders :id) " "
                         "FROM " (qt :orders) " o "
                         "LEFT JOIN " (qt :products) " pr ON pr." (qf :products :id) " IS NULL"))
            result (query-analysis/analyze-native-query (make-native-transform query) (test-sources))
            orders (count-of (str "SELECT COUNT(*) FROM " (qt :orders)))]
        (is (= [[orders 0]] (step-counts result)))))))

(deftest analyze-native-query-comma-join-test
  (mt/test-drivers (join-steps-drivers)
    (let [comma-join #(lib/native-query
                       (mt/metadata-provider)
                       (str "SELECT o." (qf :orders :id) " "
                            "FROM " (qt :orders) " o, " (qt :products) " pr"
                            %))
          analyze    #(query-analysis/analyze-native-query (make-native-transform %) (test-sources))]
      (testing "a comma join with no WHERE clause counts the cross product"
        (let [result   (analyze (comma-join ""))
              orders   (count-of (str "SELECT COUNT(*) FROM " (qt :orders)))
              products (count-of (str "SELECT COUNT(*) FROM " (qt :products)))]
          (is (=? {:join-structure [{:strategy :cross-join, :source-table (mt/id :products)}]}
                  result))
          (is (= [[(* orders products)]] (step-counts result)))))
      (testing "a comma join with a WHERE clause, which may hold its condition, has its joins but no step queries"
        (let [result (analyze (comma-join (str " WHERE pr." (qf :products :id) " = o." (qf :orders :product_id))))]
          (is (=? {:from-count-sql nil
                   :join-structure [{:strategy :cross-join, :source-table (mt/id :products), :step-sql nil}]}
                  result))
          (is (contains? (get-in result [:visited-fields :all]) (mt/id :orders :product_id))))))))
