(ns metabase-enterprise.cache.task.refresh-cache-configs-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.cache.task.refresh-cache-configs :as task.cache]
   [metabase.premium-features.core :as premium-features]
   [metabase.query-processor :as qp]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(set! *warn-on-reflection* true)

(defn- parameterized-native-query
  "A native query with an optional template tag"
  []
  {:database (mt/id)
   :type     :native
   :native   {:template-tags {"date" {:name         "date"
                                      :display-name "Check-In Date"
                                      :type         :text}}
              :query "SELECT count(*) FROM CHECKINS [[WHERE date = {{date}}]]"}})

(defn run-query-for-card-id
  [card-id parameters]
  (mt/as-admin
    (qp.card/process-query-for-card
     card-id :api
     :parameters parameters
     :make-run (constantly
                (fn [query info]
                  (qp/process-query (qp/userland-query (assoc query :info info))))))))

(defn run-query-for-dashcard
  [card-id dashboard-id dashcard-id parameters]
  (mt/as-admin
    (qp.card/process-query-for-card
     card-id :api
     :dashboard-id dashboard-id
     :dashcard-id dashcard-id
     :parameters parameters
     :make-run (constantly
                (fn [query info]
                  (qp/process-query (qp/userland-query (assoc query :info info))))))))

(defn- most-recent-cache-entry
  []
  (t2/select-one :model/QueryCache {:order-by [[:updated_at :desc]] :limit 1}))

(defn- delete-cache-entry!
  [entry]
  (t2/delete! :model/QueryCache :query_hash (:query_hash entry)))

(defn- expire-cache-entry!
  "Manually expire a cache entry by setting its updated_at back by 24 hours"
  [cache-entry]
  (t2/update! :model/QueryCache :query_hash (:query_hash cache-entry)
              (update cache-entry :updated_at #(t/minus % (t/days 1)))))

(defn- expire-most-recent-cache-entry!
  []
  (expire-cache-entry! (most-recent-cache-entry)))

(defn- query-execution-defaults
  [query]
  {:hash          (qp.util/query-hash query)
   :cache_hash    (qp.util/query-hash query)
   :running_time  1
   :result_rows   1
   :native        false
   :is_sandboxed  false
   :executor_id   nil
   :card_id       nil
   :dashboard_id  nil
   :context       :ad-hoc
   :parameterized false
   :started_at    (t/offset-date-time)})

(deftest schedule-cache-config->card-ids-test
  (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Dashboard"}
                 :model/Card {card-id-1 :id} {:name "Cached card 1"
                                              :dataset_query {:database 1}}
                 :model/Card {card-id-2 :id} {:name "Cached card 2"
                                              :dataset_query {:database 1}}
                 :model/DashboardCard {} {:dashboard_id dashboard-id
                                          :card_id      card-id-1}
                 :model/DashboardCard {} {:dashboard_id dashboard-id
                                          :card_id      card-id-2}
                 :model/DashboardCard {} {:dashboard_id dashboard-id
                                          :card_id      card-id-2}
                 :model/DashboardCard {} {:dashboard_id dashboard-id
                                          :card_id      card-id-2}]
    (testing "Returns the card ID directly for a question cache config"
      (is (= [card-id-1] (@#'task.cache/schedule-cache-config->card-ids {:model_id card-id-1 :model "question"}))))

    (testing "Fetches card IDs associated with a dashboard cache config"
      (is (= [card-id-1 card-id-2] (@#'task.cache/schedule-cache-config->card-ids {:model_id dashboard-id :model "dashboard"}))))))

(deftest scheduled-queries-to-rerun-test
  (mt/with-premium-features #{:cache-granular-controls :cache-preemptive}
    (testing "Given a card, we rerun a limited number of variations of the card's query"
      (binding [qp.util/*execute-async?*             false
                task.cache/*run-cache-refresh-async* false]
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

            (testing "Running a parameterized query again bumps it up in the result list, but base query comes first"
              (run-query-for-card-id card-id params-2)
              (is (= [nil param-val-2 param-val-1] (map param-vals (to-rerun)))))

            (testing "Only base query + *parameterized-queries-to-rerun-per-card* queries are returned"
              (binding [task.cache/*parameterized-queries-to-rerun-per-card* 1]
                (is (= [nil param-val-2] (map param-vals (to-rerun))))))))))))

(deftest scheduled-base-query-to-rerun-edge-cases-test
  (let [query {:database 1}]
    (mt/with-temp [:model/Card {card-id :id} {:name "Cached card"
                                              :dataset_query query}
                   :model/Query {} {:query_hash (qp.util/query-hash query)
                                    :average_execution_time 1
                                    :query {}}]
      (testing "Happy path: we find the query and card ID for a query to rerun"
        (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query) {:card_id card-id})]
          (is (= [{:query {} :card-id card-id}]
                 (t2/select :model/Query (@#'task.cache/scheduled-base-query-to-rerun-honeysql card-id))))))

      (testing "We don't rerun a query execution older than 30 days"
        (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query)
                                                       {:started_at (t/minus (t/offset-date-time) (t/days 31))})]
          (is (= [] (t2/select :model/Query (@#'task.cache/scheduled-base-query-to-rerun-honeysql card-id))))))

      (testing "We don't rerun a cache refresh query execution"
        (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query) {:context :cache-refresh})]
          (is (= [] (t2/select :model/Query (@#'task.cache/scheduled-base-query-to-rerun-honeysql card-id))))))

      (testing "We don't rerun an errored query execution"
        (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query) {:error "Error"})]
          (is (= [] (t2/select :model/Query (@#'task.cache/scheduled-base-query-to-rerun-honeysql card-id))))))

      (testing "We don't rerun a sandboxed query execution"
        (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query) {:is_sandboxed true})]
          (is (= [] (t2/select :model/Query (@#'task.cache/scheduled-base-query-to-rerun-honeysql card-id))))))

      (testing "We don't rerun a parameterized query execution"
        (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query) {:parameterized true})]
          (is (= [] (t2/select :model/Query (@#'task.cache/scheduled-base-query-to-rerun-honeysql card-id)))))))))

(deftest scheduled-parameterized-queries-to-rerun-edge-cases-test
  (let [query {:database 1}]
    (mt/with-temp [:model/Card {card-id :id} {:name "Cached card"
                                              :dataset_query query}
                   :model/Query {} {:query_hash (qp.util/query-hash query)
                                    :average_execution_time 1
                                    :query {}}]
      (let [rerun-cutoff (t/minus (t/offset-date-time) (t/days 7))]
        (testing "Happy path: we find the query and card ID for a parameterized query to rerun"
          (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query)
                                                         {:card_id card-id
                                                          :parameterized true
                                                          :started_at (t/plus rerun-cutoff (t/days 1))})]
            (is (= [{:query {} :card-id card-id}]
                   (t2/select :model/Query (@#'task.cache/scheduled-parameterized-queries-to-rerun-honeysql
                                            card-id
                                            rerun-cutoff))))))

        (testing "We don't rerun a query execution older than the provided cutoff"
          (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query)
                                                         {:card_id card-id
                                                          :parameterized true
                                                          :started_at (t/minus rerun-cutoff (t/days 1))})]
            (is (= [] (t2/select :model/Query (@#'task.cache/scheduled-parameterized-queries-to-rerun-honeysql
                                               card-id
                                               rerun-cutoff))))))

        (testing "We don't rerun a cache refresh query execution"
          (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query)
                                                         {:card_id card-id
                                                          :parameterized true
                                                          :started_at (t/minus rerun-cutoff (t/days 1))
                                                          :context :cache-refresh})]
            (is (= [] (t2/select :model/Query (@#'task.cache/scheduled-parameterized-queries-to-rerun-honeysql
                                               card-id
                                               rerun-cutoff))))))

        (testing "We don't rerun an errored query execution"
          (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query)
                                                         {:card_id card-id
                                                          :parameterized true
                                                          :started_at (t/minus rerun-cutoff (t/days 1))
                                                          :error "Error"})]
            (is (= [] (t2/select :model/Query (@#'task.cache/scheduled-parameterized-queries-to-rerun-honeysql
                                               card-id
                                               rerun-cutoff))))))

        (testing "We don't rerun a sandboxed query execution"
          (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query)
                                                         {:card_id card-id
                                                          :parameterized true
                                                          :started_at (t/minus rerun-cutoff (t/days 1))
                                                          :is_sandboxed true})]
            (is (= [] (t2/select :model/Query (@#'task.cache/scheduled-parameterized-queries-to-rerun-honeysql
                                               card-id
                                               rerun-cutoff))))))

        (testing "We don't rerun a non-parameterized query execution"
          (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query)
                                                         {:card_id card-id
                                                          :parameterized false
                                                          :started_at (t/minus rerun-cutoff (t/days 1))})]
            (is (= [] (t2/select :model/Query (@#'task.cache/scheduled-parameterized-queries-to-rerun-honeysql
                                               card-id
                                               rerun-cutoff))))))))))

(deftest duration-queries-to-rerun-test
  (mt/with-premium-features #{:cache-granular-controls :cache-preemptive}
    (testing "We refresh expired :duration caches for queries that were run at least once in the last caching duration"
      (binding [qp.util/*execute-async?*             false
                task.cache/*run-cache-refresh-async* false]
        (mt/with-temp [:model/Card {card-id :id} {:name "Cached card"
                                                  :dataset_query (parameterized-native-query)}
                       :model/CacheConfig _ {:model "question"
                                             :model_id card-id
                                             :strategy :duration
                                             :refresh_automatically true
                                             :config {:unit "hours" :duration 1}}]
          (let [param-val-1 "2024-12-01"
                params-1    [{:type  :text
                              :target [:variable [:template-tag "date"]]
                              :value param-val-1}]
                param-val-2 "2024-12-02"
                params-2    [{:type  :text
                              :target [:variable [:template-tag "date"]]
                              :value param-val-2}]
                to-rerun    (fn [card-id]
                              (let [queries (@#'task.cache/duration-queries-to-rerun)]
                                (filter #(= (:card-id %) card-id) queries)))
                param-vals  #(-> % :query :parameters first :value)]
            ;; Starting state: no cache entries exist for the query, so nothing to rerun
            (is (= [] (to-rerun card-id)))

            ;; After running the nonparameterized query once, a cache entry is created but not rerunnable yet
            (is (= [[1000]] (mt/rows (run-query-for-card-id card-id []))))
            (is (=? [] (to-rerun card-id)))

            ;; Manually 'expire' the cache entry. Now the query is detected as rerunnable!
            (expire-most-recent-cache-entry!)
            (is (=? [{:card-id card-id}] (to-rerun card-id)))

            ;; Run a parameterized query. A new cache entry is created but not rerunnable yet.
            (is (= [[0]] (mt/rows (run-query-for-card-id card-id params-1))))
            (is (= [nil] (map param-vals (to-rerun card-id))))

            ;; Manually 'expire' the cache entry for the parameterized query. The cache entry is still not rerunnable,
            ;; because we only rerun parameterized queries if they've had a *cache hit* within the most recent caching
            ;; period.
            (expire-most-recent-cache-entry!)
            (is (= [nil] (map param-vals (to-rerun card-id))))

            ;; Run the parameterized query twice: once to refresh the cache, then again to generate a cache hit.
            (is (= [[0]] (mt/rows (run-query-for-card-id card-id params-1))))
            (is (= [[0]] (mt/rows (run-query-for-card-id card-id params-1))))
            ;; Manually 'expire' the cache entry again. Now the cache entry is rerunnable!
            (expire-most-recent-cache-entry!)
            (is (= [nil param-val-1] (map param-vals (to-rerun card-id))))

            ;; Run a different parameterized query thrice, to generate a cache entry and two cache hits
            (is (= [[0]] (mt/rows (run-query-for-card-id card-id params-2))))
            (is (= [[0]] (mt/rows (run-query-for-card-id card-id params-2))))
            (is (= [[0]] (mt/rows (run-query-for-card-id card-id params-2))))
            (expire-most-recent-cache-entry!)
            (is (= [nil param-val-2 param-val-1] (map param-vals (to-rerun card-id))))

            (testing "Only base query + *parameterized-queries-to-rerun-per-card* queries are returned"
              (binding [task.cache/*parameterized-queries-to-rerun-per-card* 1]
                (is (= [nil param-val-2] (map param-vals (to-rerun card-id))))))))))))

(deftest duration-base-queries-to-rerun-edge-cases-test
  (let [query-1            {:database 1}
        query-2            {:database 2}
        query-1-cache-hash (qp.util/query-hash query-1)
        query-2-cache-hash (qp.util/query-hash query-2)]
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Dashboard"}
                   :model/Card {card-id-1 :id} {:name "Cached card 1"
                                                :dataset_query query-1}
                   :model/Card {card-id-2 :id} {:name "Cached card 2"
                                                :dataset_query query-2}
                   :model/DashboardCard {} {:dashboard_id dashboard-id
                                            :card_id      card-id-1}
                   :model/DashboardCard {} {:dashboard_id dashboard-id
                                            :card_id      card-id-2}
                   :model/Query {} {:query_hash (qp.util/query-hash query-1)
                                    :average_execution_time 1
                                    :query query-1}
                   ;; The actual queries don't matter for these tests; we just care about the hash being distinct
                   :model/Query {} {:query_hash (qp.util/query-hash query-2)
                                    :average_execution_time 1
                                    :query query-2}
                   :model/QueryCache {} {:query_hash (qp.util/query-hash query-1)
                                         :updated_at (t/minus (t/offset-date-time) (t/days 1))
                                         :results    (.getBytes "cache contents" "UTF-8")}
                   :model/QueryCache {} {:query_hash (qp.util/query-hash query-2)
                                         :updated_at (t/minus (t/offset-date-time) (t/days 1))
                                         :results    (.getBytes "cache contents" "UTF-8")}]
      (let [question-cache-config-1 {:model "question" :model_id card-id-1 :config {:duration 1 :unit "hours"}}
            question-cache-config-2 {:model "question" :model_id card-id-2 :config {:duration 1 :unit "hours"}}
            dashboard-cache-config  {:model "dashboard" :model_id dashboard-id :config {:duration 1 :unit "hours"}}
            query-1-rerun-def       {:query query-1 :card-id card-id-1 :dashboard-id nil :count 1 :cache-hash (vec query-1-cache-hash)}
            query-2-rerun-def       {:query query-2 :card-id card-id-2 :dashboard-id nil :count 1 :cache-hash (vec query-2-cache-hash)}]
        (testing "Happy path: we find all queries and card IDs that should be rerun"
          (testing "Cache configs on cards"
            (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query-1)
                                                           {:card_id card-id-1})]
              (is (= [query-1-rerun-def]
                     (->> (t2/select :model/Query (@#'task.cache/duration-queries-to-rerun-honeysql
                                                   [question-cache-config-1] false))
                          (map #(update % :cache-hash vec)))))

              (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query-2)
                                                             {:card_id card-id-2})]
                (is (= (->> [query-1-rerun-def query-2-rerun-def]
                            (sort-by :card-id))
                       (->> (t2/select :model/Query (@#'task.cache/duration-queries-to-rerun-honeysql
                                                     [question-cache-config-1 question-cache-config-2] false))
                            (map #(update % :cache-hash vec))
                            (sort-by :card-id)))))))

          (testing "Cache configs on dashboards"
            (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query-1)
                                                           {:card_id card-id-1 :dashboard_id dashboard-id})
                           :model/QueryExecution {} (merge (query-execution-defaults query-2)
                                                           {:card_id card-id-2 :dashboard_id dashboard-id})]
              (is (= (->> [(assoc query-1-rerun-def :dashboard-id dashboard-id)
                           (assoc query-2-rerun-def :dashboard-id dashboard-id)]
                          (sort-by :card-id))
                     (->> (t2/select :model/Query (@#'task.cache/duration-queries-to-rerun-honeysql
                                                   [dashboard-cache-config] false))
                          (map #(update % :cache-hash vec))
                          (sort-by :card-id)))))))

        (testing "We don't rerun a query execution older than 30 days"
          (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query-1)
                                                         {:card_id card-id-1
                                                          :started_at (t/minus (t/offset-date-time) (t/days 32))})]
            (is (= [] (t2/select :model/Query (@#'task.cache/duration-queries-to-rerun-honeysql
                                               [question-cache-config-1] false))))))

        (testing "We don't rerun an errored query execution"
          (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query-1)
                                                         {:card_id card-id-1
                                                          :error "Error"})]
            (is (= [] (t2/select :model/Query (@#'task.cache/duration-queries-to-rerun-honeysql
                                               [question-cache-config-1] false))))))

        (testing "We don't rerun a sandboxed query execution"
          (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query-1)
                                                         {:card_id card-id-1
                                                          :is_sandboxed true})]
            (is (= [] (t2/select :model/Query (@#'task.cache/duration-queries-to-rerun-honeysql
                                               [question-cache-config-1] false))))))

        (testing "We don't rerun a parameterized query execution"
          (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query-1)
                                                         {:card_id card-id-1
                                                          :parameterized true})]
            (is (= [] (t2/select :model/Query (@#'task.cache/duration-queries-to-rerun-honeysql
                                               [question-cache-config-1] false))))))))))

(deftest duration-parameterized-queries-to-rerun-edge-cases-test
  (let [query-1            {:database 1}
        query-2            {:database 2}
        query-1-cache-hash (qp.util/query-hash query-1)
        query-2-cache-hash (qp.util/query-hash query-2)]
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Dashboard"}
                   :model/Card {card-id-1 :id} {:name "Cached card 1"
                                                :dataset_query query-1}
                   :model/Card {card-id-2 :id} {:name "Cached card 2"
                                                :dataset_query query-2}
                   :model/DashboardCard {} {:dashboard_id dashboard-id
                                            :card_id      card-id-1}
                   :model/DashboardCard {} {:dashboard_id dashboard-id
                                            :card_id      card-id-2}
                   :model/Query {} {:query_hash (qp.util/query-hash query-1)
                                    :average_execution_time 1
                                    :query query-1}
                   ;; The actual queries don't matter for these tests; we just care about the hash being distinct
                   :model/Query {} {:query_hash (qp.util/query-hash query-2)
                                    :average_execution_time 1
                                    :query query-2}
                   :model/QueryCache {} {:query_hash (qp.util/query-hash query-1)
                                         :updated_at (t/minus (t/offset-date-time) (t/days 1))
                                         :results    (.getBytes "cache contents" "UTF-8")}
                   :model/QueryCache {} {:query_hash (qp.util/query-hash query-2)
                                         :updated_at (t/minus (t/offset-date-time) (t/days 1))
                                         :results    (.getBytes "cache contents" "UTF-8")}]
      (let [question-cache-config-1 {:model "question" :model_id card-id-1 :config {:duration 1 :unit "hours"}}
            question-cache-config-2 {:model "question" :model_id card-id-2 :config {:duration 1 :unit "hours"}}
            dashboard-cache-config  {:model "dashboard" :model_id dashboard-id :config {:duration 1 :unit "hours"}}
            query-1-rerun-def       {:query query-1 :card-id card-id-1 :dashboard-id nil :count 1 :cache-hash (vec query-1-cache-hash)}
            query-2-rerun-def       {:query query-2 :card-id card-id-2 :dashboard-id nil :count 1 :cache-hash (vec query-2-cache-hash)}]
        (testing "Happy path: we find all parameterized queries and card IDs that should be rerun"
          (testing "Cache configs on cards"
            (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query-1)
                                                           {:card_id card-id-1
                                                            :cache_hit true
                                                            :parameterized true})]
              (is (= [query-1-rerun-def]
                     (->> (t2/select :model/Query (@#'task.cache/duration-queries-to-rerun-honeysql
                                                   [question-cache-config-1] true))
                          (map #(update % :cache-hash vec)))))

              (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query-2)
                                                             {:card_id card-id-2
                                                              :cache_hit true
                                                              :parameterized true})]
                (is (= (->> [query-1-rerun-def query-2-rerun-def]
                            (sort-by :card-id))

                       (->> (t2/select :model/Query (@#'task.cache/duration-queries-to-rerun-honeysql
                                                     [question-cache-config-1 question-cache-config-2] true))
                            (map #(update % :cache-hash vec))
                            (sort-by :card-id)))))))

          (testing "Cache configs on dashboards"
            (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query-1)
                                                           {:card_id card-id-1
                                                            :dashboard_id dashboard-id
                                                            :cache_hit true
                                                            :parameterized true})
                           :model/QueryExecution {} (merge (query-execution-defaults query-2)
                                                           {:card_id card-id-2
                                                            :dashboard_id dashboard-id
                                                            :cache_hit true
                                                            :parameterized true})]
              (is (= (->> [(assoc query-1-rerun-def :dashboard-id dashboard-id)
                           (assoc query-2-rerun-def :dashboard-id dashboard-id)]
                          (sort-by :card-id))
                     (->> (t2/select :model/Query (@#'task.cache/duration-queries-to-rerun-honeysql
                                                   [dashboard-cache-config] true))
                          (map #(update % :cache-hash vec))
                          (sort-by :card-id)))))))

        (testing "We don't rerun a query execution older than 30 days"
          (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query-1)
                                                         {:card_id card-id-1
                                                          :cache_hit true
                                                          :started_at (t/minus (t/offset-date-time) (t/days 32))})]
            (is (= [] (t2/select :model/Query (@#'task.cache/duration-queries-to-rerun-honeysql
                                               [question-cache-config-1] true))))))

        (testing "We don't rerun an errored query execution"
          (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query-1)
                                                         {:card_id card-id-1
                                                          :cache_hit true
                                                          :error "Error"})]
            (is (= [] (t2/select :model/Query (@#'task.cache/duration-queries-to-rerun-honeysql
                                               [question-cache-config-1] true))))))

        (testing "We don't rerun a sandboxed query execution"
          (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query-1)
                                                         {:card_id card-id-1
                                                          :cache_hit true
                                                          :is_sandboxed true})]
            (is (= [] (t2/select :model/Query (@#'task.cache/duration-queries-to-rerun-honeysql
                                               [question-cache-config-1] true))))))

        (testing "We don't rerun a non parameterized query execution"
          (mt/with-temp [:model/QueryExecution {} (merge (query-execution-defaults query-1)
                                                         {:card_id card-id-1
                                                          :cache_hit true
                                                          :parameterized false})]
            (is (= [] (t2/select :model/Query (@#'task.cache/duration-queries-to-rerun-honeysql
                                               [question-cache-config-1] true))))))))))

(defn- compare-query-results
  "Compares a normal query result with a query result generated after a preemptive caching job runs, and asserts
  that all relevant fields are the same."
  [original-result cached-result]
  (let [clean-col    #(dissoc % :lib/source-uuid :lib/source_uuid)
        clean-result (fn [result]
                       (-> result
                           (dissoc :running_time :average_execution_time :started_at :cached)
                           (update-in [:data :cols] #(mapv clean-col %))
                           (update-in [:data :results_metadata :columns] #(mapv clean-col %))
                           (m/dissoc-in [:json_query :cache-strategy])))]
    (is (= (clean-result original-result)
           (clean-result cached-result)))))

(defn- testing-queries
  "Queries, parameters, and expected results that we should use to test preemptive caching e2e"
  []
  [{:label "non-parameterized native query"
    :query (parameterized-native-query)
    :parameters []
    :result [[1000]]}
   {:label "parameterized native query"
    :query (parameterized-native-query)
    :parameters [{:type  :text
                  :target [:variable [:template-tag "date"]]
                  :value  "2014-05-31"}]
    :result [[2]]}
   {:label "mbql query"
    :query (mt/mbql-query venues {:aggregation [[:count]]})
    :parameters []
    :result [[100]]}])

(deftest refresh-schedule-cache-card-e2e-test
  (mt/with-premium-features #{:cache-granular-controls :cache-preemptive}
    (testing "Do we successfully execute a refresh query for a :schedule cache config on a card?\n"
      (binding [qp.util/*execute-async?*             false
                task.cache/*run-cache-refresh-async* false]
        (doseq [{:keys [label query parameters result]} (testing-queries)]
          (testing (format "\nTesting with %s:" label)
            (mt/with-temp [:model/Card {card-id :id} {:name "Cached card"
                                                      :dataset_query query}
                           :model/CacheConfig _ {:model "question"
                                                 :model_id card-id
                                                 :strategy :schedule
                                                 :refresh_automatically true
                                                 :next_run_at nil
                                                 :config {:schedule "0 0 * * * ?"}}]
              ;; Run card once to populate cache
              (let [original-result (run-query-for-card-id card-id parameters)]
                (is (= result (mt/rows original-result)))
                (let [original-cache-entry (most-recent-cache-entry)]
                  (try
                    (is (= 1 (:schedule-refreshed (@#'task.cache/refresh-cache-configs!))))
                    (@#'task.cache/refresh-cache-configs!)
                    (let [refreshed-cache-entry (most-recent-cache-entry)
                          cached-result (run-query-for-card-id card-id parameters)]
                      (is (t/before? (:updated_at original-cache-entry) (:updated_at refreshed-cache-entry)))
                      (is (= (vec (:query_hash original-cache-entry)) (vec (:query_hash refreshed-cache-entry))))
                      (compare-query-results original-result cached-result))
                    (finally
                      (delete-cache-entry! original-cache-entry))))))))))))

(deftest refresh-schedule-cache-dashboard-e2e-test
  (mt/with-premium-features #{:cache-granular-controls :cache-preemptive}
    (testing "Do we successfully execute a refresh query for a :schedule cache config on a dashboard?\n"
      (binding [qp.util/*execute-async?*             false
                task.cache/*run-cache-refresh-async* false]
        (doseq [{:keys [label query parameters result]} (testing-queries)]
          (testing (format "\nTesting with %s:" label)
            (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                           :model/Card {card-id :id} {:name "Cached card"
                                                      :dataset_query query}
                           :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id
                                                                   :card_id      card-id}
                           :model/CacheConfig _ {:model "dashboard"
                                                 :model_id dashboard-id
                                                 :strategy :schedule
                                                 :refresh_automatically true
                                                 :next_run_at nil
                                                 :config {:schedule "0 0 * * * ?"}}]
              ;; Run card once to populate cache
              (let [original-result (run-query-for-dashcard card-id dashboard-id dashcard-id parameters)]
                (is (= result (mt/rows original-result)))
                (let [original-cache-entry (most-recent-cache-entry)]
                  (try
                    (is (= 1 (:schedule-refreshed (@#'task.cache/refresh-cache-configs!))))
                    (let [refreshed-cache-entry (most-recent-cache-entry)
                          cached-result (run-query-for-dashcard card-id dashboard-id dashcard-id parameters)]
                      (is (t/before? (:updated_at original-cache-entry) (:updated_at refreshed-cache-entry)))
                      (is (= (vec (:query_hash original-cache-entry)) (vec (:query_hash refreshed-cache-entry))))
                      (compare-query-results original-result cached-result))
                    (finally
                      (delete-cache-entry! original-cache-entry))))))))))))

(deftest refresh-duration-cache-card-e2e-test
  (mt/with-premium-features #{:cache-granular-controls :cache-preemptive}
    (testing "Do we successfully execute a refresh query for a :duration cache config on a card?\n"
      (binding [qp.util/*execute-async?*             false
                task.cache/*run-cache-refresh-async* false]
        (doseq [{:keys [label query parameters result]} (testing-queries)]
          (testing (format "\nTesting with %s:" label)
            (mt/with-temp [:model/Card {card-id :id} {:name "Cached card"
                                                      :dataset_query query}
                           :model/CacheConfig _ {:model "question"
                                                 :model_id card-id
                                                 :strategy :duration
                                                 :refresh_automatically true
                                                 :config {:unit "hours" :duration 1}}]
              ;; Run card once to populate cache
              (let [original-result (run-query-for-card-id card-id parameters)]
                (is (= result (mt/rows original-result)))
                ;; Run again to register a cache hit
                (is (= result (mt/rows (run-query-for-card-id card-id parameters))))
                (let [original-cache-entry (most-recent-cache-entry)]
                  (try
                    (is (= 0 (:duration-refreshed (@#'task.cache/refresh-cache-configs!))))
                    ;; Manually expire the existing cache entry. Now the cache should be refreshable
                    (expire-cache-entry! original-cache-entry)
                    (is (= 1 (:duration-refreshed (@#'task.cache/refresh-cache-configs!))))
                    (let [refreshed-cache-entry (most-recent-cache-entry)
                          cached-result (run-query-for-card-id card-id parameters)]
                      (compare-query-results original-result cached-result)
                      (is (t/before? (:updated_at original-cache-entry) (:updated_at refreshed-cache-entry)))
                      (is (= (vec (:query_hash original-cache-entry)) (vec (:query_hash refreshed-cache-entry)))))
                    (finally
                      (delete-cache-entry! original-cache-entry))))))))))))

(deftest refresh-duration-cache-dashboard-e2e-test
  (mt/with-premium-features #{:cache-granular-controls :cache-preemptive}
    (testing "Do we successfully execute a refresh query for a :duration cache config on a dashboard?\n"
      (binding [qp.util/*execute-async?* false
                task.cache/*run-cache-refresh-async* false]
        (doseq [{:keys [label query parameters result]} (testing-queries)]
          (testing (format "\nTesting with %s:" label)
            (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                           :model/Card {card-id :id} {:name "Cached card"
                                                      :dataset_query query}
                           :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id
                                                                   :card_id      card-id}
                           :model/CacheConfig _ {:model "dashboard"
                                                 :model_id dashboard-id
                                                 :strategy :duration
                                                 :refresh_automatically true
                                                 :config {:unit "hours" :duration 1}}]
              ;; Run dashboard card once to populate cache
              (let [original-result (run-query-for-dashcard card-id dashboard-id dashcard-id parameters)]
                (is (= result (mt/rows original-result)))
                ;; Run again to register a cache hit
                (is (= result (mt/rows (run-query-for-dashcard card-id dashboard-id dashcard-id parameters))))
                (let [original-cache-entry (most-recent-cache-entry)]
                  (try
                    (is (= 0 (:duration-refreshed (@#'task.cache/refresh-cache-configs!))))
                    ;; Manually expire the existing cache entry. Now the cache should be refreshable
                    (expire-cache-entry! original-cache-entry)
                    (is (= 1 (:duration-refreshed (@#'task.cache/refresh-cache-configs!))))
                    (let [refreshed-cache-entry (most-recent-cache-entry)
                          cached-result (run-query-for-dashcard card-id dashboard-id dashcard-id parameters)]
                      (is (t/before? (:updated_at original-cache-entry) (:updated_at refreshed-cache-entry)))
                      (is (= (vec (:query_hash original-cache-entry)) (vec (:query_hash refreshed-cache-entry))))
                      (compare-query-results original-result cached-result))
                    (finally
                      (delete-cache-entry! original-cache-entry))))))))))))

(deftest cache-preemptive-feature-flag-test
  (testing "Sanity check that we are correctly enforcing the :cache-preemptive feature flags"
    (mt/with-temp [:model/Card {card-id :id} {:name "Cached card"
                                              :dataset_query (parameterized-native-query)}
                   :model/CacheConfig cc {:model "question"
                                          :model_id card-id
                                          :strategy :schedule
                                          :refresh_automatically true
                                          :config {:schedule "0 0 * * * ?"}}]
      (mt/with-premium-features #{}
        (let [call-count (atom 0)]
          (mt/with-dynamic-fn-redefs [task.cache/refresh-schedule-cache! (fn [_] (swap! call-count inc))
                                      task.cache/maybe-refresh-duration-caches! (fn [] (swap! call-count inc))]
            (@#'task.cache/refresh-cache-configs!)
            (is (= 0 @call-count))

            (mt/with-additional-premium-features #{:cache-preemptive}
              (t2/update! :model/CacheConfig (:id cc) (assoc cc :next_run_at nil))
              (is (true? (premium-features/enable-preemptive-caching?)))
              (@#'task.cache/refresh-cache-configs!)
              (is (= 2 @call-count)))))))))
