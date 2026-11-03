(ns metabase-enterprise.semantic-layer-import.test-util.e2e
  "What the end-to-end tests of every source share (see [[metabase-enterprise.semantic-layer-import.dbt.e2e-test]] and
  [[metabase-enterprise.semantic-layer-import.ossie.e2e-test]]): loading a checked-in dataset definition, converting
  and importing a fixture into the test instance, reading the imported cards back, running a metric on its own and
  broken out by one of its curated dimensions, and comparing the numbers with a hand-written SQL query's."
  (:require
   [clojure.edn :as edn]
   [medley.core :as m]
   [metabase-enterprise.semantic-layer-import.core :as semantic-layer-import]
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

(defn dataset-definition
  "The test dataset definition named `dataset-name` read from the EDN at `filename`, written by
  [[metabase-enterprise.semantic-layer-import.test-util.regenerate/edn-dataset]]."
  [dataset-name filename]
  (tx/dataset-definition dataset-name (edn/read-string {:readers {'t u.date/parse}} (slurp filename))))

(defn convert-and-import!
  "Convert a fixture with `convert-args`, the arguments of [[semantic-layer-import/convert!]] but for `:out-dir`, check
  the result against the instance and import it, the way the READMEs say to. Returns the converter's report, with what
  the preflight check reported under `:preflight`."
  [convert-args]
  (mt/with-temp-dir [out-dir nil]
    (let [report    (semantic-layer-import/convert! (assoc convert-args :out-dir out-dir))
          preflight (semantic-layer-import/preflight {:out-dir out-dir})]
      (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
        (serdes.load/load-metabase! (serdes.ingest/ingest-yaml out-dir)))
      (assoc report :preflight preflight))))

(defn warehouse-row-counts
  "How many Databases, Tables and Fields the app DB has: what an import that could not bind a reference adds to."
  []
  {:databases (t2/count :model/Database)
   :tables    (t2/count :model/Table)
   :fields    (t2/count :model/Field)})

(defn imported-cards
  "The imported Card for each converted metric of `report`, by metric name."
  [report]
  (into {}
        (map (fn [{metric-name :name, :keys [entity-id]}]
               [metric-name (t2/select-one :model/Card :entity_id entity-id)]))
        (:converted report)))

(defn metric-value
  "What the imported metric `card` returns when a fresh query aggregates by it: a scalar."
  [card]
  (let [mp (lib-be/application-database-metadata-provider (mt/id))]
    (ffirst (mt/rows (qp/process-query (lib/query mp (lib.metadata/metric mp (:id card))))))))

(defn sql-rows
  "The rows the hand-written SQL query `sql` over the test database returns."
  [sql]
  (mt/rows (qp/process-query (mt/native-query {:query sql}))))

(defn approx=
  "Whether `expected` and `actual`, numbers from two queries that should agree, do, allowing for float summation order
  within `tolerance` (default one millionth)."
  ([expected actual]
   (approx= expected actual 1e-6))
  ([expected actual tolerance]
   (and (number? expected)
        (number? actual)
        (< (abs (- (double expected) (double actual))) tolerance))))

(defn breakout-rows
  "The imported metric `card` broken out by its curated dimension named `dimension-name`, the way the metric UI does
  it: through the metric's definition, the dimension projected, planned into one MBQL query and run. Throws when the
  metric has no projectable dimension of that name, or the plan is not one query."
  [card dimension-name]
  (let [mp         (lib-metric/metadata-provider)
        metric     (first (lib.metadata.protocols/metadatas mp {:lib/type :metadata/metric, :id #{(:id card)}}))
        definition (lib-metric/from-metric-metadata mp metric)
        dimension  (or (m/find-first #(= dimension-name (:name %)) (lib-metric/projectable-dimensions definition))
                       (throw (ex-info (str "no projectable dimension " dimension-name)
                                       {:dimensions (map :name (lib-metric/projectable-dimensions definition))})))
        plan       (lib-metric/->query-plan (lib-metric/project-dimension definition dimension))]
    (when-not (= :leaf (:plan/type plan))
      (throw (ex-info "the breakout did not plan into one query" {:plan plan})))
    (mt/rows (qp/process-query (:plan/mbql plan)))))

(defn rows-approx=
  "Whether `expected` and `actual`, the rows of a breakout from two queries, agree: the same keys in the same order,
  and values within `tolerance` (default [[approx=]]'s)."
  ([expected actual]
   (rows-approx= expected actual 1e-6))
  ([expected actual tolerance]
   (and (= (count expected) (count actual))
        (every? (fn [[[expected-key expected-value] [actual-key actual-value]]]
                  (and (= (str expected-key) (str actual-key))
                       (approx= expected-value actual-value tolerance)))
                (map vector expected actual)))))
