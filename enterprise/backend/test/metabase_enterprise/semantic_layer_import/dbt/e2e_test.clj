(ns metabase-enterprise.semantic-layer-import.dbt.e2e-test
  "The converter's output imported into a real instance, which the unit tests cannot check: that the YAML
  imports, the field refs bind, the metrics run and return the numbers a hand-written SQL query does, the curated
  dimensions break a metric out through their implicit joins, and that importing again updates the cards instead of
  duplicating them.

  The warehouse is the flexanalytics project's mart tables loaded as a test dataset (`flexanalytics_marts.edn`, see
  [[metabase-enterprise.semantic-layer-import.dbt.test-util.marts]]), on Postgres only: the manifest names its tables
  `public.fact_sales` and so on, and serdes binds a field ref by exact name, which is what a Postgres test dataset is
  called. H2 would upper-case them."
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase-enterprise.semantic-layer-import.dbt.test-util :as tu]
   [metabase-enterprise.semantic-layer-import.test-util.e2e :as e2e]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- convert-and-import!
  "Convert the fixture manifest for the current test database and import it (see [[e2e/convert-and-import!]])."
  []
  (e2e/convert-and-import! {:type   :dbt
                            :raw    tu/flexanalytics-manifest-filename
                            :config {:databases     {"dbt_bi" (:name (mt/db))}
                                     :driver        :postgres
                                     :creator-email (:email (mt/fetch-user :crowberto))}}))

(def ^:private hand-written-sql
  "For each converted metric, the SQL a person would write for the same number over the mart tables."
  {"sales"                   "SELECT sum(sales) FROM fact_sales"
   "target"                  "SELECT sum(target) FROM fact_sales"
   "quantity"                "SELECT sum(quantity) FROM fact_sales"
   "price"                   "SELECT avg(price) FROM fact_sales"
   "row_count"               "SELECT count(*) FROM fact_sales"
   "customer_count"          "SELECT count(DISTINCT customer_key) FROM fact_sales"
   "product_count"           "SELECT count(DISTINCT product_key) FROM fact_sales"
   "order_count"             "SELECT count(DISTINCT order_key) FROM fact_sales"
   "sales_to_target"         "SELECT avg(sales / target) FROM fact_sales"
   "sales_to_target_ratio_2" "SELECT sum(sales) / sum(target) FROM fact_sales"
   "sales_minus_target"      "SELECT sum(sales) - sum(target) FROM fact_sales"
   "sales_pct_of_target"     "SELECT sum(sales) / sum(target) * 100 FROM fact_sales"
   "cancelled_order_share"   (str "SELECT count(DISTINCT CASE WHEN o.status = 'Cancelled' THEN f.order_key END)::float"
                                  "     / count(DISTINCT f.order_key)"
                                  "  FROM fact_sales f JOIN dim_order o ON o.order_key = f.order_key")
   ;; a running total with nothing to run over is the total
   "cumulative_sales"        "SELECT sum(sales) FROM fact_sales"})

(deftest import-test
  (mt/test-driver :postgres
    (mt/dataset (e2e/dataset-definition "flexanalytics-marts" (str tu/fixtures-dir "/flexanalytics_marts.edn"))
      (mt/with-model-cleanup [:model/Card :model/Collection]
        ;; the dataset's database is created on first use: create it before counting what the import adds
        (mt/db)
        (let [before (e2e/warehouse-row-counts)
              report (convert-and-import!)
              cards  (e2e/imported-cards report)]
          (testing "the preflight check binds every reference against the synced tables"
            (is (= [] (:preflight report))))
          (testing "the import made up no Database, Table or Field for a reference it could not bind"
            (is (= before (e2e/warehouse-row-counts))))
          (testing "every converted metric imported as a metric card in the collection"
            (is (= (set (keys hand-written-sql)) (set (keys cards))))
            (is (every? #(= :metric (:type %)) (vals cards)))
            (is (= 1 (count (distinct (map :collection_id (vals cards)))))))
          (testing "the field refs bound to the synced tables"
            (is (= #{(mt/id :fact_sales)} (set (map :table_id (vals cards))))))
          (testing "each metric returns what the hand-written SQL does"
            (doseq [[metric-name sql] hand-written-sql
                    :let [expected (ffirst (e2e/sql-rows sql))
                          actual   (e2e/metric-value (cards metric-name))]]
              (is (e2e/approx= expected actual)
                  (format "%s: SQL says %s, the metric says %s" metric-name expected actual))))
          (testing "the curated dimensions were imported with the cards"
            (is (= #{"date_day" "order_status_dim" "product_category_dim"}
                   (set (map :name (:dimensions (cards "sales"))))))
            (is (every? (comp seq :dimension_mappings) (vals cards))))
          (testing "a metric breaks out by a dimension on a joined dimension table, through the implicit join"
            (is (e2e/rows-approx= (e2e/sql-rows (str "SELECT p.product_category, sum(f.sales)"
                                                     "  FROM fact_sales f JOIN dim_product p ON p.product_key = f.product_key"
                                                     " GROUP BY p.product_category ORDER BY p.product_category"))
                                  (sort-by first (e2e/breakout-rows (cards "sales") "product_category_dim")))))
          (testing "a cumulative metric broken out by its time dimension is the running total"
            (is (e2e/rows-approx= (e2e/sql-rows (str "SELECT date_day, sum(sum(sales)) OVER (ORDER BY date_day)"
                                                     "  FROM fact_sales GROUP BY date_day ORDER BY date_day"))
                                  (e2e/breakout-rows (cards "cumulative_sales") "date_day"))))
          (testing "the imported cards have result metadata"
            (is (every? (comp seq :result_metadata) (vals cards))))
          (testing "importing again updates the cards instead of duplicating them"
            (let [cards-again (e2e/imported-cards (convert-and-import!))]
              (is (= (m/map-vals :id cards) (m/map-vals :id cards-again)))
              (is (= (m/map-vals (comp set #(map :id %) :dimensions) cards)
                     (m/map-vals (comp set #(map :id %) :dimensions) cards-again)))
              (is (= (count cards)
                     (t2/count :model/Card :collection_id (:collection_id (first (vals cards)))))))))))))
