(ns metabase.metabot.tools.charts-test
  "Tests that the chart tools always emit a `generated_entity` card data part. The
   inline-vs-navigate decision now lives on the frontend, so the backend no longer
   branches on a capability."
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.tools.charts :as charts]
   [metabase.metabot.tools.shared :as shared]))

;; create-chart only needs the query present in queries-state; the link builder
;; json-encodes it and `->legacy-mbql` passes a non-pMBQL value through unchanged,
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

(deftest create-chart-treemap-test
  (testing "the tool schema accepts treemap as a chart type"
    (let [result (run-create-chart "treemap")]
      (is (= :treemap (get-in result [:structured-output :chart-type])))
      (is (= "treemap" (get-in result [:data-parts 0 :data :display]))))))

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
      (is (= "pie" (:display entity))))))
