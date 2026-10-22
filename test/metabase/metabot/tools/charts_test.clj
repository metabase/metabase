(ns metabase.metabot.tools.charts-test
  "Tests that the chart tools always emit a `generated_entity` card data part. The
   inline-vs-navigate decision now lives on the frontend, so the backend no longer
   branches on a capability."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.metabot.tools.charts :as charts]
   [metabase.metabot.tools.charts.create :as create-chart-tools]
   [metabase.metabot.tools.charts.edit :as edit-chart-tools]
   [metabase.metabot.tools.shared :as shared]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

;; create-chart only needs the query present in queries-state; the link builder
;; json-encodes it and `->frontend-query` passes a non-MBQL 5 value through unchanged,
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

(deftest chart-tools-keep-mbql5-temporal-filter-test
  (testing "the generated_entity part carries a during filter through JSON intact (BOT-1972)"
    (let [date  (meta/field-metadata :checkins :date)
          query (-> (lib/query meta/metadata-provider (meta/table-metadata :checkins))
                    (lib/filter [:during {:lib/uuid (str (random-uuid))} (lib/ref date) "2026-07-01" :month]))
          state {:queries {"q-1" query}
                 :charts  {"c-1" {:chart_id               "c-1"
                                  :query_id               "q-1"
                                  :queries                [query]
                                  :visualization_settings {:chart_type :bar}}}}]
      (doseq [[tool-name run-tool] [["create_chart"
                                     #(charts/create-chart-tool {:data_source  {:query_id "q-1"}
                                                                 :viz_settings {:chart_type "bar"}
                                                                 :title        "Check-ins in July"
                                                                 :description  "Check-ins during July 2026."})]
                                    ["edit_chart"
                                     #(charts/edit-chart-tool {:chart_id         "c-1"
                                                               :new_viz_settings {:chart_type "line"}
                                                               :title            "Check-ins in July"
                                                               :description      "Check-ins during July 2026."})]]]
        (testing tool-name
          (let [result (binding [shared/*memory-atom* (atom {:state state})]
                         (run-tool))
                sent   (-> result (get-in [:data-parts 0 :data :query :query]) json/encode (json/decode true))]
            (is (= "mbql/query" (:lib/type sent)))
            (is (= (lib/filters query)
                   (-> sent lib/normalize :stages first :filters)))))))))

(deftest create-chart-new-chart-types-test
  (testing "the tool schema accepts newly added chart types"
    (doseq [chart-type ["treemap" "boxplot"]]
      (let [result (run-create-chart chart-type)]
        (is (= (keyword chart-type) (get-in result [:structured-output :chart-type])))
        (is (= chart-type (get-in result [:data-parts 0 :data :display])))))))

(deftest create-chart-query-keeps-date-filter-through-dataset-api-test
  (testing "POST /api/dataset, where the chart in the conversation sends its query, applies its date filter (BOT-1972)"
    (let [mp   (mt/metadata-provider)
          date (lib.metadata/field mp (mt/id :checkins :date))]
      (doseq [[filter-desc filter-clause]
              {"during"
               [:during {:lib/uuid (str (random-uuid))} (lib/ref date) "2014-07-01" :month]
               "between with absolute-datetime bounds"
               (lib/between date (lib/absolute-datetime "2014-07-01" :day) (lib/absolute-datetime "2014-07-31" :day))}]
        (testing filter-desc
          (let [query  (-> (lib/query mp (lib.metadata/table mp (mt/id :checkins)))
                           (lib/filter filter-clause)
                           (lib/aggregate (lib/count)))
                result (binding [shared/*memory-atom* (atom {:state {:queries {"q-1" query}}})]
                         (charts/create-chart-tool {:data_source  {:query_id "q-1"}
                                                    :viz_settings {:chart_type "scalar"}
                                                    :title        "Check-ins in July 2014"
                                                    :description  "Check-ins during July 2014."}))
                body   (-> result (get-in [:data-parts 0 :data :query :query]) json/encode json/decode)]
            (is (= (mt/first-row (mt/process-query query))
                   (mt/first-row (mt/user-http-request :crowberto :post 202 "dataset" body))))))))))

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

(deftest chart-tools-errors-test
  (testing "a missing query goes back to the agent as output"
    (is (re-find #"^Query not found with ID: q-9"
                 (:output (binding [shared/*memory-atom* (atom {:state {:queries {}}})]
                            (charts/create-chart-tool {:data_source  {:query_id "q-9"}
                                                       :viz_settings {:chart_type "bar"}
                                                       :title        "Orders by month"
                                                       :description  "Monthly count of orders."}))))))
  (testing "an unexpected error propagates to the agent loop"
    (mt/with-dynamic-fn-redefs [create-chart-tools/create-chart (fn [_] (throw (ex-info "boom" {})))
                                edit-chart-tools/edit-chart     (fn [_] (throw (ex-info "boom" {})))]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"boom" (run-create-chart)))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"boom"
                            (charts/edit-chart-tool {:chart_id         "c-1"
                                                     :new_viz_settings {:chart_type "pie"}
                                                     :title            "Orders by month"
                                                     :description      "Monthly count of orders."}))))))
