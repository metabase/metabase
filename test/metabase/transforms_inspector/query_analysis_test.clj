(ns ^:mb/driver-tests metabase.transforms-inspector.query-analysis-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql.util :as sql.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.transforms-inspector.query-analysis :as query-analysis]
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

(defn- make-native-transform
  [query]
  {:source {:type :query :query query}
   :name   "query-analysis-test"})

(defn- make-sources
  [& table-keys]
  (mapv (fn [k]
          {:table_name (t2/select-one-fn :name :model/Table :id (mt/id k))
           :table_id   (mt/id k)})
        table-keys))

;;; -------------------------------------------------- Native CTE / subquery tests --------------------------------------------------

(deftest analyze-native-query-cte-join-source-table-is-nil-test
  (mt/test-drivers (mt/normal-driver-select {:+parent :sql
                                             :+features [:left-join]})
    (testing "join against a CTE alias produces nil :source-table"
      (let [query     (lib/native-query
                       (mt/metadata-provider)
                       (str "WITH cte AS (SELECT * FROM " (qt :orders) ") "
                            "SELECT p.*, cte." (qf :orders :user_id) " "
                            "FROM " (qt :people) " p "
                            "LEFT JOIN cte ON p." (qf :people :id) " = cte." (qf :orders :user_id)))
            sources   (make-sources :orders :people)
            transform (make-native-transform query)
            result    (query-analysis/analyze-native-query transform sources)]
        (is (some? result))
        (is (= 1 (count (:join-structure result))))
        (is (nil? (:source-table (first (:join-structure result))))
            "CTE alias should not resolve to a real table ID")))))

(deftest analyze-native-query-mixed-simple-and-cte-joins-test
  (mt/test-drivers (mt/normal-driver-select {:+parent :sql
                                             :+features [:left-join]})
    (testing "mix of simple table join and CTE join: only simple table has source-table"
      (let [query     (lib/native-query
                       (mt/metadata-provider)
                       (str "WITH cte AS (SELECT * FROM " (qt :reviews) ") "
                            "SELECT o.*, pr." (qf :products :title) ", cte." (qf :reviews :rating) " "
                            "FROM " (qt :orders) " o "
                            "JOIN " (qt :products) " pr ON o." (qf :orders :product_id) " = pr." (qf :products :id) " "
                            "LEFT JOIN cte ON o." (qf :orders :id) " = cte." (qf :reviews :id)))
            sources   (make-sources :orders :products :reviews)
            transform (make-native-transform query)
            result    (query-analysis/analyze-native-query transform sources)]
        (is (some? result))
        (is (= 2 (count (:join-structure result))))
        (let [[products-join cte-join] (:join-structure result)]
          (is (= (mt/id :products) (:source-table products-join))
              "simple table join should resolve to a real table ID")
          (is (nil? (:source-table cte-join))
              "CTE join should not resolve to a real table ID"))))))
