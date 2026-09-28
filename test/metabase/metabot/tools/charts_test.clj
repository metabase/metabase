(ns metabase.metabot.tools.charts-test
  "Tests that the chart tools always emit a `generated_entity` card data part. The
   inline-vs-navigate decision now lives on the frontend, so the backend no longer
   branches on a capability."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.metabot.tools.charts :as charts]
   [metabase.metabot.tools.shared :as shared]
   [metabase.util.json :as json]))

(deftest ^:parallel generated-chart-temporal-filter-test
  (testing "the generated visualization retains both predicates after JSON serialization (#79629)"
    (let [query (lib/normalize
                 {:lib/type :mbql/query
                  :database 1
                  :stages [{:lib/type :mbql.stage/mbql
                            :source-card 1
                            :aggregation [[:count {}]]
                            :filters [[:and {}
                                       [:= {} [:field {:base-type :type/Boolean} "is_included"] true]
                                       [:during {} [:field {:base-type :type/Date} "probe_date"]
                                        "2026-07-01" :month]]]}]})
          result (binding [shared/*memory-atom* (atom {:state {:queries {"q-1" query}}})]
                   (charts/create-chart-tool {:data_source {:query_id "q-1"}
                                              :viz_settings {:chart_type "scalar"}
                                              :title "Included rows in July"
                                              :description "Count of included rows during July 2026."}))
          decoded (-> (get-in result [:data-parts 0 :data :query :query])
                      json/encode json/decode+kw lib.convert/js-legacy-query->mbql5)]
      (is (= (:query (lib/->legacy-MBQL query))
             (:query (lib/->legacy-MBQL decoded)))))))

;; create-chart only needs the query present in queries-state; the link builder
;; json-encodes it and `->legacy-mbql` passes a non-MBQL 5 value through unchanged,
;; so a stub query is enough to exercise the emission branch without a database.
(def ^:private stub-query
  {:database 1 :type "query" :query {:source-table 1}})

(defn- run-create-chart
  ([]
   (run-create-chart "bar"))
  ([chart-type]
   (let [memory (atom {:state {:queries {"q-1" stub-query}}})]
     (binding [shared/*memory-atom* memory]
       (charts/create-chart-tool {:data_source  {:query_id "q-1"}
                                  :viz_settings {:chart_type chart-type}
                                  :title        "Orders by month"
                                  :description  "Monthly count of orders."})))))

(deftest create-chart-generated-entity-test
  (testing "emits a single generated_entity card part"
    (let [result (run-create-chart)
          parts  (:data-parts result)
          entity (:data (first parts))]
      (is (= 1 (count parts)))
      (is (= "generated_entity" (:data-type (first parts))))
      (is (= "card" (:type entity)))
      (is (string? (:id entity)))
      (is (= "Orders by month" (:title entity)))
      (is (= "Monthly count of orders." (:description entity)))
      (is (= "bar" (:display entity)))
      (testing "embeds the query so the FE can run it"
        (is (= "q-1" (get-in entity [:query :id])))
        (is (some? (get-in entity [:query :query]))))
      (testing "keeps the query in structured-output so chart memory stores it for later edits"
        (is (= stub-query (get-in result [:structured-output :query])))))))

(deftest create-chart-new-chart-types-test
  (testing "the tool schema accepts newly added chart types"
    (doseq [chart-type ["treemap" "boxplot"]]
      (let [result (run-create-chart chart-type)]
        (is (= (keyword chart-type) (get-in result [:structured-output :chart-type])))
        (is (= chart-type (get-in result [:data-parts 0 :data :display])))))))

(deftest edit-chart-query-fallback-test
  (testing "edit_chart resolves the query from queries-state when chart memory has no query"
    (let [memory (atom {:state   {:queries {"q-1" stub-query}
                                  :charts  {"c-1" {:chart_id "c-1"
                                                   :query_id "q-1"
                                                   :queries  [nil]
                                                   :visualization_settings {:chart_type :bar}}}}
                        :context {}})
          result (binding [shared/*memory-atom* memory]
                   (charts/edit-chart-tool {:chart_id         "c-1"
                                            :new_viz_settings {:chart_type "pie"}
                                            :title            "Orders by month"
                                            :description      "Monthly count of orders."}))
          parts  (:data-parts result)
          entity (:data (first parts))]
      (is (= 1 (count parts)))
      (is (= "generated_entity" (:data-type (first parts))))
      (is (= stub-query (get-in entity [:query :query])))
      (is (= "pie" (:display entity)))
      (testing "structured-output also carries the resolved query, not just data-parts"
        ;; Regression: edit-chart-tool's :query var (used for data-parts above) came
        ;; from queries-state, but edit-chart's :result — which becomes
        ;; structured-output and is what extract-charts stores into :charts state —
        ;; only looked at the chart's own (here empty) :queries, landing on nil.
        (is (= {:query-id "q-1" :query stub-query}
               (select-keys (:structured-output result) [:query-id :query])))))))
