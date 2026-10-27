(ns dev.dbt-import.e2e-test
  "The converter's output imported into a real instance (QRES-2), which the unit tests cannot check: that the YAML
  imports, the field refs bind, the metrics run and return the numbers a hand-written SQL query does, the curated
  dimensions break a metric out through their implicit joins, and that importing again updates the cards instead of
  duplicating them.

  The warehouse is the flexanalytics project's mart tables loaded as a test dataset (`flexanalytics_marts.edn`, see
  [[dev.dbt-import.marts]]), on Postgres only: the manifest names its tables `public.fact_sales` and so on, and serdes
  binds a field ref by exact name, which is what a Postgres test dataset is called. H2 would upper-case them."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [dev.dbt-import.core :as dbt-import]
   [medley.core :as m]
   [metabase-enterprise.serialization.v2.ingest :as serdes.ingest]
   [metabase-enterprise.serialization.v2.load :as serdes.load]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-metric.core :as lib-metric]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.query-processor :as qp]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util.date-2 :as u.date]
   [toucan2.core :as t2])
  (:import
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

(defn- marts-dataset
  "The mart tables as a test dataset definition: the database the converted metrics run against."
  []
  (tx/dataset-definition "flexanalytics-marts"
                         (edn/read-string {:readers {'t u.date/parse}}
                                          (slurp (io/resource "dbt_import/flexanalytics_marts.edn")))))

(def ^:private manifest-path
  (delay (.getPath ^java.net.URL (io/resource "dbt_import/flexanalytics_manifest.json"))))

(defn- temp-dir []
  (str (Files/createTempDirectory "dbt-import-e2e" (make-array FileAttribute 0))))

(defn- convert-and-import!
  "Convert the fixture manifest for the current test database and import the result, the way the README says to.
  Returns the converter's report."
  []
  (let [out-dir (temp-dir)
        report  (dbt-import/convert! {:manifest @manifest-path
                                      :out-dir  out-dir
                                      :config   {:databases     {"dbt_bi" (:name (mt/db))}
                                                 :driver        :postgres
                                                 :creator-email (:email (mt/fetch-user :crowberto))}})]
    (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
      (serdes.load/load-metabase! (serdes.ingest/ingest-yaml out-dir)))
    report))

(defn- imported-cards
  "The imported Card for each converted metric, by metric name."
  [report]
  (into {}
        (map (fn [{metric-name :name, :keys [entity-id]}]
               [metric-name (t2/select-one :model/Card :entity_id entity-id)]))
        (:converted report)))

(defn- metric-value
  "What the imported metric returns when a fresh query aggregates by it: a scalar."
  [card]
  (let [mp (lib-be/application-database-metadata-provider (mt/id))]
    (ffirst (mt/rows (qp/process-query (lib/query mp (lib.metadata/metric mp (:id card))))))))

(defn- sql-rows
  "The rows a hand-written SQL query over the same tables returns."
  [sql]
  (mt/rows (qp/process-query (mt/native-query {:query sql}))))

(defn- =approx
  "Numbers from two SQL queries that should agree, allowing for float summation order."
  [expected actual]
  (and (number? expected)
       (number? actual)
       (< (abs (- (double expected) (double actual))) 1e-6)))

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

(defn- breakout-rows
  "The imported metric broken out by one of its curated dimensions, the way the metric UI does it: through the
  metric's definition, the dimension projected, planned into an MBQL query and run."
  [card dimension-name]
  (let [mp         (lib-metric/metadata-provider)
        metric     (first (lib.metadata.protocols/metadatas mp {:lib/type :metadata/metric, :id #{(:id card)}}))
        definition (lib-metric/from-metric-metadata mp metric)
        dimension  (m/find-first #(= dimension-name (:name %)) (lib-metric/projectable-dimensions definition))
        plan       (lib-metric/->query-plan (lib-metric/project-dimension definition dimension))]
    (is (some? dimension) (str "no projectable dimension " dimension-name))
    (is (= :leaf (:plan/type plan)))
    (mt/rows (qp/process-query (:plan/mbql plan)))))

(defn- rows=approx
  "Rows of a breakout from two queries: the same keys in the same order, and values that agree."
  [expected actual]
  (and (= (count expected) (count actual))
       (every? (fn [[[expected-key expected-value] [actual-key actual-value]]]
                 (and (= (str expected-key) (str actual-key))
                      (=approx expected-value actual-value)))
               (map vector expected actual))))

(deftest import-test
  (mt/test-driver :postgres
    (mt/dataset (marts-dataset)
      (mt/with-model-cleanup [:model/Card :model/Collection]
        (let [report (convert-and-import!)
              cards  (imported-cards report)]
          (testing "every converted metric imported as a metric card in the collection"
            (is (= (set (keys hand-written-sql)) (set (keys cards))))
            (is (every? #(= :metric (:type %)) (vals cards)))
            (is (= 1 (count (distinct (map :collection_id (vals cards)))))))
          (testing "the field refs bound to the synced tables"
            (is (= #{(mt/id :fact_sales)} (set (map :table_id (vals cards))))))
          (testing "each metric returns what the hand-written SQL does"
            (doseq [[metric-name sql] hand-written-sql
                    :let [expected (ffirst (sql-rows sql))
                          actual   (metric-value (cards metric-name))]]
              (is (=approx expected actual)
                  (format "%s: SQL says %s, the metric says %s" metric-name expected actual))))
          (testing "the curated dimensions were imported with the cards"
            (is (= #{"date_day" "order_status_dim" "product_category_dim"}
                   (set (map :name (:dimensions (cards "sales"))))))
            (is (every? (comp seq :dimension_mappings) (vals cards))))
          (testing "a metric breaks out by a dimension on a joined dimension table, through the implicit join"
            (is (rows=approx (sql-rows (str "SELECT p.product_category, sum(f.sales)"
                                            "  FROM fact_sales f JOIN dim_product p ON p.product_key = f.product_key"
                                            " GROUP BY p.product_category ORDER BY p.product_category"))
                             (sort-by first (breakout-rows (cards "sales") "product_category_dim")))))
          (testing "a cumulative metric broken out by its time dimension is the running total"
            (is (rows=approx (sql-rows (str "SELECT date_day, sum(sum(sales)) OVER (ORDER BY date_day)"
                                            "  FROM fact_sales GROUP BY date_day ORDER BY date_day"))
                             (breakout-rows (cards "cumulative_sales") "date_day"))))
          (testing "the imported cards have result metadata"
            (is (every? (comp seq :result_metadata) (vals cards))))
          (testing "importing again updates the cards instead of duplicating them"
            (let [cards-again (imported-cards (convert-and-import!))]
              (is (= (m/map-vals :id cards) (m/map-vals :id cards-again)))
              (is (= (m/map-vals (comp set #(map :id %) :dimensions) cards)
                     (m/map-vals (comp set #(map :id %) :dimensions) cards-again)))
              (is (= (count cards)
                     (t2/count :model/Card :collection_id (:collection_id (first (vals cards)))))))))))))
