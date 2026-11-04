(ns metabase.metabot.tools.charts-test
  "Tests that chart tools emit inline results in the NLQ profile and `navigate_to` otherwise."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.metabot.tools.charts :as charts]
   [metabase.metabot.tools.shared :as shared]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

;; create-chart only needs the query present in queries-state; the link builder
;; json-encodes it and `->frontend-query` passes a non-MBQL 5 value through unchanged,
;; so a stub query is enough to exercise the emission branch without a database.
(def ^:private stub-query
  {:database 1 :type "query" :query {:source-table 1}})

(defn- run-create-chart [profile-id]
  (let [memory (atom {:state   {:queries {"q-1" stub-query}}
                      :context {}})]
    (binding [shared/*memory-atom* memory
              shared/*profile-id* profile-id]
      (charts/create-chart-tool {:data_source  {:query_id "q-1"}
                                 :viz_settings {:chart_type "bar"}
                                 :title        "Orders by month"}))))

(deftest create-chart-inline-viz-test
  (testing "emits a single generated_entity card part in the NLQ profile"
    (let [result (run-create-chart :nlq)
          parts  (:data-parts result)
          entity (:data (first parts))]
      (is (= 1 (count parts)))
      (is (= "generated_entity" (:data-type (first parts))))
      (is (= "card" (:type entity)))
      (is (string? (:id entity)))
      (is (= "Orders by month" (:title entity)))
      (is (= "bar" (:display entity)))
      (testing "embeds the query so the FE can run it"
        (is (= "q-1" (get-in entity [:query :id])))
        (is (some? (get-in entity [:query :query]))))
      (testing "keeps the query in structured-output so chart memory stores it for later edits"
        (is (= stub-query (get-in result [:structured-output :query]))))
      (is (not-any? #(= "navigate_to" (:data-type %)) parts))))
  (testing "emits a single navigate_to data part outside the NLQ profile"
    (let [parts (:data-parts (run-create-chart :sql))]
      (is (= 1 (count parts)))
      (is (= "navigate_to" (:data-type (first parts))))
      (is (str/starts-with? (:data (first parts)) "/question#"))
      (is (not-any? #(= "generated_entity" (:data-type %)) parts)))))

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
                                                                 :title        "Check-ins in July"})]
                                    ["edit_chart"
                                     #(charts/edit-chart-tool {:chart_id         "c-1"
                                                               :new_viz_settings {:chart_type "line"}
                                                               :title            "Check-ins in July"})]]]
        (testing tool-name
          (let [result (binding [shared/*memory-atom* (atom {:state state :context {}})
                                 shared/*profile-id*  :nlq]
                         (run-tool))
                sent   (-> result (get-in [:data-parts 0 :data :query :query]) json/encode (json/decode true))]
            (is (= "mbql/query" (:lib/type sent)))
            (is (= (lib/filters query)
                   (-> sent lib/normalize :stages first :filters)))))))))

(deftest create-chart-query-keeps-date-filter-through-dataset-api-test
  (testing "POST /api/dataset, where the chart in the conversation sends its query, applies its date filter (BOT-1972)"
    (let [mp   (mt/metadata-provider)
          date (lib.metadata/field mp (mt/id :checkins :date))]
      ;; `between` with `absolute-datetime` bounds is left out: on this release branch the query processor rejects
      ;; the string literal in `optimize-temporal-filters` before any transport is involved.
      (doseq [[filter-desc filter-clause]
              {"during"
               [:during {:lib/uuid (str (random-uuid))} (lib/ref date) "2014-07-01" :month]}]
        (testing filter-desc
          (let [query  (-> (lib/query mp (lib.metadata/table mp (mt/id :checkins)))
                           (lib/filter filter-clause)
                           (lib/aggregate (lib/count)))
                result (binding [shared/*memory-atom* (atom {:state {:queries {"q-1" query}} :context {}})
                                 shared/*profile-id*  :nlq]
                         (charts/create-chart-tool {:data_source  {:query_id "q-1"}
                                                    :viz_settings {:chart_type "scalar"}
                                                    :title        "Check-ins in July 2014"}))
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
          result (binding [shared/*memory-atom* memory
                           shared/*profile-id* :nlq]
                   (charts/edit-chart-tool {:chart_id         "c-1"
                                            :new_viz_settings {:chart_type "pie"}
                                            :title            "Orders by month"}))
          parts  (:data-parts result)
          entity (:data (first parts))]
      (is (= 1 (count parts)))
      (is (= "generated_entity" (:data-type (first parts))))
      (is (= stub-query (get-in entity [:query :query])))
      (is (= "pie" (:display entity))))))
