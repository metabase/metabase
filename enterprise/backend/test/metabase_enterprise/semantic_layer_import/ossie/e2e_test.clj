(ns metabase-enterprise.semantic-layer-import.ossie.e2e-test
  "The Ossie source's output imported into a real instance, which the unit tests cannot check: that the YAML imports,
  the field refs bind to the names Postgres stores for Snowflake's upper-case ones, the metrics run and return the
  numbers a hand-written SQL query does over TPC-H, the curated dimensions break a metric out through the
  relationship's implicit join, and that importing again updates the cards instead of duplicating them.

  The warehouse is TPC-H at scale factor 0.001 loaded as a test dataset (`tpch_sf0_001.edn`, see
  [[metabase-enterprise.semantic-layer-import.ossie.test-util.tpch]]), on Postgres only: the model's
  `SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.LINEITEM` is mapped onto it with the config, and the Postgres driver folds the
  model's unquoted names to the lower case the dataset is loaded in; H2 would upper-case them. The model's
  `net_revenue` at this scale is pinned too, next to the number the TPC-H quickstart documents at scale factor 1,
  which the dataset generator checks against the same formula; a fixture at that scale, six million order lines, is
  out of the question here."
  (:require
   [clojure.edn :as edn]
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase-enterprise.semantic-layer-import.core :as semantic-layer-import]
   [metabase-enterprise.semantic-layer-import.ossie.test-util :as tu]
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
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private net-revenue-at-small-scale
  "The model's `net_revenue` over the dataset, as the generator computed it with DuckDB when it wrote the dataset."
  110433357.0881M)

(defn- tpch-dataset
  "TPC-H at scale factor 0.001 as a test dataset definition: the database the converted metrics run against."
  []
  (tx/dataset-definition "ossie-tpch"
                         (edn/read-string {:readers {'t u.date/parse}} (slurp tu/tpch-dataset))))

(defn- convert-and-import!
  "Convert the fixture document for the current test database, check the result against the instance and import it,
  the way the README says to. Returns the converter's report, with what the preflight check reported under
  `:preflight`."
  []
  (mt/with-temp-dir [out-dir nil]
    (let [report    (semantic-layer-import/convert! {:type    :ossie
                                                     :raw     tu/tpch-document
                                                     :out-dir out-dir
                                                     :config  {:databases      {"SNOWFLAKE_SAMPLE_DATA" (:name (mt/db))}
                                                               :driver         :postgres
                                                               :schema-mapping {"TPCH_SF1" "public"}
                                                               :creator-email  (:email (mt/fetch-user :crowberto))}})
          preflight (semantic-layer-import/preflight {:out-dir out-dir})]
      (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
        (serdes.load/load-metabase! (serdes.ingest/ingest-yaml out-dir)))
      (assoc report :preflight preflight))))

(defn- warehouse-row-counts
  "How many Databases, Tables and Fields the app DB has: what an import that could not bind a reference adds to."
  []
  {:databases (t2/count :model/Database)
   :tables    (t2/count :model/Table)
   :fields    (t2/count :model/Field)})

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
  "Numbers from two queries that should agree, allowing for float summation order."
  [expected actual]
  (and (number? expected)
       (number? actual)
       (< (abs (- (double expected) (double actual))) 1e-4)))

(def ^:private net-revenue-sql
  "SELECT sum(CASE WHEN l_returnflag <> 'R' THEN l_extendedprice * (1 - l_discount) ELSE 0 END) FROM lineitem")

(def ^:private hand-written-sql
  "For each converted metric, the SQL a person would write for the same number over the TPC-H tables."
  {"net_revenue"         net-revenue-sql
   "gross_revenue"       "SELECT sum(l_extendedprice) FROM lineitem"
   "order_count"         "SELECT count(DISTINCT o_orderkey) FROM orders"
   "average_order_value" (str "SELECT sum(CASE WHEN l_returnflag <> 'R' THEN l_extendedprice * (1 - l_discount) ELSE 0 END)"
                              "     / count(DISTINCT l_orderkey) FROM lineitem")})

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
    (mt/dataset (tpch-dataset)
      (mt/with-model-cleanup [:model/Card :model/Collection]
        ;; the dataset's database is created on first use: create it before counting what the import adds
        (let [_      (mt/db)
              before (warehouse-row-counts)
              report (convert-and-import!)
              cards  (imported-cards report)]
          (testing "the preflight check binds every reference against the synced tables"
            (is (= [] (:preflight report))))
          (testing "the import made up no Database, Table or Field for a reference it could not bind"
            (is (= before (warehouse-row-counts))))
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
                    :let [expected (ffirst (sql-rows sql))
                          actual   (metric-value (cards metric-name))]]
              (is (=approx expected actual)
                  (format "%s: SQL says %s, the metric says %s" metric-name expected actual))))
          (testing "net_revenue is the number the generator computed over the same data"
            (is (=approx net-revenue-at-small-scale (metric-value (cards "net_revenue")))))
          (testing "the curated dimensions were imported with the cards"
            (is (= #{"l_orderkey" "l_linenumber" "l_partkey" "return_flag" "ship_date"
                     "o_orderkey" "o_custkey" "order_date" "order_priority"}
                   (set (map :name (:dimensions (cards "net_revenue"))))))
            (is (every? (comp seq :dimension_mappings) (vals cards))))
          (testing "a metric breaks out by its own dimension"
            (is (rows=approx (sql-rows (str "SELECT l_returnflag, sum(CASE WHEN l_returnflag <> 'R' THEN l_extendedprice * (1 - l_discount) ELSE 0 END)"
                                            "  FROM lineitem GROUP BY l_returnflag ORDER BY l_returnflag"))
                             (sort-by first (breakout-rows (cards "net_revenue") "return_flag")))))
          (testing "a metric breaks out by a dimension of the joined dataset, through the relationship's implicit join"
            (is (rows=approx (sql-rows (str "SELECT o.o_orderpriority, sum(CASE WHEN l.l_returnflag <> 'R' THEN l.l_extendedprice * (1 - l.l_discount) ELSE 0 END)"
                                            "  FROM lineitem l JOIN orders o ON o.o_orderkey = l.l_orderkey"
                                            " GROUP BY o.o_orderpriority ORDER BY o.o_orderpriority"))
                             (sort-by first (breakout-rows (cards "net_revenue") "order_priority")))))
          (testing "the imported cards have result metadata"
            (is (every? (comp seq :result_metadata) (vals cards))))
          (testing "importing again updates the cards instead of duplicating them"
            (let [cards-again (imported-cards (convert-and-import!))]
              (is (= (m/map-vals :id cards) (m/map-vals :id cards-again)))
              (is (= (m/map-vals (comp set #(map :id %) :dimensions) cards)
                     (m/map-vals (comp set #(map :id %) :dimensions) cards-again)))
              (is (= (count cards)
                     (t2/count :model/Card :collection_id (:collection_id (first (vals cards)))))))))))))
