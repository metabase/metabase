(ns metabase.agent-api.metric-write-test
  "The v2 `metric_write` tool: a card whose query the product constrains to one aggregation, written through
   its own tool because its authoring contract is its own."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- write!
  ([body] (write! :crowberto 200 body))
  ([user status body]
   (mt/user-http-request user :post status "agent/v2/metric-write" body)))

(defn- refusal
  [response]
  (if (string? response) response (str (:message response))))

(defn- db-name []
  (t2/select-one-fn :name :model/Database (mt/id)))

(defn- orders-definition
  "A portable MBQL 5 query against ORDERS, aggregated as a metric must be."
  [& {:keys [aggregation breakout]
      :or   {aggregation [["count" {}]]}}]
  {:lib/type "mbql/query"
   :stages   [(cond-> {:lib/type     "mbql.stage/mbql"
                       :source-table [(db-name) "PUBLIC" "ORDERS"]
                       :aggregation  (vec aggregation)}
                breakout (assoc :breakout (vec breakout)))]})

(defn- orders-field [column]
  ["field" {} [(db-name) "PUBLIC" "ORDERS" column]])

(defn- card [id]
  (t2/select-one :model/Card :id id))

;;; ──────────────────────────────────────────────────────────────────
;;; create
;;; ──────────────────────────────────────────────────────────────────

(deftest creates-a-metric-test
  (mt/with-model-cleanup [:model/Card]
    (let [response (write! {:method "create" :name "Order count" :description "How many orders"
                            :definition (orders-definition)})
          saved    (card (:id response))]
      (is (= "metric" (:type response)))
      (is (= "Order count" (:name response)))
      (testing "a metric is a card, saved through the card path"
        (is (= :metric (:type saved)))
        (is (= :scalar (:display saved)))
        (is (= (mt/id :orders) (get-in saved [:dataset_query :stages 0 :source-table])))))))

(deftest a-metric-trends-by-one-date-grouping-test
  (testing "one aggregation and one date breakout is a metric — that is what makes it trendable"
    (mt/with-model-cleanup [:model/Card]
      (let [response (write! {:method     "create"
                              :name       "Orders per month"
                              :definition (orders-definition
                                           :breakout [["field" {:temporal-unit "month"}
                                                       [(db-name) "PUBLIC" "ORDERS" "CREATED_AT"]]])})]
        (is (= "metric" (:type response)))))))

(deftest a-query-with-two-aggregations-is-not-a-metric-test
  (testing "the refusal says which part of the query to change — a model that is only told \"invalid\" retries
            the same query"
    (let [message (refusal (write! :crowberto 400
                                   {:method     "create"
                                    :name       "Two numbers"
                                    :definition (orders-definition
                                                 :aggregation [["count" {}]
                                                               ["sum" {} (orders-field "TOTAL")]])}))]
      (is (= (str "This query cannot be saved as a metric: a metric has exactly one aggregation (a count, a "
                  "sum, an average) and at most one date grouping. Summarize by one thing, drop the other "
                  "groupings, and save the rest of the query as a question with `question_write`.")
             message)))))

(deftest a-query-with-no-aggregation-is-not-a-metric-test
  (is (re-find #"cannot be saved as a metric"
               (refusal (write! :crowberto 400
                                {:method     "create"
                                 :name       "Rows"
                                 :definition {:lib/type "mbql/query"
                                              :stages   [{:lib/type     "mbql.stage/mbql"
                                                          :source-table [(db-name) "PUBLIC" "ORDERS"]}]}})))))

;;; ──────────────────────────────────────────────────────────────────
;;; The per-method contract
;;; ──────────────────────────────────────────────────────────────────

(deftest create-names-the-fields-it-needs-test
  (is (= "`method: \"create\"` needs `name`, `definition`."
         (refusal (write! :crowberto 400 {:method "create"})))))

(deftest update-without-an-id-names-the-missing-field-test
  (is (= (str "`method: \"update\"` needs `id`. `id` names the one to change — `search` and `get_content` "
              "return it.")
         (refusal (write! :crowberto 400 {:method "update" :name "Renamed"})))))

;;; ──────────────────────────────────────────────────────────────────
;;; update
;;; ──────────────────────────────────────────────────────────────────

(deftest an-update-changes-only-what-it-names-test
  (mt/with-temp [:model/Card {metric-id :id} {:type :metric :name "Before" :description "Kept"}]
    (let [response (write! {:method "update" :id metric-id :name "After"})]
      (is (= "After" (:name response)))
      (is (= "Kept" (:description response))))))

(deftest a-metric-s-definition-is-replaced-and-re-checked-test
  (mt/with-temp [:model/Card {metric-id :id} {:type          :metric
                                              :dataset_query (mt/mbql-query orders {:aggregation [[:count]]})}]
    (testing "a replacement that is not a metric is refused, and the metric keeps its query"
      (is (re-find #"cannot be saved as a metric"
                   (refusal (write! :crowberto 400
                                    {:method     "update"
                                     :id         metric-id
                                     :definition (orders-definition
                                                  :aggregation [["count" {}]
                                                                ["sum" {} (orders-field "TOTAL")]])}))))
      (is (= 1 (count (get-in (card metric-id) [:dataset_query :stages 0 :aggregation])))))
    (testing "and one that is a metric replaces it"
      (write! {:method "update" :id metric-id
               :definition (orders-definition :aggregation [["sum" {} (orders-field "TOTAL")]])})
      (is (= :sum (ffirst (get-in (card metric-id) [:dataset_query :stages 0 :aggregation])))))))

(deftest a-metric-moves-and-archives-through-its-own-write-test
  (mt/with-temp [:model/Collection {collection-id :id} {}
                 :model/Card       {metric-id :id}     {:type :metric}]
    (testing "`collection_id` moves it"
      (is (= collection-id (:collection_id (write! {:method "update" :id metric-id
                                                    :collection_id collection-id})))))
    (testing "`archived: true` trashes it, and `false` restores it"
      (is (true? (:archived (write! {:method "update" :id metric-id :archived true}))))
      (is (false? (:archived (write! {:method "update" :id metric-id :archived false})))))))

(deftest a-question-is-not-a-metric-test
  (mt/with-temp [:model/Card {card-id :id} {:type :question}]
    (is (= (str "Card " card-id " is a question, and this tool writes metric. Change it with `question_write`.")
           (refusal (write! :crowberto 400 {:method "update" :id card-id :name "Renamed"}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Permissions
;;; ──────────────────────────────────────────────────────────────────

(deftest a-collection-the-caller-cannot-write-to-is-refused-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection {collection-id :id} {}]
      (write! :rasta 403 {:method "create" :name "M" :definition (orders-definition)
                          :collection_id collection-id}))))

(deftest a-query-the-caller-cannot-run-cannot-be-saved-test
  (mt/with-no-data-perms-for-all-users!
    (write! :rasta 403 {:method "create" :name "M" :definition (orders-definition)})))
