(ns metabase.metabot.tools.charts-test
  "Tests that chart tools emit inline results in the NLQ profile and `navigate_to` otherwise."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.tools.charts :as charts]
   [metabase.metabot.tools.shared :as shared]))

;; create-chart only needs the query present in queries-state; the link builder
;; json-encodes it and `->legacy-mbql` passes a non-pMBQL value through unchanged,
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
