(ns metabase.query-processor.referenced-entities-test
  "Tests for running referenced queries and adding their values under `data.referenced_entities`."
  {:clj-kondo/config '{:linters
                       ;; allowing `with-temp` here since this tests the REST API which doesn't use
                       ;; metadata providers. Same exception as [[metabase.query-processor.card-test]].
                       {:discouraged-var {metabase.test/with-temp           {:level :off}
                                          toucan2.tools.with-temp/with-temp {:level :off}}
                        :deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.query-processor.referenced-entities-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.query-processor.referenced-entities :as referenced-entities]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]))

(defn- ref-entity
  "The test HTTP client keywordizes the type key and parses numeric JSON keys back to ints."
  [response entity-type id]
  (get-in response [:data :referenced_entities entity-type id]))

(defn- venues-count-measure
  "A measure definition counting venues; its query returns a single row."
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate (lib/count)))))

(deftest dataset-endpoint-request-referenced-entities-test
  (testing "POST /api/dataset runs the cards named in the request `referenced_entities` and adds their values"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}]
      (let [response (mt/user-http-request
                      :crowberto :post 202 "dataset"
                      (assoc (mt/mbql-query venues {:aggregation [[:count]]})
                             :referenced_entities [{:type "card" :id goal-id :columns ["count"]}]))
            goal     (ref-entity response :card goal-id)]
        (testing "main query still returns normally"
          (is (= "completed" (:status response)))
          (is (= [[100]] (get-in response [:data :rows]))))
        (testing "referenced card value is attached under data.referenced_entities"
          (is (nil? (:error goal)))
          (is (= "completed" (:status goal)))
          (is (= [[1000]] (get-in goal [:data :rows])))
          (is (= ["count"] (map :name (get-in goal [:data :cols])))))))))

(deftest dataset-endpoint-referenced-measure-test
  (testing "a measure is referenced by running its definition, same as a card's dataset_query"
    (mt/with-temp [:model/Measure {measure-id :id} {:name       "Venue count"
                                                    :table_id   (mt/id :venues)
                                                    :definition (venues-count-measure)}]
      (let [response (mt/user-http-request
                      :crowberto :post 202 "dataset"
                      (assoc (mt/mbql-query checkins {:aggregation [[:count]]})
                             :referenced_entities [{:type "measure" :id measure-id}]))
            goal     (ref-entity response :measure measure-id)]
        (is (= "completed" (:status response)))
        (is (= "completed" (:status goal)))
        (is (= [[100]] (get-in goal [:data :rows])))))))

(deftest dataset-endpoint-cards-and-measures-keyed-separately-test
  (testing "a card and a measure sharing an id don't collide in the response"
    (mt/with-temp [:model/Measure {measure-id :id} {:name       "Venue count"
                                                    :table_id   (mt/id :venues)
                                                    :definition (venues-count-measure)}
                   :model/Card    {card-id :id}    {:dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}]
      (let [response (mt/user-http-request
                      :crowberto :post 202 "dataset"
                      (assoc (mt/mbql-query venues {:aggregation [[:count]]})
                             :referenced_entities [{:type "card" :id card-id}
                                                   {:type "measure" :id measure-id}]))]
        (is (= [[1000]] (get-in (ref-entity response :card card-id) [:data :rows])))
        (is (= [[100]] (get-in (ref-entity response :measure measure-id) [:data :rows])))))))

(deftest dataset-endpoint-column-projection-test
  (testing "only the requested columns are returned for a referenced card"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query venues {:limit 1})}]
      (let [response (mt/user-http-request
                      :crowberto :post 202 "dataset"
                      (assoc (mt/mbql-query venues {:aggregation [[:count]]})
                             :referenced_entities [{:type "card" :id goal-id :columns ["NAME" "PRICE"]}]))
            goal     (ref-entity response :card goal-id)]
        (is (= "completed" (:status goal)))
        (is (= ["NAME" "PRICE"] (map :name (get-in goal [:data :cols]))))
        (is (= 1 (count (get-in goal [:data :rows]))))))))

(deftest dataset-endpoint-multi-row-referenced-card-test
  (testing "a referenced card returning more than one row fails softly instead of being truncated"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query venues)}]
      (let [response (mt/user-http-request
                      :crowberto :post 202 "dataset"
                      (assoc (mt/mbql-query venues {:aggregation [[:count]]})
                             :referenced_entities [{:type "card" :id goal-id :columns ["NAME"]}]))
            goal     (ref-entity response :card goal-id)]
        (testing "main query still succeeds"
          (is (= "completed" (:status response)))
          (is (= [[100]] (get-in response [:data :rows]))))
        (is (= "failed" (:status goal)))
        (is (re-find #"more rows than the requested maximum" (:error goal)))))))

(deftest dataset-endpoint-error-handling-test
  (testing "a referenced card that cannot be resolved fails softly without failing the main query"
    (let [response (mt/user-http-request
                    :crowberto :post 202 "dataset"
                    (assoc (mt/mbql-query venues {:aggregation [[:count]]})
                           :referenced_entities [{:type "card" :id Integer/MAX_VALUE :columns ["count"]}]))
          goal     (ref-entity response :card Integer/MAX_VALUE)]
      (testing "main query still succeeds"
        (is (= "completed" (:status response)))
        (is (= [[100]] (get-in response [:data :rows]))))
      (testing "referenced card is marked failed with an error"
        (is (= "failed" (:status goal)))
        (is (string? (:error goal)))))))

(deftest dataset-endpoint-unreadable-card-test
  (testing "a referenced card the caller can't read fails softly without failing the main query"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card       {goal-id :id} {:collection_id coll-id
                                                      :dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}]
        (let [response (mt/user-http-request
                        :rasta :post 202 "dataset"
                        (assoc (mt/mbql-query venues {:aggregation [[:count]]})
                               :referenced_entities [{:type "card" :id goal-id :columns ["count"]}]))
              goal     (ref-entity response :card goal-id)]
          (testing "main query still succeeds"
            (is (= "completed" (:status response)))
            (is (= [[100]] (get-in response [:data :rows]))))
          (testing "referenced card is marked failed"
            (is (= "failed" (:status goal)))
            (is (string? (:error goal)))))))))

(deftest dataset-endpoint-max-rows-test
  (testing "a spec can ask for more than one row"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query venues {:limit 3})}]
      (let [response (mt/user-http-request
                      :crowberto :post 202 "dataset"
                      (assoc (mt/mbql-query venues {:aggregation [[:count]]})
                             :referenced_entities [{:type "card" :id goal-id :columns ["NAME"] :max_rows 3}]))
            goal     (ref-entity response :card goal-id)]
        (is (= "completed" (:status goal)))
        (is (= 3 (count (get-in goal [:data :rows])))))))
  (testing "an entity returning more than the spec asked for still fails"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query venues)}]
      (let [response (mt/user-http-request
                      :crowberto :post 202 "dataset"
                      (assoc (mt/mbql-query venues {:aggregation [[:count]]})
                             :referenced_entities [{:type "card" :id goal-id :columns ["NAME"] :max_rows 3}]))
            goal     (ref-entity response :card goal-id)]
        (is (= "failed" (:status goal)))))))

(deftest dataset-endpoint-max-rows-ceiling-test
  (testing "max_rows above the unaggregated query row limit is a 400"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query venues)}]
      (is (mt/user-http-request
           :crowberto :post 400 "dataset"
           (assoc (mt/mbql-query venues {:aggregation [[:count]]})
                  :referenced_entities [{:type "card" :id goal-id :max_rows 1000000}]))))))

(deftest dataset-endpoint-unknown-entity-type-test
  (testing "an unrecognized entity type is a 400"
    (is (mt/user-http-request
         :crowberto :post 400 "dataset"
         (assoc (mt/mbql-query venues {:aggregation [[:count]]})
                :referenced_entities [{:type "dashboard" :id 1}])))))

(deftest dataset-endpoint-no-referenced-entities-test
  (testing "omitting `referenced_entities` leaves the response untouched"
    (let [response (mt/user-http-request
                    :crowberto :post 202 "dataset"
                    (mt/mbql-query venues {:aggregation [[:count]]}))]
      (is (= "completed" (:status response)))
      (is (nil? (get-in response [:data :referenced_entities]))))))

(deftest ^:parallel referenced-query-info-test
  (let [info #(:info (#'referenced-entities/referenced-query {} %1 %2 1))]
    (testing "a referenced card stamps its id, which is what the warehouse query remark reports"
      (is (= {:context :question, :card-id 7} (info "card" 7))))
    (testing "a measure has no card id to stamp, so it must not borrow the key"
      (is (= {:context :question} (info "measure" 7))))))

(deftest viz-settings->goal-specs-test
  (testing "GoalSource references are extracted from the 3 dynamic-goal viz settings and grouped by entity"
    (testing "a :graph.goal_value GoalSource"
      (is (= [{:type "card" :id 1 :columns ["total"]}]
             (referenced-entities/viz-settings->goal-specs
              {:graph.goal_value {:id 1 :type "card" :column "total"}}))))
    (testing ":gauge.segments and :scalar.segments min/max, grouped + de-duped by entity"
      (is (= {["card" 1]    ["sum" "avg"]
              ["measure" 2] ["total"]}
             (into {} (map (juxt (juxt :type :id) :columns))
                   (referenced-entities/viz-settings->goal-specs
                    {:gauge.segments  [{:min 0 :max {:id 1 :type "card" :column "sum"}}
                                       {:min {:id 1 :type "card" :column "avg"}
                                        :max {:id 1 :type "card" :column "sum"}}]
                     :scalar.segments [{:min {:id 2 :type "measure" :column "total"} :max nil :color "red"}]})))))
    (testing "a card and a measure with the same id stay separate"
      (is (= 2 (count (referenced-entities/viz-settings->goal-specs
                       {:gauge.segments [{:min {:id 1 :type "card" :column "a"}
                                          :max {:id 1 :type "measure" :column "b"}}]})))))
    (testing "static numbers and bare-string self-column references are ignored"
      (is (nil? (referenced-entities/viz-settings->goal-specs
                 {:graph.goal_value 100
                  :gauge.segments   [{:min 0 :max 50}
                                     {:min "self_col" :max 100}]})))))
  (testing "no goal settings at all -> nil"
    (is (nil? (referenced-entities/viz-settings->goal-specs {})))))

(deftest card-endpoint-viz-settings-referenced-entities-test
  (testing "POST /api/card/:id/query derives referenced entities from a :graph.goal_value GoalSource"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}
                   :model/Card {chart-id :id} {:dataset_query          (mt/mbql-query venues {:aggregation [[:count]]})
                                               :visualization_settings {:graph.goal_value {:id     goal-id
                                                                                           :type   "card"
                                                                                           :column "count"}}}]
      (let [response (mt/user-http-request :crowberto :post 202 (format "card/%d/query" chart-id))
            goal     (ref-entity response :card goal-id)]
        (testing "main card query returns normally"
          (is (= "completed" (:status response)))
          (is (= [[100]] (get-in response [:data :rows]))))
        (testing "referenced card value is attached"
          (is (= "completed" (:status goal)))
          (is (= [[1000]] (get-in goal [:data :rows]))))))))

(deftest card-endpoint-no-referenced-entities-test
  (testing "a card with only a static goal value is unaffected"
    (mt/with-temp [:model/Card {chart-id :id} {:dataset_query          (mt/mbql-query venues {:aggregation [[:count]]})
                                               :visualization_settings {:graph.goal_value 100}}]
      (let [response (mt/user-http-request :crowberto :post 202 (format "card/%d/query" chart-id))]
        (is (= "completed" (:status response)))
        (is (nil? (get-in response [:data :referenced_entities])))))))

(deftest dashcard-endpoint-referenced-entities-test
  (testing "POST /api/dashboard/.../dashcard/.../card/.../query reads a GoalSource from the *merged* viz settings"
    (mt/with-temp [:model/Card      {goal-id :id}     {:dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}
                   :model/Card      {chart-id :id}    {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                   :model/Dashboard {dash-id :id}     {}
                   ;; the dynamic goal lives on the DASHCARD's viz settings, exercising the card+dashcard merge
                   :model/DashboardCard {dashcard-id :id} {:dashboard_id            dash-id
                                                           :card_id                 chart-id
                                                           :visualization_settings  {:gauge.segments
                                                                                     [{:min 0
                                                                                       :max {:id     goal-id
                                                                                             :type   "card"
                                                                                             :column "count"}}]}}]
      (let [response (mt/user-http-request :crowberto :post 202
                                           (format "dashboard/%d/dashcard/%d/card/%d/query" dash-id dashcard-id chart-id))
            goal     (ref-entity response :card goal-id)]
        (is (= "completed" (:status response)))
        (is (= "completed" (:status goal)))
        (is (= [[1000]] (get-in goal [:data :rows])))))))

(deftest public-card-endpoint-referenced-entities-test
  (testing "GET /api/public/card/:uuid/query injects referenced_entities (survives the public result whitelist)"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query checkins {:aggregation [[:count]]})}
                     :model/Card {uuid :public_uuid} {:dataset_query           (mt/mbql-query venues {:aggregation [[:count]]})
                                                      :public_uuid             (str (random-uuid))
                                                      :visualization_settings  {:scalar.segments
                                                                                [{:min   {:id     goal-id
                                                                                          :type   "card"
                                                                                          :column "count"}
                                                                                  :max   nil
                                                                                  :color "red"}]}}]
        (let [response (client/client :get 202 (str "public/card/" uuid "/query"))
              goal     (ref-entity response :card goal-id)]
          (is (= "completed" (:status response)))
          (is (= "completed" (:status goal)))
          (is (= [[1000]] (get-in goal [:data :rows]))))))))

(deftest cross-database-referenced-entity-test
  (testing "a referenced card on a different database than the main query still runs"
    ;; the reason referenced queries run before the main query's QP store is bound: a store holds one database,
    ;; so a nested run against a different one would be rejected if it happened any later
    (let [main-query (mt/mbql-query venues {:aggregation [[:count]]})]
      (mt/dataset places-cam-likes
        (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query places {:aggregation [[:count]]})}]
          (let [response (mt/user-http-request
                          :crowberto :post 202 "dataset"
                          (assoc main-query :referenced_entities [{:type "card" :id goal-id}]))
                goal     (ref-entity response :card goal-id)]
            (testing "main query ran against its own database"
              (is (= "completed" (:status response)))
              (is (= [[100]] (get-in response [:data :rows]))))
            (testing "referenced card ran against the other database"
              (is (nil? (:error goal)))
              (is (= "completed" (:status goal)))
              (is (= [[3]] (get-in goal [:data :rows]))))))))))

(deftest card-endpoint-measure-goal-test
  (testing "POST /api/card/:id/query resolves a measure GoalSource from viz settings"
    (mt/with-temp [:model/Measure {measure-id :id} {:name       "Venue count"
                                                    :table_id   (mt/id :venues)
                                                    :definition (venues-count-measure)}
                   :model/Card    {chart-id :id}   {:dataset_query          (mt/mbql-query checkins {:aggregation [[:count]]})
                                                    :visualization_settings {:graph.goal_value {:id     measure-id
                                                                                                :type   "measure"
                                                                                                :column "count"}}}]
      (let [response (mt/user-http-request :crowberto :post 202 (format "card/%d/query" chart-id))
            goal     (ref-entity response :measure measure-id)]
        (is (= "completed" (:status response)))
        (is (= "completed" (:status goal)))
        (is (= [[100]] (get-in goal [:data :rows])))))))

(deftest dataset-endpoint-unreadable-measure-test
  (testing "a referenced measure whose table the caller can't read fails softly without failing the main query"
    ;; measure perms delegate to its table, a different route from the collection perms a card goes through
    (mt/with-temp [:model/Measure {measure-id :id} {:name       "Venue count"
                                                    :table_id   (mt/id :venues)
                                                    :definition (venues-count-measure)}]
      (mt/with-perm-for-group-and-table! (perms/all-users-group) (mt/id :venues) :perms/view-data :blocked
        (let [response (mt/user-http-request
                        :rasta :post 202 "dataset"
                        (assoc (mt/mbql-query checkins {:aggregation [[:count]]})
                               :referenced_entities [{:type "measure" :id measure-id}]))
              goal     (ref-entity response :measure measure-id)]
          (testing "main query, on a table rasta can still read, succeeds"
            (is (= "completed" (:status response))))
          (testing "the measure is marked failed"
            (is (= "failed" (:status goal)))
            (is (string? (:error goal)))))))))

(deftest dataset-endpoint-unknown-column-projection-test
  (testing "a requested column that isn't in the result is dropped rather than erroring"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query venues {:limit 1})}]
      (let [response (mt/user-http-request
                      :crowberto :post 202 "dataset"
                      (assoc (mt/mbql-query venues {:aggregation [[:count]]})
                             :referenced_entities [{:type "card" :id goal-id :columns ["NAME" "NOPE"]}]))
            goal     (ref-entity response :card goal-id)]
        (is (= "completed" (:status goal)))
        (is (= ["NAME"] (map :name (get-in goal [:data :cols]))))))))

(defn- metric-card
  "A `:type :metric` card summing Orders.Total, optionally grouped by month.
  With `breakout?` this is the shape of the shipped \"Revenue\" example metric: an aggregation and a
  temporal breakout both saved in `:dataset_query`."
  [breakout?]
  (let [mp (mt/metadata-provider)]
    {:name          (if breakout? "Revenue by month" "Revenue")
     :type          :metric
     :dataset_query (cond-> (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                                (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :orders :total)))))
                      breakout? (lib/breakout (lib/with-temporal-bucket
                                                (lib.metadata/field mp (mt/id :orders :created_at))
                                                :month)))}))

(defn- reference-card
  "Run a trivial main query referencing card `id`, and return that card's referenced-entity result."
  [id columns]
  (-> (mt/user-http-request :crowberto :post 202 "dataset"
                            (assoc (mt/mbql-query venues {:aggregation [[:count]]})
                                   :referenced_entities [{:type "card" :id id :columns columns}]))
      (ref-entity :card id)))

(deftest dataset-endpoint-referenced-metric-without-breakout-test
  (testing "a metric whose definition is just an aggregation resolves to its single value"
    (mt/with-temp [:model/Card {metric-id :id} (metric-card false)]
      (let [result (reference-card metric-id ["sum"])]
        (is (= "completed" (:status result)))
        (is (= 1 (count (get-in result [:data :rows]))))))))

(deftest dataset-endpoint-referenced-metric-with-breakout-test
  (testing "a metric grouped for display still resolves to one value, the aggregation over everything"
    ;; The shipped "Revenue" example metric saves a quarterly breakout in its :dataset_query, so running it
    ;; verbatim returned a row per quarter and failed the reference.
    (mt/with-temp [:model/Card {metric-id :id} (metric-card true)]
      (let [grouped   (reference-card metric-id ["sum"])
            ungrouped (mt/with-temp [:model/Card {plain-id :id} (metric-card false)]
                        (reference-card plain-id ["sum"]))]
        (is (= "completed" (:status grouped)))
        (is (= 1 (count (get-in grouped [:data :rows]))))
        (testing "and it matches what the same metric without the breakout returns"
          (is (= (get-in ungrouped [:data :rows])
                 (get-in grouped [:data :rows]))))))))

(deftest dataset-endpoint-referenced-plain-card-with-breakout-test
  (testing "a plain question with a breakout still fails: only a metric's grouping is presentation"
    (mt/with-temp [:model/Card {card-id :id} (assoc (metric-card true) :type :question)]
      (let [result (reference-card card-id ["sum"])]
        (is (= "failed" (:status result)))
        (is (re-find #"more rows than the requested maximum" (:error result)))))))
