(ns metabase-enterprise.semantic-layer-import.ossie.e2e-test
  "The Ossie source's output imported into a real instance, which the unit tests cannot check: that the YAML imports,
  the field refs bind to the names Postgres stores for Snowflake's upper-case ones, the metrics run and return the
  numbers a hand-written SQL query does over TPC-H, the curated dimensions break a metric out through the
  relationship's implicit join, and that importing again updates the cards instead of duplicating them.

  The warehouse is TPC-H at scale factor 0.001 loaded as a test dataset (`tpch_sf0_001.edn`, see
  [[metabase-enterprise.semantic-layer-import.ossie.test-util.tpch]]), on Postgres only: the model's
  `SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.LINEITEM` is mapped onto it with the config, and the Postgres driver folds the
  model's unquoted names to the lower case the dataset is loaded in; H2 would upper-case them. The model's
  `net_revenue` at this scale is checked against the number the dataset generator computed with DuckDB when it wrote
  the dataset (`tpch_sf0_001_summary.edn`), next to the number the TPC-H quickstart documents at scale factor 1, which
  the generator checks against the same formula; a fixture at that scale, six million order lines, is out of the
  question here."
  (:require
   [clojure.edn :as edn]
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase-enterprise.semantic-layer-import.ossie.test-util :as tu]
   [metabase-enterprise.semantic-layer-import.test-util.e2e :as e2e]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private tolerance
  "How far two sums of the same decimals may be apart, Postgres summing in `numeric` and the metric in `double`."
  1e-4)

(defn- convert-and-import!
  "Convert the TPC-H document for the current test database and import it (see [[e2e/convert-and-import!]])."
  []
  (e2e/convert-and-import! {:type   :ossie
                            :raw    tu/tpch-document
                            :config {:databases      {"SNOWFLAKE_SAMPLE_DATA" (:name (mt/db))}
                                     :driver         :postgres
                                     :schema-mapping {"TPCH_SF1" "public"}
                                     :creator-email  (:email (mt/fetch-user :crowberto))}}))

(def ^:private net-revenue-sql
  "SELECT sum(CASE WHEN l_returnflag <> 'R' THEN l_extendedprice * (1 - l_discount) ELSE 0 END) FROM lineitem")

(def ^:private hand-written-sql
  "For each converted metric, the SQL a person would write for the same number over the TPC-H tables."
  {"net_revenue"         net-revenue-sql
   "gross_revenue"       "SELECT sum(l_extendedprice) FROM lineitem"
   "order_count"         "SELECT count(DISTINCT o_orderkey) FROM orders"
   "average_order_value" (str "SELECT sum(CASE WHEN l_returnflag <> 'R' THEN l_extendedprice * (1 - l_discount) ELSE 0 END)"
                              "     / count(DISTINCT l_orderkey) FROM lineitem")})

(deftest import-test
  (mt/test-driver :postgres
    (mt/dataset (e2e/dataset-definition "ossie-tpch" tu/tpch-dataset)
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
          (testing "the field refs bound to the synced tables, each metric on its base dataset's"
            (is (= {"net_revenue"         (mt/id :lineitem)
                    "gross_revenue"       (mt/id :lineitem)
                    "order_count"         (mt/id :orders)
                    "average_order_value" (mt/id :lineitem)}
                   (m/map-vals :table_id cards))))
          (testing "each metric returns what the hand-written SQL does"
            (doseq [[metric-name sql] hand-written-sql
                    :let [expected (ffirst (e2e/sql-rows sql))
                          actual   (e2e/metric-value (cards metric-name))]]
              (is (e2e/approx= expected actual tolerance)
                  (format "%s: SQL says %s, the metric says %s" metric-name expected actual))))
          (testing "net_revenue is the number the generator computed over the same data when it wrote the dataset"
            (let [{:keys [net-revenue]} (edn/read-string (slurp tu/tpch-summary))]
              (is (decimal? net-revenue))
              (is (e2e/approx= net-revenue (e2e/metric-value (cards "net_revenue")) tolerance))))
          (testing "the curated dimensions were imported with the cards"
            (is (= #{"l_orderkey" "l_linenumber" "l_partkey" "return_flag" "ship_date"
                     "o_orderkey" "o_custkey" "order_date" "order_priority"}
                   (set (map :name (:dimensions (cards "net_revenue"))))))
            (is (every? (comp seq :dimension_mappings) (vals cards))))
          (testing "a metric breaks out by its own dimension"
            (is (e2e/rows-approx= (e2e/sql-rows (str "SELECT l_returnflag, sum(CASE WHEN l_returnflag <> 'R' THEN l_extendedprice * (1 - l_discount) ELSE 0 END)"
                                                     "  FROM lineitem GROUP BY l_returnflag ORDER BY l_returnflag"))
                                  (sort-by first (e2e/breakout-rows (cards "net_revenue") "return_flag"))
                                  tolerance)))
          (testing "a metric breaks out by a dimension of the joined dataset, through the relationship's implicit join"
            (is (e2e/rows-approx= (e2e/sql-rows (str "SELECT o.o_orderpriority, sum(CASE WHEN l.l_returnflag <> 'R' THEN l.l_extendedprice * (1 - l.l_discount) ELSE 0 END)"
                                                     "  FROM lineitem l JOIN orders o ON o.o_orderkey = l.l_orderkey"
                                                     " GROUP BY o.o_orderpriority ORDER BY o.o_orderpriority"))
                                  (sort-by first (e2e/breakout-rows (cards "net_revenue") "order_priority"))
                                  tolerance)))
          (testing "the imported cards have result metadata"
            (is (every? (comp seq :result_metadata) (vals cards))))
          (testing "importing again updates the cards instead of duplicating them"
            (let [cards-again (e2e/imported-cards (convert-and-import!))]
              (is (= (m/map-vals :id cards) (m/map-vals :id cards-again)))
              (is (= (m/map-vals (comp set #(map :id %) :dimensions) cards)
                     (m/map-vals (comp set #(map :id %) :dimensions) cards-again)))
              (is (= (count cards)
                     (t2/count :model/Card :collection_id (:collection_id (first (vals cards)))))))))))))
