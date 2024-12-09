(ns metabase-enterprise.task.cache-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.task.cache :as task.cache]
   [metabase.query-processor :as qp]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.dashboard :as qp.dashboard]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [toucan2.tools.disallow :as t2.disallow]))

(set! *warn-on-reflection* true)

(defn field-filter-query
  "A native query with an optional template tag"
  []
  {:database (mt/id)
   :type     :native
   :native   {:template-tags {"date" {:name         "date"
                                      :display-name "Check-In Date"
                                      :type         :text}}
              :query "SELECT count(*) FROM CHECKINS [[WHERE date = {{date}}]]"}})

(defn run-query-for-card-id
  [card-id params]
  (mt/as-admin
    (qp.card/process-query-for-card
     card-id :api
     :parameters params
     :make-run (constantly
                (fn [query info]
                  (qp/process-query (qp/userland-query (assoc query :info info))))))))

(defn run-query-for-dashcard
  [card-id dashboard-id dashcard-id]
  (mt/as-admin
    (qp.dashboard/process-query-for-dashcard
     :card-id card-id
     :dashboard-id dashboard-id
     :dashcard-id dashcard-id
     :make-run (constantly
                (fn [query info]
                  (qp/process-query (qp/userland-query (assoc query :info info))))))))

(deftest scheduled-queries-to-rerun-test
  (testing "Given a card, we rerun a limited number of variations of the card's query"
    (binding [qp.util/*execute-async?* false]
      (t2/delete! :model/QueryExecution)
      (mt/with-temp [:model/Card {card-id :id} {:name "Cached card"
                                                :dataset_query (field-filter-query)}]
        (let [param-val-1 "2024-12-01"
              params-1    [{:type  :text
                            :target [:variable [:template-tag "date"]]
                            :value param-val-1}]
              param-val-2 "2024-12-02"
              params-2    [{:type  :text
                            :target [:variable [:template-tag "date"]]
                            :value param-val-2}]
              to-rerun    #(@#'task.cache/scheduled-queries-to-rerun card-id (t/minus (t/offset-date-time) (t/minutes 10)))
              param-vals  #(-> % :parameters first :value)]
          ;; Sanity check that the query actually runs
          (is (= [[1000]] (mt/rows (run-query-for-card-id card-id []))))
          (is (= 1 (count (to-rerun))))

          (run-query-for-card-id card-id params-1)
          (is (= [nil param-val-1] (map param-vals (to-rerun))))

          (run-query-for-card-id card-id params-2)
          (is (= [nil param-val-1 param-val-2] (map param-vals (to-rerun))))

          (testing "Running a query again bumps it up in the result list"
            (run-query-for-card-id card-id params-2)
            (is (= [param-val-2 nil param-val-1] (map param-vals (to-rerun)))))

          (testing "Only *parameterized-queries-to-rerun-per-card* queries are returned"
            (binding [task.cache/*parameterized-queries-to-rerun-per-card* 2]
              (is (= [param-val-2 nil] (map param-vals (to-rerun)))))))))))

(deftest duration-queries-to-rerun-test
  (testing "We refresh expired :duration caches for queries that were run at least once in the last caching duration"
    (binding [qp.util/*execute-async?* false]
      (doall (map t2/delete! [:model/Query :model/QueryExecution :model/QueryCache]))
      (mt/with-temp [:model/Card {card-id :id} {:name "Cached card"
                                                :dataset_query (field-filter-query)}
                     :model/CacheConfig _ {:model "question"
                                           :model_id card-id
                                           :strategy :duration
                                           :refresh_automatically true
                                           :config {:unit "hours" :duration 1}}]
        (let [to-rerun @#'task.cache/duration-queries-to-rerun]
          ;; Starting state: no cache entries exist, and nothing can be rerun
          (is (= nil (t2/select-one :model/QueryCache)))
          (is (= [] (to-rerun)))

          ;; After running the nonparameterized query once, a cache entry is created, but nothing is rerunnable.
          (is (= [[1000]] (mt/rows (run-query-for-card-id card-id []))))
          (is (= 1 (t2/count :model/QueryCache)))
          (is (= [] (to-rerun)))

          ;; Run the query again, then manually 'expire' the cache entry. Now the query is detected as rerunnable!
          (is (= [[1000]] (mt/rows (run-query-for-card-id card-id []))))
          (let [cache (t2/select-one :model/QueryCache)]
            (t2/update! :model/QueryCache (update cache :updated_at #(t/minus % (t/hours 3)))))
          (t2/select :model/QueryExecution)
          (is (=? [{:card-id card-id}] (to-rerun)))

          ;; Manually 'expire' the QueryExecution record. Now nothing can be rerun, since we only run queries that had
          ;; at least one cache hit within the last caching period.
          (try
            (underive :model/QueryExecution ::t2.disallow/update)
            (let [qe (t2/select-one :model/QueryExecution)]
              (t2/update! :model/QueryExecution (-> qe
                                                    (update :started_at #(t/minus % (t/hours 3)))
                                                    (dissoc :id :row_count))))
            (is (= [] (to-rerun)))
            (finally
              (derive :model/QueryExecution ::t2.disallow/update))))))))

(deftest refresh-schedule-cache-card-e2e-test
  (testing "Do we successfully execute a refresh query for a :schedule cache config on a card?"
    (binding [qp.util/*execute-async?*             false
              task.cache/*run-cache-refresh-async* false]
      (t2/delete! :model/QueryCache)
      (mt/with-temp [:model/Card {card-id :id} {:name "Cached card"
                                                :dataset_query (field-filter-query)}
                     :model/CacheConfig _ {:model "question"
                                           :model_id card-id
                                           :strategy :schedule
                                           :refresh_automatically true
                                           :next_run_at (t/minus (t/offset-date-time) (t/minutes 5))
                                           :config {:schedule "0 0 * * * ?"}}]
        ;; Run card once to populate cache
        (is (= [[1000]] (mt/rows (run-query-for-card-id card-id []))))
        (let [cache-timestamp-1 (t2/select-one-fn :updated_at :model/QueryCache)]
          (@#'task.cache/refresh-cache-configs!)
          (let [cache-timestamp-2 (t2/select-one-fn :updated_at :model/QueryCache)]
            (is (t/before? cache-timestamp-1 cache-timestamp-2))))))))

(deftest refresh-schedule-cache-dashboard-e2e-test
  (testing "Do we successfully execute a refresh query for a :schedule cache config on a dashboard?"
    (binding [qp.util/*execute-async?*             false
              task.cache/*run-cache-refresh-async* false]
      (t2/delete! :model/QueryCache)
      (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                     :model/Card {card-id :id} {:name "Cached card"
                                                :dataset_query (field-filter-query)}
                     :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id
                                                             :card_id      card-id}
                     :model/CacheConfig _ {:model "dashboard"
                                           :model_id dashboard-id
                                           :strategy :schedule
                                           :refresh_automatically true
                                           :next_run_at (t/minus (t/offset-date-time) (t/minutes 5))
                                           :config {:schedule "0 0 * * * ?"}}]
        ;; Run card once to populate cache
        (is (= [[1000]] (mt/rows (run-query-for-dashcard card-id dashboard-id dashcard-id))))

        (let [cache-timestamp-1 (t2/select-one-fn :updated_at :model/QueryCache)]
          (@#'task.cache/refresh-cache-configs!)
          (let [cache-timestamp-2 (t2/select-one-fn :updated_at :model/QueryCache)]
            (is (t/before? cache-timestamp-1 cache-timestamp-2))))))))

(deftest refresh-duration-cache-card-e2e-test
  (testing "Do we successfully execute a refresh query for a :duration cache config on a card?"
    (binding [qp.util/*execute-async?*             false
              task.cache/*run-cache-refresh-async* false]
      (doall (map t2/delete! [:model/Query :model/QueryExecution :model/QueryCache]))
      (mt/with-temp [:model/Card {card-id :id} {:name "Cached card"
                                                :dataset_query (field-filter-query)}
                     :model/CacheConfig _ {:model "question"
                                           :model_id card-id
                                           :strategy :duration
                                           :refresh_automatically true
                                           :config {:unit "hours" :duration 1}}]
        ;; Run card once to populate cache
        (is (= [[1000]] (mt/rows (run-query-for-card-id card-id []))))
        ;; Run again to register a cache hit
        (is (= [[1000]] (mt/rows (run-query-for-card-id card-id []))))
        (let [cache-timestamp-1 (t2/select-one-fn :updated_at :model/QueryCache)]
          ;; Manually expire the existing cache entry
          (t2/update! :model/QueryCache (update (t2/select-one :model/QueryCache)
                                                :updated_at #(t/minus % (t/hours 2))))
          (@#'task.cache/refresh-cache-configs!)
          (let [cache-timestamp-2 (t2/select-one-fn :updated_at :model/QueryCache)]
            (is (t/before? cache-timestamp-1 cache-timestamp-2))))))))

(deftest refresh-duration-cache-dashboard-e2e-test
  (testing "Do we successfully execute a refresh query for a :duration cache config on a dashboard?"
    (binding [qp.util/*execute-async?* false
              task.cache/*run-cache-refresh-async* false]
      (doall (map t2/delete! [:model/Query :model/QueryExecution :model/QueryCache]))
      (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                     :model/Card {card-id :id} {:name "Cached card"
                                                :dataset_query (field-filter-query)}
                     :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id
                                                             :card_id      card-id}
                     :model/CacheConfig _ {:model "dashboard"
                                           :model_id dashboard-id
                                           :strategy :duration
                                           :refresh_automatically true
                                           :config {:unit "hours" :duration 1}}]
        ;; Run dashboard card once to populate cache
        (is (= [[1000]] (mt/rows (run-query-for-dashcard card-id dashboard-id dashcard-id))))
        ;; Run again to register a cache hit
        (is (= [[1000]] (mt/rows (run-query-for-dashcard card-id dashboard-id dashcard-id))))
        (let [cache-timestamp-1 (t2/select-one-fn :updated_at :model/QueryCache)]
          ;; Manually expire the existing cache entry
          (t2/update! :model/QueryCache (update (t2/select-one :model/QueryCache)
                                                :updated_at #(t/minus % (t/hours 2))))
          (@#'task.cache/refresh-cache-configs!)
          (let [cache-timestamp-2 (t2/select-one-fn :updated_at :model/QueryCache)]
            (is (t/before? cache-timestamp-1 cache-timestamp-2))))))))
