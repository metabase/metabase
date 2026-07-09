(ns metabase.query-processor.referenced-cards-test
  "Tests for the THROW-AWAY dynamic-goals backend (GDGT-2789): running referenced queries and adding
  their values under `data.referenced_cards`."
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.referenced-cards :as referenced-cards]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]))

(defn- ref-cards
  "Pull the `referenced_cards` map out of an API query response. The test HTTP client parses numeric
  JSON keys back into numbers, so this map is keyed by the (integer) card id."
  [response]
  (get-in response [:data :referenced_cards]))

(deftest dataset-endpoint-request-referenced-cards-test
  (testing "POST /api/dataset runs the cards named in the request `referenced_cards` and adds their values"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}]
      (let [response (mt/user-http-request
                      :crowberto :post 202 "dataset"
                      (assoc (mt/mbql-query venues {:aggregation [[:count]]})
                             :referenced_cards [{:card_id goal-id :columns ["count"]}]))
            goal     (get (ref-cards response) goal-id)]
        (testing "main query still returns normally"
          (is (= "completed" (:status response)))
          (is (= [[100]] (get-in response [:data :rows]))))
        (testing "referenced card value is attached under data.referenced_cards"
          (is (nil? (:error goal)))
          (is (= "completed" (:status goal)))
          (is (= [[1000]] (get-in goal [:data :rows])))
          (is (= ["count"] (map :name (get-in goal [:data :cols])))))))))

(deftest dataset-endpoint-column-projection-test
  (testing "only the requested columns are returned for a referenced card"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query venues)}]
      (let [response (mt/user-http-request
                      :crowberto :post 202 "dataset"
                      (assoc (mt/mbql-query venues {:aggregation [[:count]]})
                             :referenced_cards [{:card_id goal-id :columns ["NAME" "PRICE"]}]))
            goal     (get (ref-cards response) goal-id)]
        (is (= "completed" (:status goal)))
        (is (= ["NAME" "PRICE"] (map :name (get-in goal [:data :cols]))))
        (testing "capped to a single row"
          (is (= 1 (count (get-in goal [:data :rows])))))))))

(deftest dataset-endpoint-error-handling-test
  (testing "a referenced card that cannot be resolved fails softly without failing the main query"
    (let [response (mt/user-http-request
                    :crowberto :post 202 "dataset"
                    (assoc (mt/mbql-query venues {:aggregation [[:count]]})
                           :referenced_cards [{:card_id Integer/MAX_VALUE :columns ["count"]}]))
          goal     (get (ref-cards response) Integer/MAX_VALUE)]
      (testing "main query still succeeds"
        (is (= "completed" (:status response)))
        (is (= [[100]] (get-in response [:data :rows]))))
      (testing "referenced card is marked failed with an error"
        (is (= "failed" (:status goal)))
        (is (string? (:error goal)))))))

(deftest dataset-endpoint-no-referenced-cards-test
  (testing "omitting `referenced_cards` leaves the response untouched"
    (let [response (mt/user-http-request
                    :crowberto :post 202 "dataset"
                    (mt/mbql-query venues {:aggregation [[:count]]}))]
      (is (= "completed" (:status response)))
      (is (nil? (get-in response [:data :referenced_cards]))))))

(deftest viz-settings->specs-test
  (testing "GoalSource references are extracted from the 3 dynamic-goal viz settings and grouped by card"
    (testing "a :graph.goal_value GoalSource"
      (is (= [{:card_id 1 :columns ["total"]}]
             (referenced-cards/viz-settings->specs {:graph.goal_value {:card_id 1 :column "total"}}))))
    (testing ":gauge.segments and :scalar.segments min/max, grouped + de-duped by card"
      (is (= {1 ["sum" "avg"]
              2 ["total"]}
             (into {} (map (juxt :card_id :columns))
                   (referenced-cards/viz-settings->specs
                    {:gauge.segments  [{:min 0 :max {:card_id 1 :column "sum"}}
                                       {:min {:card_id 1 :column "avg"} :max {:card_id 1 :column "sum"}}]
                     :scalar.segments [{:min {:card_id 2 :column "total"} :max nil :color "red"}]})))))
    (testing "static numbers and bare-string self-column references are ignored"
      (is (nil? (referenced-cards/viz-settings->specs
                 {:graph.goal_value 100
                  :gauge.segments   [{:min 0 :max 50}
                                     {:min "self_col" :max 100}]})))))
  (testing "no goal settings at all -> nil"
    (is (nil? (referenced-cards/viz-settings->specs {})))))

(deftest card-endpoint-viz-settings-referenced-cards-test
  (testing "POST /api/card/:id/query derives referenced cards from a :graph.goal_value GoalSource"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}
                   :model/Card {chart-id :id} {:dataset_query          (mt/mbql-query venues {:aggregation [[:count]]})
                                               :visualization_settings {:graph.goal_value {:card_id goal-id
                                                                                           :column  "count"}}}]
      (let [response (mt/user-http-request :crowberto :post 202 (format "card/%d/query" chart-id))
            goal     (get (ref-cards response) goal-id)]
        (testing "main card query returns normally"
          (is (= "completed" (:status response)))
          (is (= [[100]] (get-in response [:data :rows]))))
        (testing "referenced card value is attached"
          (is (= "completed" (:status goal)))
          (is (= [[1000]] (get-in goal [:data :rows]))))))))

(deftest card-endpoint-no-referenced-cards-test
  (testing "a card with only a static goal value is unaffected"
    (mt/with-temp [:model/Card {chart-id :id} {:dataset_query          (mt/mbql-query venues {:aggregation [[:count]]})
                                               :visualization_settings {:graph.goal_value 100}}]
      (let [response (mt/user-http-request :crowberto :post 202 (format "card/%d/query" chart-id))]
        (is (= "completed" (:status response)))
        (is (nil? (get-in response [:data :referenced_cards])))))))

(deftest dashcard-endpoint-referenced-cards-test
  (testing "POST /api/dashboard/.../dashcard/.../card/.../query reads a GoalSource from the *merged* viz settings"
    (mt/with-temp [:model/Card      {goal-id :id}     {:dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}
                   :model/Card      {chart-id :id}    {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                   :model/Dashboard {dash-id :id}     {}
                   ;; the dynamic goal lives on the DASHCARD's viz settings — exercises the card+dashcard merge
                   :model/DashboardCard {dashcard-id :id} {:dashboard_id            dash-id
                                                           :card_id                 chart-id
                                                           :visualization_settings  {:gauge.segments
                                                                                     [{:min 0
                                                                                       :max {:card_id goal-id
                                                                                             :column  "count"}}]}}]
      (let [response (mt/user-http-request :crowberto :post 202
                                           (format "dashboard/%d/dashcard/%d/card/%d/query" dash-id dashcard-id chart-id))
            goal     (get (ref-cards response) goal-id)]
        (is (= "completed" (:status response)))
        (is (= "completed" (:status goal)))
        (is (= [[1000]] (get-in goal [:data :rows])))))))

(deftest public-card-endpoint-referenced-cards-test
  (testing "GET /api/public/card/:uuid/query injects referenced_cards (survives the public result whitelist)"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}
                     :model/Card {uuid :public_uuid} {:dataset_query           (mt/mbql-query venues {:aggregation [[:count]]})
                                                      :public_uuid             (str (random-uuid))
                                                      :visualization_settings  {:scalar.segments
                                                                                [{:min   {:card_id goal-id
                                                                                          :column  "count"}
                                                                                  :max   nil
                                                                                  :color "red"}]}}]
        (let [response (client/client :get 202 (str "public/card/" uuid "/query"))
              goal     (get (ref-cards response) goal-id)]
          (is (= "completed" (:status response)))
          (is (= "completed" (:status goal)))
          (is (= [[1000]] (get-in goal [:data :rows]))))))))
