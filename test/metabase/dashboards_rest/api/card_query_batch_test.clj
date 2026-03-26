(ns metabase.dashboards-rest.api.card-query-batch-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.query-processor.dashboard-batch :as qp.dashboard-batch]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as test.client]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users :db :web-server))

;;; ------------------------------------------------- Helpers --------------------------------------------------

(defn- parse-ndjson
  "Parse an NDJSON string into a sequence of decoded maps."
  [^String body]
  (into []
        (comp (map str/trim)
              (remove str/blank?)
              (map #(json/decode+kw %)))
        (str/split-lines body)))

(defn- batch-url [dashboard-id]
  (format "dashboard/%d/card-query-batch" dashboard-id))

(defn- batch-request
  "Make a batch card query request. Returns parsed NDJSON lines.
   Uses `with-redefs` to bypass the test client's `parse-response`, which calls `json/decode`
   on the NDJSON body and silently parses only the first line, discarding the rest."
  ([dashboard-id]
   (batch-request dashboard-id {}))
  ([dashboard-id body]
   (with-redefs [test.client/parse-response identity]
     (parse-ndjson
      (mt/user-http-request :rasta :post 202 (batch-url dashboard-id)
                            (merge {:parameters []} body))))))

(defn- card-results
  "Filter batch response to just card-result messages."
  [lines]
  (filter #(= "card-result" (:type %)) lines))

(defn- card-errors
  "Filter batch response to just card-error messages."
  [lines]
  (filter #(= "card-error" (:type %)) lines))

(defn- completion-message
  "Get the completion sentinel from batch response."
  [lines]
  (first (filter #(= "complete" (:type %)) lines)))

;;; -------------------------------------------------- Tests --------------------------------------------------

(deftest basic-batch-query-test
  (testing "POST /api/dashboard/:id/card-query-batch"
    (mt/dataset test-data
      (mt/with-temp [:model/Card          {card-1-id :id} {:database_id   (mt/id)
                                                           :table_id      (mt/id :orders)
                                                           :dataset_query (mt/mbql-query orders {:limit 5})}
                     :model/Card          {card-2-id :id} {:database_id   (mt/id)
                                                           :table_id      (mt/id :people)
                                                           :dataset_query (mt/mbql-query people {:limit 5})}
                     :model/Dashboard     {dash-id :id}   {}
                     :model/DashboardCard {dc-1-id :id}   {:dashboard_id dash-id :card_id card-1-id}
                     :model/DashboardCard {dc-2-id :id}   {:dashboard_id dash-id :card_id card-2-id}]
        (testing "returns results for all cards"
          (let [lines (batch-request dash-id)]
            (is (= 2 (count (card-results lines))))
            (is (= 0 (count (card-errors lines))))
            (is (= {:type "complete" :total 2 :succeeded 2 :failed 0}
                   (completion-message lines)))))

        (testing "with explicit cards list"
          (let [lines (batch-request dash-id {:cards [{:dashcard_id dc-1-id :card_id card-1-id}]})]
            (is (= 1 (count (card-results lines))))
            (is (= {:type "complete" :total 1 :succeeded 1 :failed 0}
                   (completion-message lines)))))

        (testing "card results contain expected data shape"
          (let [lines   (batch-request dash-id {:cards [{:dashcard_id dc-1-id :card_id card-1-id}]})
                result  (first (card-results lines))]
            (is (= dc-1-id (:dashcard_id result)))
            (is (= card-1-id (:card_id result)))
            (is (= "completed" (get-in result [:result :status])))
            (is (= 5 (get-in result [:result :row_count])))))))))

(deftest batch-query-omit-cards-runs-all-test
  (testing "omitting cards param runs all non-virtual dashcards"
    (mt/dataset test-data
      (mt/with-temp [:model/Card          {c1 :id} {:database_id (mt/id) :dataset_query (mt/mbql-query orders {:limit 1})}
                     :model/Card          {c2 :id} {:database_id (mt/id) :dataset_query (mt/mbql-query people {:limit 1})}
                     :model/Card          {c3 :id} {:database_id (mt/id) :dataset_query (mt/mbql-query products {:limit 1})}
                     :model/Dashboard     {d :id}  {}
                     :model/DashboardCard _        {:dashboard_id d :card_id c1}
                     :model/DashboardCard _        {:dashboard_id d :card_id c2}
                     :model/DashboardCard _        {:dashboard_id d :card_id c3}]
        (let [lines (batch-request d)]
          (is (= 3 (count (card-results lines))))
          (is (= {:type "complete" :total 3 :succeeded 3 :failed 0}
                 (completion-message lines))))))))

(deftest batch-query-invalid-card-test
  (testing "card not in dashboard returns card-error"
    (mt/dataset test-data
      (mt/with-temp [:model/Card          {c1 :id}  {:database_id (mt/id) :dataset_query (mt/mbql-query orders {:limit 1})}
                     :model/Card          {c2 :id}  {:database_id (mt/id) :dataset_query (mt/mbql-query people {:limit 1})}
                     :model/Dashboard     {d :id}   {}
                     :model/DashboardCard {dc :id}  {:dashboard_id d :card_id c1}]
        (testing "wrong card_id for a valid dashcard"
          (let [lines (batch-request d {:cards [{:dashcard_id dc :card_id c2}]})]
            (is (= 1 (count (card-errors lines))))
            (is (= 404 (get-in (first (card-errors lines)) [:error :status])))
            (is (= {:type "complete" :total 1 :succeeded 0 :failed 1}
                   (completion-message lines)))))

        (testing "mix of valid and invalid"
          (let [lines (batch-request d {:cards [{:dashcard_id dc :card_id c1}
                                                {:dashcard_id dc :card_id c2}]})]
            (is (= 1 (count (card-results lines))))
            (is (= 1 (count (card-errors lines))))
            (is (= {:type "complete" :total 2 :succeeded 1 :failed 1}
                   (completion-message lines)))))))))

(deftest batch-query-permissions-test
  (testing "dashboard read permission required"
    (mt/dataset test-data
      (mt/with-temp [:model/Collection    {coll-id :id} {}
                     :model/Card          {c :id}  {:database_id (mt/id) :dataset_query (mt/mbql-query orders {:limit 1})}
                     :model/Dashboard     {d :id}  {:collection_id coll-id}
                     :model/DashboardCard _        {:dashboard_id d :card_id c}]
        (perms/revoke-collection-permissions! (perms-group/all-users) coll-id)
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403 (batch-url d)
                                     {:parameters []}))))))

  (testing "blocked view-data permission results in card-error per card"
    (mt/dataset test-data
      (mt/with-temp [:model/Card          {c :id}  {:database_id (mt/id) :dataset_query (mt/mbql-query orders {:limit 1})}
                     :model/Dashboard     {d :id}  {}
                     :model/DashboardCard {dc :id} {:dashboard_id d :card_id c}]
        (mt/with-no-data-perms-for-all-users!
          (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :blocked)
          (let [lines (batch-request d {:cards [{:dashcard_id dc :card_id c}]})]
            (is (= 1 (count (card-errors lines))))
            (is (= 403 (get-in (first (card-errors lines)) [:error :status])))
            (is (= {:type "complete" :total 1 :succeeded 0 :failed 1}
                   (completion-message lines)))))))))

(deftest batch-query-nonexistent-dashboard-test
  (testing "404 for nonexistent dashboard"
    (is (= "Not found."
           (mt/user-http-request :rasta :post 404 (batch-url Integer/MAX_VALUE)
                                 {:parameters []})))))

(deftest batch-query-with-parameters-test
  (testing "parameters are applied to card queries"
    (mt/dataset test-data
      (mt/with-temp [:model/Card          {card-id :id} {:database_id   (mt/id)
                                                         :table_id      (mt/id :venues)
                                                         :dataset_query (mt/mbql-query venues)}
                     :model/Dashboard     {dash-id :id} {:parameters [{:name "Price"
                                                                       :slug "price"
                                                                       :id   "_PRICE_"
                                                                       :type "category"}]}
                     :model/DashboardCard {dc-id :id}   {:dashboard_id       dash-id
                                                         :card_id            card-id
                                                         :parameter_mappings [{:parameter_id "_PRICE_"
                                                                               :card_id      card-id
                                                                               :target       [:dimension (mt/$ids venues $price)]}]}]
        (testing "without filter — all rows"
          (let [lines      (batch-request dash-id)
                row-count  (get-in (first (card-results lines)) [:result :row_count])]
            (is (= 100 row-count))))

        (testing "with price=4 filter — fewer rows"
          (let [lines      (batch-request dash-id {:parameters [{:id "_PRICE_" :value 4}]})
                row-count  (get-in (first (card-results lines)) [:result :row_count])]
            (is (= 6 row-count))))))))

(deftest batch-query-serial-thread-pool-test
  (testing "batch queries work with :serial thread pool (single-threaded)"
    (mt/dataset test-data
      (mt/with-temp [:model/Card          {c1 :id} {:database_id (mt/id) :dataset_query (mt/mbql-query orders {:limit 1})}
                     :model/Card          {c2 :id} {:database_id (mt/id) :dataset_query (mt/mbql-query people {:limit 1})}
                     :model/Dashboard     {d :id}  {}
                     :model/DashboardCard _        {:dashboard_id d :card_id c1}
                     :model/DashboardCard _        {:dashboard_id d :card_id c2}]
        (binding [qp.dashboard-batch/*thread-pool* :serial]
          (let [lines (batch-request d)]
            (is (= 2 (count (card-results lines))))
            (is (= {:type "complete" :total 2 :succeeded 2 :failed 0}
                   (completion-message lines)))))))))

(deftest batch-query-reduces-db-calls-test
  (testing "batch endpoint uses fewer appdb calls than N individual requests"
    (mt/dataset test-data
      (mt/with-temp [:model/Card          {c1 :id} {:database_id (mt/id) :dataset_query (mt/mbql-query orders {:limit 1})}
                     :model/Card          {c2 :id} {:database_id (mt/id) :dataset_query (mt/mbql-query people {:limit 1})}
                     :model/Card          {c3 :id} {:database_id (mt/id) :dataset_query (mt/mbql-query products {:limit 1})}
                     :model/Dashboard     {d :id}  {}
                     :model/DashboardCard {dc1 :id} {:dashboard_id d :card_id c1}
                     :model/DashboardCard {dc2 :id} {:dashboard_id d :card_id c2}
                     :model/DashboardCard {dc3 :id} {:dashboard_id d :card_id c3}]
        ;; Run serial so all DB calls are on the calling thread and counted by t2/with-call-count
        (binding [qp.dashboard-batch/*thread-pool* :serial]
          (let [per-card-total (let [counts (atom 0)]
                                 (doseq [[dc-id card-id] [[dc1 c1] [dc2 c2] [dc3 c3]]]
                                   (t2/with-call-count [call-count]
                                     (mt/user-http-request :rasta :post 202
                                                           (format "dashboard/%d/dashcard/%d/card/%d/query" d dc-id card-id))
                                     (swap! counts + (call-count))))
                                 @counts)
                batch-total    (t2/with-call-count [call-count]
                                 (batch-request d)
                                 (call-count))]
            (testing (format "per-card: %d DB calls, batch: %d DB calls" per-card-total batch-total)
              (is (< batch-total per-card-total)
                  "batch endpoint should use fewer DB calls than individual card queries")
              ;; With batch-fetch, request-scoped caching (permissions, routing, cache strategy),
              ;; and pre-warmed metadata providers, 3 cards on the same DB should stay under 80
              ;; AppDB calls. Bump this ceiling if legitimate new queries are added.
              (is (<= batch-total 80)
                  (format "batch call count regression: expected ≤80, got %d" batch-total)))))))))

(deftest batch-query-scaling-test
  (testing "batch endpoint's per-card marginal cost is lower than individual requests"
    (mt/dataset test-data
      (mt/with-temp [:model/Card          {c1 :id} {:database_id (mt/id) :dataset_query (mt/mbql-query orders {:limit 1})}
                     :model/Card          {c2 :id} {:database_id (mt/id) :dataset_query (mt/mbql-query people {:limit 1})}
                     :model/Card          {c3 :id} {:database_id (mt/id) :dataset_query (mt/mbql-query products {:limit 1})}
                     :model/Card          {c4 :id} {:database_id (mt/id) :dataset_query (mt/mbql-query reviews {:limit 1})}
                     :model/Card          {c5 :id} {:database_id (mt/id) :dataset_query (mt/mbql-query orders {:limit 2})}
                     :model/Dashboard     {d :id}  {}
                     :model/DashboardCard _        {:dashboard_id d :card_id c1}
                     :model/DashboardCard _        {:dashboard_id d :card_id c2}
                     :model/DashboardCard _        {:dashboard_id d :card_id c3}
                     :model/DashboardCard _        {:dashboard_id d :card_id c4}
                     :model/DashboardCard _        {:dashboard_id d :card_id c5}]
        (binding [qp.dashboard-batch/*thread-pool* :serial]
          (let [batch-3 (t2/with-call-count [call-count]
                          (batch-request d {:cards (take 3 (map (fn [dc] {:dashcard_id (:id dc) :card_id (:card_id dc)})
                                                                (t2/select [:model/DashboardCard :id :card_id]
                                                                           :dashboard_id d
                                                                           {:order-by [[:id :asc]]
                                                                            :limit    3})))})
                          (call-count))
                batch-5 (t2/with-call-count [call-count]
                          (batch-request d)
                          (call-count))
                marginal-cost (/ (- batch-5 batch-3) 2.0)]
            (testing (format "3-card batch: %d, 5-card batch: %d, marginal: %.1f per card"
                             batch-3 batch-5 marginal-cost)
              ;; The marginal cost of each additional card in batch mode should be significantly
              ;; lower than the ~55 queries/card cost of individual requests.
              ;; With cache-strategy caching and deferred view-log, marginal cost is ~7/card.
              (is (< marginal-cost 15)
                  (format "marginal per-card cost too high: %.1f" marginal-cost)))))))))
