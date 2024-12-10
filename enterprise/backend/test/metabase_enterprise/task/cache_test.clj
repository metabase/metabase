(ns metabase-enterprise.task.cache-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.task.cache :as task.cache]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.query-processor :as qp]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.dashboard :as qp.dashboard]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(set! *warn-on-reflection* true)

(defn parameterized-native-query
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
    (binding [qp.util/*execute-async?*             false
              task.cache/*run-cache-refresh-async* false]
      (doall (map t2/delete! [:model/Query :model/QueryExecution :model/QueryCache]))
      (mt/with-temp [:model/Card {card-id :id} {:name "Cached card"
                                                :dataset_query (parameterized-native-query)}]
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

          (testing "Running a parmaeterized query again bumps it up in the result list, but base query comes first"
            (run-query-for-card-id card-id params-2)
            (is (= [nil param-val-2 param-val-1] (map param-vals (to-rerun)))))

          (testing "Only base query + *parameterized-queries-to-rerun-per-card* queries are returned"
            (binding [task.cache/*parameterized-queries-to-rerun-per-card* 1]
              (is (= [nil param-val-2] (map param-vals (to-rerun)))))))))))

(deftest duration-queries-to-rerun-test
  (testing "We refresh expired :duration caches for queries that were run at least once in the last caching duration"
    (binding [qp.util/*execute-async?*             false
              task.cache/*run-cache-refresh-async* false]
      (doall (map t2/delete! [:model/Query :model/QueryExecution :model/QueryCache]))
      (mt/with-temp [:model/Card {card-id :id} {:name "Cached card"
                                                :dataset_query (parameterized-native-query)}
                     :model/CacheConfig _ {:model "question"
                                           :model_id card-id
                                           :strategy :duration
                                           :refresh_automatically true
                                           :config {:unit "hours" :duration 1}}]
        (let [param-val-1 "2024-12-02"
              params-1    [{:type  :text
                            :target [:variable [:template-tag "date"]]
                            :value param-val-1}]
              to-rerun    @#'task.cache/duration-queries-to-rerun
              param-vals  #(-> % :query :parameters first :value)]
          ;; Starting state: no cache entries exist, and nothing can be rerun
          (is (= nil (t2/select-one :model/QueryCache)))
          (is (= [] (to-rerun)))

          ;; After running the nonparameterized query once, a cache entry is created but not rerunnable yet
          (is (= [[1000]] (mt/rows (run-query-for-card-id card-id []))))
          (is (= 1 (t2/count :model/QueryCache)))
          (is (=? [] (to-rerun)))

          ;; Manually 'expire' the cache entry. Now the query is detected as rerunnable!
          (let [cache (t2/select-one :model/QueryCache)]
            (t2/update! :model/QueryCache :query_hash (:query_hash cache)
                        (update cache :updated_at #(t/minus % (t/hours 3)))))
          (is (=? [{:card-id card-id}] (to-rerun)))

          ;; Run a parameterized query. A new cache entry is created but not rerunnable.
          (is (= [[0]] (mt/rows (run-query-for-card-id card-id params-1))))
          (is (= 2 (t2/count :model/QueryCache)))
          ;; We can rerun the base query with no params, but not the parmaeterized query
          (is (=? [nil] (map param-vals (to-rerun))))

          ;; Manually 'expire' the cache entry for the parameterized query. The cache entry is still not rerunnable,
          ;; because we only rerun parameterized queries if they've had a *cache hit* within the most recent caching
          ;; period.
          (let [cache (t2/select-one :model/QueryCache {:order-by [[:updated_at :desc]]})]
            (t2/update! :model/QueryCache :query_hash (:query_hash cache)
                        (update cache :updated_at #(t/minus % (t/hours 3)))))
          (is (=? [nil] (map param-vals (to-rerun))))

          ;; Run the parameterized query twice: once to refresh the cache, then again to generate a cache hit.
          (is (= [[0]] (mt/rows (run-query-for-card-id card-id params-1))))
          (is (= [[0]] (mt/rows (run-query-for-card-id card-id params-1))))
          ;; Manually 'expire' the cache entry again. Now the cache entry is rerunnable!
          (let [cache (t2/select-one :model/QueryCache {:order-by [[:updated_at :desc]]})]
            (t2/update! :model/QueryCache :query_hash (:query_hash cache)
                        (update cache :updated_at #(t/minus % (t/hours 3)))))
          (is (=? [nil param-val-1] (map param-vals (to-rerun)))))))))

(deftest refresh-schedule-cache-card-e2e-test
  (mt/with-premium-features #{:cache-granular-controls :cache-preemptive}
    (testing "Do we successfully execute a refresh query for a :schedule cache config on a card?"
      (binding [qp.util/*execute-async?*             false
                task.cache/*run-cache-refresh-async* false]
        (t2/delete! :model/QueryCache)
        (mt/with-temp [:model/Card {card-id :id} {:name "Cached card"
                                                  :dataset_query (parameterized-native-query)}
                       :model/CacheConfig cc {:model "question"
                                              :model_id card-id
                                              :strategy :schedule
                                              :refresh_automatically true
                                              :next_run_at nil
                                              :config {:schedule "0 0 * * * ?"}}]
          ;; Run card once to populate cache
          (is (= [[1000]] (mt/rows (run-query-for-card-id card-id []))))
          (let [cache-timestamp-1 (t2/select-one-fn :updated_at :model/QueryCache)]
            (t2/update! :model/CacheConfig (:id cc) (assoc cc :next_run_at nil))
            (@#'task.cache/refresh-cache-configs!)
            (let [cache-timestamp-2 (t2/select-one-fn :updated_at :model/QueryCache)]
              (is (t/before? cache-timestamp-1 cache-timestamp-2)))))))))

(deftest refresh-schedule-cache-dashboard-e2e-test
  (mt/with-premium-features #{:cache-granular-controls :cache-preemptive}
    (testing "Do we successfully execute a refresh query for a :schedule cache config on a dashboard?"
      (binding [qp.util/*execute-async?*             false
                task.cache/*run-cache-refresh-async* false]
        (t2/delete! :model/QueryCache)
        (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                       :model/Card {card-id :id} {:name "Cached card"
                                                  :dataset_query (parameterized-native-query)}
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
              (is (t/before? cache-timestamp-1 cache-timestamp-2)))))))))

(deftest refresh-duration-cache-card-e2e-test
  (mt/with-premium-features #{:cache-granular-controls :cache-preemptive}
    (testing "Do we successfully execute a refresh query for a :duration cache config on a card?"
      (binding [qp.util/*execute-async?*             false
                task.cache/*run-cache-refresh-async* false]
        (doall (map t2/delete! [:model/Query :model/QueryExecution :model/QueryCache]))
        (mt/with-temp [:model/Card {card-id :id} {:name "Cached card"
                                                  :dataset_query (parameterized-native-query)}
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
              (is (t/before? cache-timestamp-1 cache-timestamp-2)))))))))

(deftest refresh-duration-cache-dashboard-e2e-test
  (mt/with-premium-features #{:cache-granular-controls :cache-preemptive}
    (testing "Do we successfully execute a refresh query for a :duration cache config on a dashboard?"
      (binding [qp.util/*execute-async?* false
                task.cache/*run-cache-refresh-async* false]
        (doall (map t2/delete! [:model/Query :model/QueryExecution :model/QueryCache]))
        (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                       :model/Card {card-id :id} {:name "Cached card"
                                                  :dataset_query (parameterized-native-query)}
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
              (is (t/before? cache-timestamp-1 cache-timestamp-2)))))))))

(deftest cache-preemptive-feature-flag-test
  (testing "Sanity check that we are correctly enforcing the :cache-preemptive feature flags"
    (mt/with-temp [:model/Card {card-id :id} {:name "Cached card"
                                              :dataset_query (parameterized-native-query)}
                   :model/CacheConfig cc {:model "question"
                                          :model_id card-id
                                          :strategy :schedule
                                          :refresh_automatically true
                                          :config {:schedule "0 0 * * * ?"}}]
      (let [call-count (atom 0)]
        (mt/with-dynamic-redefs [task.cache/refresh-schedule-cache! (fn [_] (swap! call-count inc))
                                 task.cache/maybe-refresh-duration-caches! (fn [] (swap! call-count inc))]
          (@#'task.cache/refresh-cache-configs!)
          (is (= 0 @call-count))

          (mt/with-additional-premium-features #{:cache-preemptive}
            (t2/update! :model/CacheConfig (:id cc) (assoc cc :next_run_at nil))
            (is (true? (premium-features/enable-preemptive-caching?)))
            (@#'task.cache/refresh-cache-configs!)
            (is (= 2 @call-count))))))))
